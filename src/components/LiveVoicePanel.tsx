import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  Loader2,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Send,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export type LiveVoiceName = 'Zephyr' | 'Puck' | 'Kore' | 'Fenrir' | 'Charon';

interface TranscriptTurn {
  id: string;
  role: 'user' | 'model';
  text: string;
}

interface LiveVoicePanelProps {
  compact?: boolean;
}

const VOICE_OPTIONS: { id: LiveVoiceName; label: string; tone: string }[] = [
  { id: 'Zephyr', label: 'Zephyr', tone: 'Warm & Bright' },
  { id: 'Puck', label: 'Puck', tone: 'Upbeat' },
  { id: 'Kore', label: 'Kore', tone: 'Calm & Clear' },
  { id: 'Fenrir', label: 'Fenrir', tone: 'Grounded' },
  { id: 'Charon', label: 'Charon', tone: 'Informative' },
];

const TARGET_INPUT_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

function downsampleFloat32(
  input: Float32Array,
  inputRate: number,
  targetRate: number
): Float32Array {
  if (inputRate === targetRate || inputRate <= 0) return input;
  const ratio = inputRate / targetRate;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const result = new Float32Array(outputLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.min(input.length, Math.round((offsetResult + 1) * ratio));
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer; i++) {
      accum += input[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

function float32ToPcm16Base64(samples: Float32Array): string {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64Pcm16ToFloat32(base64: string): Float32Array<ArrayBuffer> {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const sampleCount = Math.floor(bytes.length / 2);
  const float32 = new Float32Array(new ArrayBuffer(sampleCount * 4));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < sampleCount; i++) {
    float32[i] = view.getInt16(i * 2, true) / 32768;
  }
  return float32;
}

export const LiveVoicePanel: React.FC<LiveVoicePanelProps> = ({ compact = false }) => {
  const { language, setLanguage } = useAuth();
  const [status, setStatus] = useState<'idle' | 'connecting' | 'live'>('idle');
  const [voice, setVoice] = useState<LiveVoiceName>('Zephyr');
  const [micMuted, setMicMuted] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [textNudge, setTextNudge] = useState('');
  const [transcripts, setTranscripts] = useState<TranscriptTurn[]>([]);
  const [levels, setLevels] = useState<number[]>(() => new Array(16).fill(0.12));

  // Refs for callbacks to prevent stale closures inside onaudioprocess / ws.onmessage
  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const outputGainRef = useRef<GainNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const micMutedRef = useRef<boolean>(false);
  const speakerMutedRef = useRef<boolean>(false);
  const inputLevelRef = useRef<number>(0);
  const outputLevelRef = useRef<number>(0);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    micMutedRef.current = micMuted;
  }, [micMuted]);

  useEffect(() => {
    speakerMutedRef.current = speakerMuted;
    if (outputGainRef.current && outputCtxRef.current) {
      outputGainRef.current.gain.setTargetAtTime(
        speakerMuted ? 0 : 1,
        outputCtxRef.current.currentTime,
        0.02
      );
    }
  }, [speakerMuted]);

  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [transcripts]);

  // Smooth visualizer meter driven by live input/output audio RMS
  useEffect(() => {
    if (status !== 'live') {
      setLevels(new Array(16).fill(0.12));
      return;
    }
    let rafId = 0;
    const tick = (now: number) => {
      inputLevelRef.current *= 0.88;
      outputLevelRef.current *= 0.9;
      const energy = Math.max(inputLevelRef.current, outputLevelRef.current);
      const next = new Array(16).fill(0).map((_, idx) => {
        const wave = Math.sin(now * 0.008 + idx * 0.55) * 0.5 + 0.5;
        const centerWeight = 1 - Math.abs(idx - 7.5) / 9;
        return Math.min(1, Math.max(0.1, 0.1 + energy * (0.55 + wave * 0.65) * (0.45 + centerWeight * 0.7)));
      });
      setLevels(next);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [status]);

  const stopQueuedOutput = useCallback(() => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // Ignore already stopped source
      }
    }
    activeSourcesRef.current.clear();
    if (outputCtxRef.current) {
      nextStartTimeRef.current = outputCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
    outputLevelRef.current = 0;
    setIsModelSpeaking(false);
  }, []);

  const cleanupSession = useCallback(() => {
    stopQueuedOutput();

    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      try {
        processorRef.current.disconnect();
      } catch {
        // Ignore
      }
      processorRef.current = null;
    }

    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch {
        // Ignore
      }
      sourceNodeRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    if (inputCtxRef.current) {
      void inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }

    if (outputCtxRef.current) {
      void outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
    }
    outputGainRef.current = null;

    if (wsRef.current) {
      try {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
          wsRef.current.close();
        }
      } catch {
        // Ignore
      }
      wsRef.current = null;
    }

    setStatus('idle');
    setIsModelSpeaking(false);
  }, [stopQueuedOutput]);

  useEffect(() => {
    return () => cleanupSession();
  }, [cleanupSession]);

  const appendTranscript = useCallback((role: 'user' | 'model', chunk: string) => {
    const clean = chunk.replace(/\s+/g, ' ');
    if (!clean.trim()) return;
    setTranscripts((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === role) {
        const merged = `${last.text}${last.text.endsWith(' ') || clean.startsWith(' ') ? '' : ' '}${clean}`.trim();
        return [...prev.slice(0, -1), { ...last, text: merged }];
      }
      return [
        ...prev.slice(-24),
        { id: `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, role, text: clean.trim() },
      ];
    });
  }, []);

  const schedulePcm24kPlayback = useCallback((base64Audio: string) => {
    const ctx = outputCtxRef.current;
    const gain = outputGainRef.current;
    if (!ctx || !gain) return;

    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const float32 = base64Pcm16ToFloat32(base64Audio);
    if (float32.length === 0) return;

    let sumSq = 0;
    for (let i = 0; i < float32.length; i += 4) {
      sumSq += float32[i] * float32[i];
    }
    const rms = Math.sqrt(sumSq / Math.max(1, float32.length / 4));
    outputLevelRef.current = Math.min(1, rms * 3.8);

    const audioBuffer = ctx.createBuffer(1, float32.length, OUTPUT_SAMPLE_RATE);
    audioBuffer.copyToChannel(float32, 0);

    const src = ctx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(gain);

    const now = ctx.currentTime;
    const startAt = Math.max(now + 0.015, nextStartTimeRef.current);
    nextStartTimeRef.current = startAt + audioBuffer.duration;

    activeSourcesRef.current.add(src);
    setIsModelSpeaking(true);

    src.onended = () => {
      activeSourcesRef.current.delete(src);
      if (activeSourcesRef.current.size === 0) {
        setIsModelSpeaking(false);
      }
    };

    src.start(startAt);
  }, []);

  const startVoiceSession = async () => {
    if (status !== 'idle') return;
    setError(null);
    setStatus('connecting');

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access is not supported in this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const inputCtx = new AudioCtx({ sampleRate: TARGET_INPUT_RATE });
      const outputCtx = new AudioCtx({ sampleRate: OUTPUT_SAMPLE_RATE });
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;

      const gain = outputCtx.createGain();
      gain.gain.value = speakerMutedRef.current ? 0 : 1;
      gain.connect(outputCtx.destination);
      outputGainRef.current = gain;
      nextStartTimeRef.current = outputCtx.currentTime;

      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/api/live-voice?voice=${encodeURIComponent(
        voice
      )}&lang=${encodeURIComponent(language)}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data));
          if (msg.type === 'ready') {
            setStatus('live');
            setError(null);
          } else if (msg.audio) {
            schedulePcm24kPlayback(msg.audio);
          } else if (msg.interrupted) {
            stopQueuedOutput();
          } else if (msg.type === 'inputTranscript' && msg.text) {
            appendTranscript('user', msg.text);
          } else if (msg.type === 'outputTranscript' && msg.text) {
            appendTranscript('model', msg.text);
          } else if (msg.type === 'error' && msg.error) {
            setError(msg.error);
            cleanupSession();
          } else if (msg.type === 'closed') {
            cleanupSession();
          }
        } catch {
          // Ignore non-JSON frame
        }
      };

      ws.onerror = () => {
        setError('Unable to maintain a real-time WebSocket connection to Gemini Live.');
        cleanupSession();
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          cleanupSession();
        }
      };

      ws.onopen = () => {
        if (!inputCtxRef.current || !mediaStreamRef.current) return;
        const source = inputCtxRef.current.createMediaStreamSource(mediaStreamRef.current);
        const processor = inputCtxRef.current.createScriptProcessor(4096, 1, 1);

        // Route through zero-gain sink so ScriptProcessorNode fires without local mic feedback
        const silentSink = inputCtxRef.current.createGain();
        silentSink.gain.value = 0;

        processor.onaudioprocess = (ev) => {
          const activeWs = wsRef.current;
          if (!activeWs || activeWs.readyState !== WebSocket.OPEN || micMutedRef.current) {
            return;
          }
          const rawChannel = ev.inputBuffer.getChannelData(0);
          let sumSq = 0;
          for (let i = 0; i < rawChannel.length; i += 8) {
            sumSq += rawChannel[i] * rawChannel[i];
          }
          const rms = Math.sqrt(sumSq / Math.max(1, rawChannel.length / 8));
          inputLevelRef.current = Math.min(1, rms * 5.2);

          const pcmFloat = downsampleFloat32(
            rawChannel,
            inputCtxRef.current?.sampleRate || TARGET_INPUT_RATE,
            TARGET_INPUT_RATE
          );
          const base64 = float32ToPcm16Base64(pcmFloat);
          activeWs.send(JSON.stringify({ audio: base64 }));
        };

        source.connect(processor);
        processor.connect(silentSink);
        silentSink.connect(inputCtxRef.current.destination);
        sourceNodeRef.current = source;
        processorRef.current = processor;
      };
    } catch (err: any) {
      const msg =
        err?.name === 'NotAllowedError'
          ? 'Microphone permission was denied. Please allow microphone access in your browser and try again.'
          : err?.message || 'Unable to start real-time voice conversation.';
      setError(msg);
      cleanupSession();
    }
  };

  const handleSendTextNudge = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = textNudge.trim();
    if (!clean || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ text: clean }));
    appendTranscript('user', clean);
    setTextNudge('');
  };

  return (
    <div className={`flex flex-col ${compact ? 'h-full' : 'rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] overflow-hidden'}`}>
      {/* Settings Strip: Voice Persona & Language */}
      <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-sky-900/50 bg-slate-50/80 dark:bg-[#07182B] flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5">
          <AudioLines className="w-3.5 h-3.5 text-sky-500" />
          <label htmlFor="live-voice-select" className="text-slate-600 dark:text-sky-200/75 font-medium">
            Voice:
          </label>
          <select
            id="live-voice-select"
            value={voice}
            disabled={status !== 'idle'}
            onChange={(e) => setVoice(e.target.value as LiveVoiceName)}
            className="px-2 py-1 rounded-md border border-slate-300 dark:border-sky-800 bg-white dark:bg-[#0B223B] text-slate-800 dark:text-sky-100 text-xs disabled:opacity-60"
          >
            {VOICE_OPTIONS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label} ({v.tone})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1">
          {(['en', 'hi', 'hinglish'] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              disabled={status !== 'idle'}
              onClick={() => setLanguage(lang)}
              className={`px-2 py-1 rounded-md font-medium transition-colors disabled:opacity-60 ${
                language === lang
                  ? 'bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950'
                  : 'text-slate-600 dark:text-sky-200/70 hover:bg-slate-200/60 dark:hover:bg-sky-900/40'
              }`}
            >
              {lang === 'en' ? 'EN' : lang === 'hi' ? 'हिन्दी' : 'Hinglish'}
            </button>
          ))}
        </div>
      </div>

      {/* Live Audio Visualizer & Call Stage */}
      <div className="px-4 py-5 bg-gradient-to-b from-[#06182C] via-[#092340] to-[#06182C] text-sky-50 flex flex-col items-center gap-4">
        <div className="text-center space-y-1">
          <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-cyan-300">
            {status === 'live'
              ? isModelSpeaking
                ? 'EcoBot Voice Speaking'
                : micMuted
                  ? 'Microphone Muted'
                  : 'Listening in Real Time'
              : status === 'connecting'
                ? 'Connecting to Gemini Live'
                : 'Gemini Live Voice Assistant'}
          </p>
          <p className="text-xs text-sky-200/75">
            {status === 'live'
              ? 'Speak naturally — interrupt anytime for instant answers.'
              : 'Low-latency bidirectional voice powered by gemini-3.8-live.'}
          </p>
        </div>

        {/* Audio Spectrum Bars */}
        <div
          aria-hidden="true"
          className="h-14 flex items-center justify-center gap-1.5 px-4"
        >
          {levels.map((lvl, idx) => (
            <span
              key={idx}
              style={{ height: `${Math.round(lvl * 48)}px` }}
              className={`w-1.5 rounded-full transition-[height] duration-75 ${
                status === 'live'
                  ? isModelSpeaking
                    ? 'bg-cyan-400'
                    : micMuted
                      ? 'bg-slate-500'
                      : 'bg-sky-400'
                  : 'bg-sky-800/70'
              }`}
            />
          ))}
        </div>

        {/* Call Controls */}
        <div className="flex items-center gap-2.5">
          {status === 'idle' ? (
            <button
              type="button"
              onClick={() => void startVoiceSession()}
              className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-sky-950 font-semibold text-xs inline-flex items-center gap-2 shadow-lg shadow-sky-950/40 transition-colors cursor-pointer"
            >
              <PhoneCall className="w-4 h-4" />
              Start Live Voice Call
            </button>
          ) : status === 'connecting' ? (
            <button
              type="button"
              onClick={cleanupSession}
              className="px-4 py-2.5 rounded-xl bg-sky-900/80 border border-sky-700 text-sky-100 font-medium text-xs inline-flex items-center gap-2 cursor-pointer"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              Connecting... Cancel
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setMicMuted((m) => !m)}
                title={micMuted ? 'Unmute microphone' : 'Mute microphone'}
                className={`p-2.5 rounded-xl border text-xs transition-colors cursor-pointer ${
                  micMuted
                    ? 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                    : 'bg-sky-900/70 border-sky-700/80 text-sky-100 hover:bg-sky-800/80'
                }`}
              >
                {micMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={() => setSpeakerMuted((s) => !s)}
                title={speakerMuted ? 'Unmute speaker' : 'Mute speaker'}
                className={`p-2.5 rounded-xl border text-xs transition-colors cursor-pointer ${
                  speakerMuted
                    ? 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                    : 'bg-sky-900/70 border-sky-700/80 text-sky-100 hover:bg-sky-800/80'
                }`}
              >
                {speakerMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={cleanupSession}
                className="px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-400 text-white font-semibold text-xs inline-flex items-center gap-2 transition-colors cursor-pointer"
              >
                <PhoneOff className="w-4 h-4" />
                End Call
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mx-3.5 mt-3 p-2.5 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Live Transcripts */}
      <div className={`flex-1 overflow-y-auto p-3.5 space-y-2.5 ${compact ? 'min-h-[160px]' : 'min-h-[200px] max-h-[300px]'}`}>
        {transcripts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 py-6 space-y-1.5 text-slate-500 dark:text-sky-200/65">
            <p className="text-xs font-medium text-slate-700 dark:text-sky-100">
              Real-Time Voice Transcript
            </p>
            <p className="text-[11px] leading-relaxed">
              Start a voice call and ask about doorstep pickup scheduling, swollen battery safety, CPCB EPR compliance, or monthly recycling goals.
            </p>
          </div>
        ) : (
          transcripts.map((t) => (
            <div
              key={t.id}
              className={`flex flex-col ${t.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-sky-300/60 mb-0.5 px-1">
                {t.role === 'user' ? 'You' : 'EcoBot Voice'}
              </span>
              <div
                className={`max-w-[88%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                  t.role === 'user'
                    ? 'bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 font-medium'
                    : 'bg-slate-100 dark:bg-[#102D4F] text-slate-800 dark:text-sky-50 border border-slate-200 dark:border-sky-900/60'
                }`}
              >
                {t.text}
              </div>
            </div>
          ))
        )}
        <div ref={transcriptEndRef} />
      </div>

      {/* Optional Text Prompt while Live */}
      {status === 'live' && (
        <form
          onSubmit={handleSendTextNudge}
          className="p-2.5 border-t border-slate-200 dark:border-sky-900/70 bg-white dark:bg-[#091E36] flex gap-2"
        >
          <input
            type="text"
            value={textNudge}
            onChange={(e) => setTextNudge(e.target.value)}
            placeholder="Send a text follow-up to the live voice session..."
            className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-sky-900 bg-slate-50 dark:bg-[#040E1A] text-slate-900 dark:text-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          <button
            type="submit"
            disabled={!textNudge.trim()}
            aria-label="Send follow-up text"
            className="px-3 py-1.5 rounded-lg bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      )}
    </div>
  );
};
