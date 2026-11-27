import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  FileAudio,
  Loader2,
  Mic,
  Square,
  Trash2,
  Upload,
  Volume2,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';

function pickSupportedRecorderMime(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read recorded audio data.'));
    reader.readAsDataURL(blob);
  });
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/* -------------------- Inline Microphone Transcribe Button -------------------- */
interface MicTranscribeButtonProps {
  language?: 'en' | 'hi' | 'hinglish';
  disabled?: boolean;
  onTranscribed: (text: string) => void;
  onError?: (message: string) => void;
}

export const MicTranscribeButton: React.FC<MicTranscribeButtonProps> = ({
  language = 'en',
  disabled = false,
  onTranscribed,
  onError,
}) => {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const cleanupMedia = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
  };

  useEffect(() => {
    return () => cleanupMedia();
  }, []);

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setRecording(false);
  };

  const startRecording = async () => {
    if (disabled || transcribing) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onError?.('Microphone audio recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mime = pickSupportedRecorderMime();
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        const finalMime = recorder.mimeType || mime || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: finalMime });
        cleanupMedia();

        if (blob.size < 256) {
          onError?.('Recording was too short. Hold and speak clearly for at least 1 second.');
          return;
        }

        setTranscribing(true);
        try {
          const audioBase64 = await blobToBase64(blob);
          const res = await apiFetch<{ transcript?: string; model?: string }>(
            '/api/ai/transcribe',
            {
              method: 'POST',
              body: JSON.stringify({
                audioBase64,
                mimeType: finalMime,
                language,
              }),
            },
            false
          );
          const text = (res?.transcript || '').trim();
          if (!text) {
            onError?.('No speech was detected in the recording.');
          } else {
            onTranscribed(text);
          }
        } catch (err: any) {
          onError?.(err?.message || 'Unable to transcribe audio right now.');
        } finally {
          setTranscribing(false);
          setSeconds(0);
        }
      };

      recorder.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    } catch (err: any) {
      cleanupMedia();
      onError?.(
        err?.name === 'NotAllowedError'
          ? 'Microphone permission was denied. Please allow microphone access to dictate.'
          : err?.message || 'Could not access microphone.'
      );
    }
  };

  return (
    <button
      type="button"
      disabled={disabled || transcribing}
      onClick={() => (recording ? stopRecording() : void startRecording())}
      title={
        recording
          ? 'Stop recording and transcribe (gemini-3.5-transcribe)'
          : 'Dictate with microphone (gemini-3.5-transcribe)'
      }
      aria-label={recording ? 'Stop recording' : 'Record audio to transcribe'}
      className={`px-2.5 py-2 rounded-lg border transition-colors inline-flex items-center gap-1.5 text-xs font-medium shrink-0 cursor-pointer disabled:opacity-50 ${
        recording
          ? 'bg-red-600 border-red-500 text-white hover:bg-red-700'
          : 'bg-slate-50 dark:bg-[#040E1A] border-slate-300 dark:border-sky-900 text-slate-600 dark:text-sky-200 hover:border-sky-500 hover:text-sky-600 dark:hover:text-sky-300'
      }`}
    >
      {transcribing ? (
        <Loader2 className="w-4 h-4 animate-spin text-sky-500" />
      ) : recording ? (
        <>
          <Square className="w-3.5 h-3.5 fill-current" />
          <span className="font-mono tabular-nums text-[11px]">{formatDuration(seconds)}</span>
        </>
      ) : (
        <Mic className="w-4 h-4" />
      )}
    </button>
  );
};

/* -------------------- Full Audio Transcription Studio Panel -------------------- */
interface TranscriptRecord {
  id: string;
  text: string;
  source: 'microphone' | 'upload';
  fileName?: string;
  language: 'en' | 'hi' | 'hinglish';
  model: string;
  createdAt: string;
}

