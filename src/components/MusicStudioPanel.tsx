import React, { useRef, useState } from 'react';
import {
  Disc3,
  Download,
  ImagePlus,
  Loader2,
  Music,
  Sparkles,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { MicTranscribeButton } from './AudioTranscriber';

type TrackMode = 'clip' | 'pro';

interface GeneratedTrack {
  id: string;
  audioDataUrl: string;
  mimeType: string;
  lyrics: string;
  model: string;
  trackType: TrackMode;
  prompt: string;
  createdAt: string;
}

const MUSIC_PRESETS = [
  {
    label: 'Eco Documentary Underscore',
    prompt:
      'Uplifting modern documentary soundtrack with warm acoustic piano, gentle marimba arpeggios, soft strings, and subtle electronic pulse evoking urban sustainability and clean energy, 108 BPM.',
  },
  {
    label: 'Circuit Rush Arcade Synthwave',
    prompt:
      'Energetic retro-futuristic synthwave instrumental with crisp bassline, glowing arpeggiated leads, and punchy drums for an electronics recycling arcade game, 124 BPM.',
  },
  {
    label: 'Earth Day Campaign Anthem',
    prompt:
      'Inspiring indie pop campaign jingle with acoustic guitar, handclaps, bright synth pads, and optimistic hopeful lyrics about recycling old technology to protect the planet.',
  },
  {
    label: 'Zero-Waste Ambient Focus',
    prompt:
      'Calm atmospheric ambient electronic track with shimmering harmonic pads, organic water droplets, and soft Rhodes chords for a sustainability analytics dashboard.',
  },
];

function fileToBase64(file: Blob): Promise<{ base64: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = dataUrl.indexOf(',');
      if (commaIdx < 0) {
        reject(new Error('Could not encode reference image.'));
        return;
      }
      resolve({ base64: dataUrl.slice(commaIdx + 1), dataUrl });
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

export const MusicStudioPanel: React.FC = () => {
  const { language } = useAuth();
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const [trackType, setTrackType] = useState<TrackMode>('clip');
  const [prompt, setPrompt] = useState(MUSIC_PRESETS[0].prompt);
  const [refImageBase64, setRefImageBase64] = useState<string | null>(null);
  const [refImageMime, setRefImageMime] = useState<'image/jpeg' | 'image/png' | 'image/webp'>('image/jpeg');
  const [refImagePreview, setRefImagePreview] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tracks, setTracks] = useState<GeneratedTrack[]>([]);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);

  const activeTrack = tracks.find((t) => t.id === activeTrackId) || tracks[0] || null;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Please upload a JPEG, PNG, or WebP reference image.');
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setError('Reference image must be under 6 MB.');
      return;
    }
    try {
      const { base64, dataUrl } = await fileToBase64(file);
      setRefImageBase64(base64);
      setRefImageMime(file.type as 'image/jpeg' | 'image/png' | 'image/webp');
      setRefImagePreview(dataUrl);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Unable to load reference image.');
    }
  };

  const handleGenerateMusic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) {
      setError('Enter a description of the genre, instruments, mood, or tempo.');
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const res = await apiFetch<{
        audioDataUrl: string;
        mimeType: string;
        lyrics: string;
        model: string;
        trackType: TrackMode;
      }>(
        '/api/ai/generate-music',
        {
          method: 'POST',
          body: JSON.stringify({
            prompt: prompt.trim(),
            trackType,
            ...(refImageBase64 ? { imageBase64: refImageBase64, mimeType: refImageMime } : {}),
          }),
        },
        false
      );

      const newTrack: GeneratedTrack = {
        id: `track_${Date.now()}`,
        audioDataUrl: res.audioDataUrl,
        mimeType: res.mimeType || 'audio/mpeg',
        lyrics: res.lyrics || '',
        model: res.model,
        trackType: res.trackType,
        prompt: prompt.trim(),
        createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setTracks((prev) => [newTrack, ...prev].slice(0, 8));
      setActiveTrackId(newTrack.id);
    } catch (err: any) {
      setError(err?.message || 'Unable to generate music track right now.');
    } finally {
      setGenerating(false);
    }
  };

  const extFromMime = (mime: string) => {
    if (mime.includes('wav')) return 'wav';
    if (mime.includes('ogg')) return 'ogg';
    return 'mp3';
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Composer Form */}
        <form
          onSubmit={(e) => void handleGenerateMusic(e)}
          className="lg:col-span-7 p-6 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50 inline-flex items-center gap-2">
                <Music className="w-4 h-4 text-sky-500" />
                Lyria Eco-Soundtrack Studio
              </h4>
              <p className="text-xs text-slate-600 dark:text-sky-200/70 mt-1">
                Compose original campaign jingles, documentary underscores, or game soundtracks using{' '}
                <code className="font-mono text-[11px] text-sky-700 dark:text-sky-300">lyria-3-clip-preview</code> (30s) or{' '}
                <code className="font-mono text-[11px] text-sky-700 dark:text-sky-300">lyria-3-pro-preview</code> (full-length).
              </p>
            </div>
          </div>

          {/* Model Length Switch */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setTrackType('clip')}
              className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                trackType === 'clip'
                  ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/60'
                  : 'border-slate-200 dark:border-sky-900/60 bg-slate-50/70 dark:bg-[#061526] hover:border-sky-400/60'
              }`}
            >
              <p className="text-xs font-semibold text-slate-900 dark:text-sky-50">
                30s Short Clip
              </p>
              <p className="text-[11px] font-mono text-sky-700 dark:text-sky-300 mt-0.5">
                lyria-3-clip-preview
              </p>
              <p className="text-[11px] text-slate-500 dark:text-sky-200/65 mt-0.5">
                Fast reels, social posts &amp; campaign jingles
              </p>
            </button>

            <button
              type="button"
              onClick={() => setTrackType('pro')}
              className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                trackType === 'pro'
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50'
                  : 'border-slate-200 dark:border-sky-900/60 bg-slate-50/70 dark:bg-[#061526] hover:border-emerald-400/60'
              }`}
            >
              <p className="text-xs font-semibold text-slate-900 dark:text-sky-50">
                Full-Length Track
              </p>
              <p className="text-[11px] font-mono text-emerald-700 dark:text-emerald-300 mt-0.5">
                lyria-3-pro-preview
              </p>
              <p className="text-[11px] text-slate-500 dark:text-sky-200/65 mt-0.5">
                Complete multi-section songs &amp; documentaries
              </p>
            </button>
          </div>

          {/* Preset Prompt Pills */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-slate-500 dark:text-sky-200/65">
              Quick Eco-Audio Presets
            </p>
            <div className="flex flex-wrap gap-1.5">
              {MUSIC_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setPrompt(preset.prompt)}
                  className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-slate-200 dark:border-sky-800/80 bg-slate-50 dark:bg-[#061526] text-slate-700 dark:text-sky-200 hover:border-sky-500 transition-colors cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Prompt Textarea + Mic Dictation */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="lyria-music-prompt" className="text-xs font-medium text-slate-700 dark:text-sky-200/85">
                Music Prompt (genre, mood, instruments, tempo, or lyrics)
              </label>
              <MicTranscribeButton
                language={language}
                disabled={generating}
                onTranscribed={(text) =>
                  setPrompt((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text))
                }
                onError={(msg) => setError(msg)}
              />
            </div>
            <textarea
              id="lyria-music-prompt"
              rows={4}
              required
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the genre, instruments, energy, BPM, and whether you want vocals or instrumental..."
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50 leading-relaxed"
            />
          </div>

          {/* Optional Reference Image Upload */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2.5">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => void handleImageUpload(e)}
              />
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-sky-800 text-slate-700 dark:text-sky-200 hover:border-sky-500 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <ImagePlus className="w-3.5 h-3.5 text-sky-500" />
                {refImagePreview ? 'Change Inspiration Image' : 'Add Inspiration Image (Optional)'}
              </button>
              {refImagePreview && (
                <div className="inline-flex items-center gap-2">
                  <img
                    src={refImagePreview}
                    alt="Music inspiration preview"
                    className="w-9 h-9 rounded-md object-cover border border-slate-200 dark:border-sky-800"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setRefImageBase64(null);
                      setRefImagePreview(null);
                    }}
                    className="p-1 text-slate-400 hover:text-red-500 cursor-pointer"
                    aria-label="Remove inspiration image"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={generating || !prompt.trim()}
              className="px-5 py-2.5 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 hover:bg-sky-700 dark:hover:bg-sky-400 disabled:opacity-60 inline-flex items-center gap-2 transition-colors cursor-pointer"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Composing with Lyria...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate {trackType === 'pro' ? 'Full Track' : '30s Clip'}
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="p-3.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/35 text-xs text-amber-900 dark:text-amber-200">
              {error}
            </div>
          )}
        </form>

        {/* Audio Playback & Lyrics Deck */}
        <div className="lg:col-span-5 p-6 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50 inline-flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-emerald-500" />
              Generated Soundtrack Deck
            </h4>
            {activeTrack && (
              <span className="font-mono text-[11px] text-sky-700 dark:text-sky-300">
                {activeTrack.model}
              </span>
            )}
          </div>

          {activeTrack ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-sky-50">
                      {activeTrack.trackType === 'pro' ? 'Full-Length Track' : '30-Second Clip'} ·{' '}
                      {activeTrack.createdAt}
                    </p>
                    <p className="text-[11px] text-slate-600 dark:text-sky-200/70 line-clamp-2 mt-0.5">
                      {activeTrack.prompt}
                    </p>
                  </div>
                </div>

                <audio
                  key={activeTrack.id}
                  controls
                  src={activeTrack.audioDataUrl}
                  className="w-full"
                />

                <div className="flex items-center justify-between gap-2 pt-1">
                  <a
                    href={activeTrack.audioDataUrl}
                    download={`reboot-earth-${activeTrack.trackType}-${activeTrack.id}.${extFromMime(activeTrack.mimeType)}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950 hover:bg-emerald-700 dark:hover:bg-emerald-400 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Audio
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setTracks((prev) => prev.filter((t) => t.id !== activeTrack.id));
                      setActiveTrackId(null);
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 cursor-pointer"
                    title="Remove track from session"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {activeTrack.lyrics && (
                <div className="p-3.5 rounded-lg border border-slate-200 dark:border-sky-900/60 bg-slate-50/70 dark:bg-[#061526] space-y-1.5 max-h-48 overflow-y-auto">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-sky-300/75">
                    Generated Lyrics &amp; Production Notes
                  </p>
                  <p className="text-xs text-slate-700 dark:text-sky-100/85 whitespace-pre-wrap leading-relaxed">
                    {activeTrack.lyrics}
                  </p>
                </div>
              )}

              {tracks.length > 1 && (
                <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-sky-900/60">
                  <p className="text-[11px] font-medium text-slate-500 dark:text-sky-200/65">
                    Session Tracks ({tracks.length})
                  </p>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {tracks.map((track) => (
                      <button
                        key={track.id}
                        type="button"
                        onClick={() => setActiveTrackId(track.id)}
                        className={`w-full px-3 py-2 rounded-lg border text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          track.id === activeTrack.id
                            ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/60 text-sky-900 dark:text-sky-100'
                            : 'border-slate-200 dark:border-sky-900/50 text-slate-600 dark:text-sky-200/75 hover:border-sky-400/50'
                        }`}
                      >
                        <span className="truncate">{track.prompt}</span>
                        <span className="font-mono text-[10px] shrink-0 text-slate-400">
                          {track.trackType === 'pro' ? 'PRO' : '30s'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-12 px-4 rounded-xl border border-dashed border-slate-300 dark:border-sky-900/70 text-center space-y-2">
              <Disc3 className="w-8 h-8 text-sky-500/60 mx-auto" />
              <p className="text-xs font-medium text-slate-800 dark:text-sky-100">
                No audio track generated yet
              </p>
              <p className="text-[11px] text-slate-500 dark:text-sky-200/65 max-w-xs mx-auto">
                Choose a 30-second clip or full-length track on the left and click Generate to stream encoded audio ready for playback and download.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