export const AudioTranscriberPanel: React.FC = () => {
  const { language, setLanguage } = useAuth();
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [lastModel, setLastModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [history, setHistory] = useState<TranscriptRecord[]>([]);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopMeterAndMedia = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
    setAudioLevel(0);
  };

  useEffect(() => {
    return () => {
      stopMeterAndMedia();
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    };
  }, [audioPreviewUrl]);

  const sendForTranscription = async (
    blob: Blob,
    mimeType: string,
    source: 'microphone' | 'upload',
    fileName?: string
  ) => {
    setError(null);
    setTranscribing(true);

    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    setAudioPreviewUrl(URL.createObjectURL(blob));

    try {
      const audioBase64 = await blobToBase64(blob);
      const res = await apiFetch<{ transcript?: string; model?: string }>(
        '/api/ai/transcribe',
        {
          method: 'POST',
          body: JSON.stringify({
            audioBase64,
            mimeType,
            language,
          }),
        },
        false
      );

      const text = (res?.transcript || '').trim();
      if (!text) {
        throw new Error('No speech was detected in the audio. Please try speaking closer to the mic.');
      }

      const usedModel = res?.model || 'gemini-3.5-transcribe';
      setTranscript(text);
      setLastModel(usedModel);
      setHistory((prev) => [
        {
          id: `tr_${Date.now()}`,
          text,
          source,
          fileName,
          language,
          model: usedModel,
          createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
        ...prev.slice(0, 9),
      ]);
    } catch (err: any) {
      setError(err?.message || 'Unable to transcribe audio right now.');
    } finally {
      setTranscribing(false);
    }
  };

  const startRecording = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Microphone recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      // Live input volume visualizer
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          setAudioLevel(Math.min(1, rms * 4.5));
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      }

      const mime = pickSupportedRecorderMime();
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        const finalMime = recorder.mimeType || mime || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: finalMime });
        stopMeterAndMedia();

        if (blob.size < 256) {
          setError('Recording was too short. Please speak for at least 1 second.');
          return;
        }
        void sendForTranscription(blob, finalMime, 'microphone');
      };

      recorder.start();
      setRecording(true);
      setDurationSec(0);
      timerRef.current = window.setInterval(() => {
        setDurationSec((s) => s + 1);
      }, 1000);
    } catch (err: any) {
      stopMeterAndMedia();
      setError(
        err?.name === 'NotAllowedError'
          ? 'Microphone access was denied. Enable microphone permissions in your browser settings.'
          : err?.message || 'Unable to start microphone recording.'
      );
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setRecording(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('Audio file exceeds 10 MB limit. Please upload a shorter clip.');
      return;
    }
    const mime = file.type || 'audio/mp3';
    void sendForTranscription(file, mime, 'upload', file.name);
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-2xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900 dark:text-sky-50 inline-flex items-center gap-2">
              <Mic className="w-4 h-4 text-sky-500" />
              Audio Transcription Studio
            </h3>
            <p className="text-xs text-slate-600 dark:text-sky-200/75 max-w-2xl">
              Record voice notes with your microphone or upload audio clips (e.g., field collection logs, device inventories, or pickup instructions) for accurate speech-to-text transcription powered by{' '}
              <span className="font-mono text-sky-700 dark:text-sky-300">gemini-3.5-transcribe</span>.
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-sky-900/70 p-1 bg-slate-50 dark:bg-[#061526] text-xs">
            {(['en', 'hi', 'hinglish'] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setLanguage(lang)}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  language === lang
                    ? 'bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950'
                    : 'text-slate-600 dark:text-sky-200/70 hover:bg-slate-200/60 dark:hover:bg-sky-900/40'
                }`}
              >
                {lang === 'en' ? 'English' : lang === 'hi' ? 'हिन्दी' : 'Hinglish'}
              </button>
            ))}
          </div>
        </div>

        {/* Recorder Console */}
        <div className="p-5 rounded-xl border border-slate-200 dark:border-sky-900/70 bg-slate-50/80 dark:bg-[#061526] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              disabled={transcribing}
              onClick={() => (recording ? stopRecording() : void startRecording())}
              className={`h-12 px-5 rounded-xl font-semibold text-sm inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-60 ${
                recording
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-sky-600 dark:bg-sky-500 hover:bg-sky-700 dark:hover:bg-sky-400 text-white dark:text-sky-950'
              }`}
            >
              {transcribing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Transcribing...
                </>
              ) : recording ? (
                <>
                  <Square className="w-4 h-4 fill-current" />
                  Stop &amp; Transcribe
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4" />
                  Record from Microphone
                </>
              )}
            </button>

            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-sky-100">
                {recording ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span>Recording</span>
                    <span className="font-mono tabular-nums text-red-600 dark:text-red-400">
                      {formatDuration(durationSec)}
                    </span>
                  </>
                ) : transcribing ? (
                  <span className="text-sky-700 dark:text-sky-300">
                    Processing speech with gemini-3.5-transcribe...
                  </span>
                ) : (
                  <span>Ready to capture voice input</span>
                )}
              </div>

              {/* Live Input Level Bars */}
              <div className="flex items-end gap-1 h-4" aria-hidden="true">
                {Array.from({ length: 14 }).map((_, idx) => {
                  const threshold = (idx + 1) / 14;
                  const active = recording && audioLevel >= threshold * 0.85;
                  return (
                    <span
                      key={idx}
                      className={`w-1.5 rounded-sm transition-all duration-75 ${
                        active
                          ? 'bg-sky-500 dark:bg-cyan-400'
                          : 'bg-slate-200 dark:bg-sky-900/70'
                      }`}
                      style={{ height: `${Math.max(25, ((idx % 5) + 2) * 16)}%` }}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/webm,audio/mp3,audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/m4a,audio/aac,audio/flac"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              disabled={recording || transcribing}
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-sky-800 bg-white dark:bg-[#0B223B] text-xs font-semibold text-slate-700 dark:text-sky-100 hover:border-sky-500 disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-sky-500" />
              Upload Audio File
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {audioPreviewUrl && (
          <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-slate-50/60 dark:bg-[#061526]">
            <Volume2 className="w-4 h-4 text-sky-500 shrink-0" />
            <audio controls src={audioPreviewUrl} className="w-full h-8" />
          </div>
        )}

        {/* Active Transcript Output */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-sky-100">
              Transcribed Text {lastModel ? `(${lastModel})` : ''}
            </label>
            <div className="flex items-center gap-2">
              {transcript && (
                <>
                  <button
                    type="button"
                    onClick={() => handleCopy('active', transcript)}
                    className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-sky-800 text-xs text-slate-600 dark:text-sky-200 hover:border-sky-500 inline-flex items-center gap-1 cursor-pointer"
                  >
                    {copiedId === 'active' ? (
                      <Check className="w-3.5 h-3.5 text-sky-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copiedId === 'active' ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTranscript('')}
                    className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-sky-800 text-xs text-slate-500 dark:text-sky-300/70 hover:text-red-500 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear
                  </button>
                </>
              )}
            </div>
          </div>
          <textarea
            rows={5}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Record with your microphone or upload an audio clip to see the verbatim transcription here. You can also edit or copy the text."
            className="w-full p-3.5 rounded-xl border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-sm text-slate-900 dark:text-sky-50 leading-relaxed focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
      </div>

      {/* Session Transcription History */}
      {history.length > 0 && (
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-3">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50">
            Recent Transcriptions ({history.length})
          </h4>
          <div className="space-y-2.5">
            {history.map((item) => (
              <div
                key={item.id}
                className="p-3.5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-slate-50/70 dark:bg-[#061526] space-y-2"
              >
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-sky-300/70">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    {item.source === 'microphone' ? (
                      <Mic className="w-3 h-3 text-sky-500" />
                    ) : (
                      <FileAudio className="w-3 h-3 text-sky-500" />
                    )}
                    {item.source === 'microphone'
                      ? 'Microphone Recording'
                      : item.fileName || 'Uploaded Audio'}
                    <span>·</span>
                    <span className="font-mono">{item.model}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span>{item.createdAt}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(item.id, item.text)}
                      className="text-sky-700 dark:text-sky-300 hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      {copiedId === item.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copiedId === item.id ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-800 dark:text-sky-100 leading-relaxed whitespace-pre-wrap">
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
