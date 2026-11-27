import React, { useEffect, useRef, useState } from 'react';
import {
  Clapperboard,
  Download,
  Film,
  ImagePlus,
  Loader2,
  RectangleHorizontal,
  RectangleVertical,
  RefreshCw,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { MicTranscribeButton } from './AudioTranscriber';

type AspectRatioOption = '16:9' | '9:16';
type DurationOption = '5s' | '8s' | '10s';
type ResolutionOption = '720p' | '1080p';

interface AnimatedClipRecord {
  id: string;
  interactionId: string;
  mediaUrl: string;
  aspectRatio: AspectRatioOption;
  duration: DurationOption;
  resolution: ResolutionOption;
  prompt: string;
  sourcePreviewUrl?: string;
  createdAt: string;
}

const SAMPLE_PHOTOS = [
  {
    label: 'Recycling Facility',
    url: '/src/assets/images/facility_recycling_hub_1795259315861.jpg',
    defaultPrompt:
      'Slow cinematic dolly-in through the modern e-waste recycling facility with warm sunlight drifting across clean sorting stations and subtle ambient motion.',
  },
  {
    label: 'Refurbishment Lab',
    url: '/src/assets/images/refurbishment_lab_1795259340405.jpg',
    defaultPrompt:
      'Smooth orbital camera pan over the electronics refurbishment workstation as indicator LEDs softly shimmer and technicians inspect hardware.',
  },
  {
    label: 'Circuit Material Recovery',
    url: '/src/assets/images/material_recovery_macro_1795259341769.jpg',
    defaultPrompt:
      'Macro slow-motion rack focus gliding across recovered copper traces and recycled circuit components with crisp studio reflections.',
  },
];

const MOTION_PRESETS = [
  {
    label: 'Cinematic Dolly-In',
    prompt:
      'Slow cinematic dolly-in with natural daylight shifts, subtle dust motes in the air, and steady gimbal stabilization.',
  },
  {
    label: '360° Showcase Pan',
    prompt:
      'Smooth gentle orbital camera pan around the main subject with crisp depth-of-field and realistic lighting reflections.',
  },
  {
    label: 'Vertical Eco-Reel Reveal',
    prompt:
      'Dynamic upward tilt reveal designed for a sustainability awareness reel with crisp motion and vibrant natural colors.',
  },
];

function fileToBase64(file: Blob): Promise<{ base64: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = dataUrl.indexOf(',');
      if (commaIdx < 0) {
        reject(new Error('Could not encode uploaded photo.'));
        return;
      }
      resolve({ base64: dataUrl.slice(commaIdx + 1), dataUrl });
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const ImageToVideoPanel: React.FC = () => {
  const { language } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const elapsedTimerRef = useRef<number | null>(null);

  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoMime, setPhotoMime] = useState<'image/jpeg' | 'image/png' | 'image/webp'>('image/jpeg');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string>('');
  const [dragActive, setDragActive] = useState(false);

  const [aspectRatio, setAspectRatio] = useState<AspectRatioOption>('16:9');
  const [duration, setDuration] = useState<DurationOption>('8s');
  const [resolution, setResolution] = useState<ResolutionOption>('720p');
  const [prompt, setPrompt] = useState(
    'Slow cinematic camera push-in bringing this scene to life with realistic ambient light and gentle natural movement.'
  );
  const [followUpPrompt, setFollowUpPrompt] = useState('');

  const [generating, setGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [activeClip, setActiveClip] = useState<AnimatedClipRecord | null>(null);
  const [clips, setClips] = useState<AnimatedClipRecord[]>([]);

  const stopTimers = () => {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (elapsedTimerRef.current !== null) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopTimers();
  }, []);

  const loadImageBlob = async (blob: Blob, name: string) => {
    setError(null);
    const rawMime = (blob.type || 'image/jpeg').toLowerCase();
    const allowed: ('image/jpeg' | 'image/png' | 'image/webp')[] = [
      'image/jpeg',
      'image/png',
      'image/webp',
    ];
    const normalizedMime = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime;
    if (!allowed.includes(normalizedMime as any)) {
      setError('Please upload a JPEG, PNG, or WebP photo.');
      return;
    }
    if (blob.size > 10 * 1024 * 1024) {
      setError('Photo exceeds the 10 MB size limit. Please choose a smaller image.');
      return;
    }

    try {
      const { base64, dataUrl } = await fileToBase64(blob);
      setPhotoBase64(base64);
      setPhotoMime(normalizedMime as 'image/jpeg' | 'image/png' | 'image/webp');
      setPhotoPreview(dataUrl);
      setPhotoName(name);
    } catch (err: any) {
      setError(err?.message || 'Unable to load selected photo.');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void loadImageBlob(file, file.name);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void loadImageBlob(file, file.name);
    }
  };

  const handleLoadSample = async (sample: (typeof SAMPLE_PHOTOS)[number]) => {
    setError(null);
    try {
      const resp = await fetch(sample.url);
      if (!resp.ok) throw new Error('Could not load sample photo.');
      const blob = await resp.blob();
      await loadImageBlob(blob, `${sample.label}.jpg`);
      setPrompt(sample.defaultPrompt);
    } catch (err: any) {
      setError(err?.message || 'Unable to load sample photo.');
    }
  };

  const pollInteraction = (
    interactionId: string,
    meta: {
      aspectRatio: AspectRatioOption;
      duration: DurationOption;
      resolution: ResolutionOption;
      prompt: string;
      sourcePreviewUrl?: string;
    }
  ) => {
    const check = async () => {
      try {
        const statusRes = await apiFetch<{
          interactionId: string;
          status: string;
          done: boolean;
          failed: boolean;
          videoReady: boolean;
          mediaUrl?: string;
          error?: string;
        }>(`/api/ai/animate-video/${encodeURIComponent(interactionId)}`, {}, false);

        if (statusRes.failed) {
          stopTimers();
          setGenerating(false);
          setStatusMessage('');
          setError(statusRes.error || 'Video generation failed. Please try again.');
          return;
        }

        if (statusRes.done && statusRes.videoReady && statusRes.mediaUrl) {
          stopTimers();
          const newClip: AnimatedClipRecord = {
            id: `clip_${Date.now()}`,
            interactionId,
            mediaUrl: `${statusRes.mediaUrl}?t=${Date.now()}`,
            aspectRatio: meta.aspectRatio,
            duration: meta.duration,
            resolution: meta.resolution,
            prompt: meta.prompt,
            sourcePreviewUrl: meta.sourcePreviewUrl,
            createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
          setActiveClip(newClip);
          setClips((prev) => [newClip, ...prev.slice(0, 5)]);
          setGenerating(false);
          setStatusMessage('');
          return;
        }

        setStatusMessage(
          `Generating ${meta.aspectRatio} ${meta.resolution} video via gemini-omni-1.2-flash (${statusRes.status.replace(/_/g, ' ')})...`
        );
        pollTimerRef.current = window.setTimeout(check, 4000);
      } catch (err: any) {
        stopTimers();
        setGenerating(false);
        setStatusMessage('');
        setError(err?.message || 'Lost connection while polling video generation.');
      }
    };

    pollTimerRef.current = window.setTimeout(check, 3500);
  };

  const startGeneration = async (opts?: { previousInteractionId?: string; overridePrompt?: string }) => {
    const isFollowUp = Boolean(opts?.previousInteractionId);
    if (!isFollowUp && !photoBase64) {
      setError('Upload a photo or choose a sample image first.');
      return;
    }

    const usedPrompt = (opts?.overridePrompt ?? prompt).trim();
    if (!usedPrompt) {
      setError('Enter a motion prompt or dictate one using the microphone button.');
      return;
    }

    stopTimers();
    setError(null);
    setGenerating(true);
    setElapsedSec(0);
    setStatusMessage(
      isFollowUp
        ? 'Submitting multi-turn video edit/extension to gemini-omni-1.2-flash...'
        : 'Uploading frame and starting Interactions API video job (gemini-omni-1.2-flash)...'
    );

    elapsedTimerRef.current = window.setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);

    try {
      const startRes = await apiFetch<{
        interactionId: string;
        status: string;
        done: boolean;
        failed: boolean;
        videoReady: boolean;
        mediaUrl?: string;
        error?: string;
      }>(
        '/api/ai/animate-video',
        {
          method: 'POST',
          body: JSON.stringify({
            imageBase64: isFollowUp ? undefined : photoBase64,
            mimeType: isFollowUp ? undefined : photoMime,
            prompt: usedPrompt,
            aspectRatio,
            duration,
            resolution,
            previousInteractionId: opts?.previousInteractionId,
          }),
        },
        false
      );

      if (startRes.failed) {
        throw new Error(startRes.error || 'Video generation could not be started.');
      }

      if (startRes.done && startRes.videoReady && startRes.mediaUrl) {
        stopTimers();
        const newClip: AnimatedClipRecord = {
          id: `clip_${Date.now()}`,
          interactionId: startRes.interactionId,
          mediaUrl: `${startRes.mediaUrl}?t=${Date.now()}`,
          aspectRatio,
          duration,
          resolution,
          prompt: usedPrompt,
          sourcePreviewUrl: photoPreview || undefined,
          createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setActiveClip(newClip);
        setClips((prev) => [newClip, ...prev.slice(0, 5)]);
        setGenerating(false);
        setStatusMessage('');
        if (isFollowUp) setFollowUpPrompt('');
        return;
      }

      if (isFollowUp) setFollowUpPrompt('');
      setStatusMessage(
        `Rendering ${aspectRatio} (${aspectRatio === '16:9' ? 'Landscape' : 'Portrait'}) video with gemini-omni-1.2-flash...`
      );
      pollInteraction(startRes.interactionId, {
        aspectRatio,
        duration,
        resolution,
        prompt: usedPrompt,
        sourcePreviewUrl: photoPreview || undefined,
      });
    } catch (err: any) {
      stopTimers();
      setGenerating(false);
      setStatusMessage('');
      setError(err?.message || 'Unable to generate video right now.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-2xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900 dark:text-sky-50 inline-flex items-center gap-2">
              <Clapperboard className="w-4 h-4 text-sky-500" />
              Photo-to-Video Animation Studio
            </h3>
            <p className="text-xs text-slate-600 dark:text-sky-200/75 max-w-2xl">
              Upload any photo of collected electronics, recycling facilities, or campaign visuals and animate it into a smooth{' '}
              <strong className="text-slate-800 dark:text-sky-100">16:9 Landscape</strong> or{' '}
              <strong className="text-slate-800 dark:text-sky-100">9:16 Portrait</strong> video powered by{' '}
              <span className="font-mono text-sky-700 dark:text-sky-300">gemini-omni-1.2-flash</span> via the Gemini Interactions API.
            </p>
          </div>
          <span className="text-[11px] font-mono px-2.5 py-1 rounded-md border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300">
            Interactions API · Omni Flash
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Photo Upload + Controls */}
          <div className="lg:col-span-6 space-y-5">
            {/* Dropzone */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-800 dark:text-sky-100">
                  1. Starting Frame Photo
                </label>
                {photoPreview && (
                  <button
                    type="button"
                    disabled={generating}
                    onClick={() => {
                      setPhotoBase64(null);
                      setPhotoPreview(null);
                      setPhotoName('');
                    }}
                    className="text-[11px] text-slate-500 dark:text-sky-300/75 hover:text-red-500 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3 h-3" />
                    Remove
                  </button>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                onClick={() => !generating && fileInputRef.current?.click()}
                className={`relative rounded-xl border-2 border-dashed transition-colors cursor-pointer overflow-hidden ${
                  dragActive
                    ? 'border-sky-500 bg-sky-50/70 dark:bg-sky-950/40'
                    : 'border-slate-300 dark:border-sky-800/80 bg-slate-50/70 dark:bg-[#061526] hover:border-sky-400'
                }`}
              >
                {photoPreview ? (
                  <div className="relative">
                    <img
                      src={photoPreview}
                      alt="Uploaded starting frame"
                      className="w-full max-h-60 object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 via-slate-950/40 to-transparent px-3.5 py-2.5 flex items-center justify-between text-xs text-white">
                      <span className="truncate font-medium">{photoName || 'Uploaded photo'}</span>
                      <span className="text-[11px] text-sky-300 shrink-0 ml-2">Click to replace</span>
                    </div>
                  </div>
                ) : (
                  <div className="py-9 px-4 text-center space-y-2">
                    <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-900/60 text-sky-600 dark:text-sky-400 mx-auto flex items-center justify-center">
                      <ImagePlus className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-sky-100">
                      Click to upload a photo or drag and drop here
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-sky-200/65">
                      JPEG, PNG, or WebP up to 10 MB
                    </p>
                  </div>
                )}
              </div>

              {/* Sample Photos Quick Loader */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-500 dark:text-sky-200/65 mr-1">
                  Or try a sample:
                </span>
                {SAMPLE_PHOTOS.map((sample) => (
                  <button
                    key={sample.label}
                    type="button"
                    disabled={generating}
                    onClick={() => void handleLoadSample(sample)}
                    className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-slate-200 dark:border-sky-800/80 bg-white dark:bg-[#061526] text-slate-700 dark:text-sky-200 hover:border-sky-500 hover:text-sky-700 dark:hover:text-sky-300 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {sample.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Aspect Ratio Selector: Strict 16:9 or 9:16 */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-800 dark:text-sky-100 block">
                2. Video Aspect Ratio
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={generating}
                  onClick={() => setAspectRatio('16:9')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-60 flex items-center gap-3 ${
                    aspectRatio === '16:9'
                      ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/40 text-sky-900 dark:text-sky-50 ring-1 ring-sky-500/40'
                      : 'border-slate-200 dark:border-sky-900/70 bg-slate-50/70 dark:bg-[#061526] text-slate-700 dark:text-sky-200/80 hover:border-sky-400'
                  }`}
                >
                  <RectangleHorizontal className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0" />
                  <div>
                    <p className="text-xs font-bold">16:9 Landscape</p>
                    <p className="text-[11px] opacity-75">Widescreen / Web / Presentations</p>
                  </div>
                </button>

                <button
                  type="button"
                  disabled={generating}
                  onClick={() => setAspectRatio('9:16')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-60 flex items-center gap-3 ${
                    aspectRatio === '9:16'
                      ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/40 text-sky-900 dark:text-sky-50 ring-1 ring-sky-500/40'
                      : 'border-slate-200 dark:border-sky-900/70 bg-slate-50/70 dark:bg-[#061526] text-slate-700 dark:text-sky-200/80 hover:border-sky-400'
                  }`}
                >
                  <RectangleVertical className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0" />
                  <div>
                    <p className="text-xs font-bold">9:16 Portrait</p>
                    <p className="text-[11px] opacity-75">Mobile Reels / Shorts / Stories</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Duration & Resolution */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-600 dark:text-sky-200/80 block">
                  Clip Duration
                </label>
                <div className="grid grid-cols-3 gap-1 p-1 rounded-lg border border-slate-200 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526]">
                  {(['5s', '8s', '10s'] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      disabled={generating}
                      onClick={() => setDuration(d)}
                      className={`py-1.5 rounded-md text-xs font-mono font-semibold transition-colors cursor-pointer ${
                        duration === d
                          ? 'bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950'
                          : 'text-slate-600 dark:text-sky-200/75 hover:bg-slate-200/60 dark:hover:bg-sky-900/40'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-600 dark:text-sky-200/80 block">
                  Output Resolution
                </label>
                <div className="grid grid-cols-2 gap-1 p-1 rounded-lg border border-slate-200 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526]">
                  {(['720p', '1080p'] as const).map((res) => (
                    <button
                      key={res}
                      type="button"
                      disabled={generating}
                      onClick={() => setResolution(res)}
                      className={`py-1.5 rounded-md text-xs font-mono font-semibold transition-colors cursor-pointer ${
                        resolution === res
                          ? 'bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950'
                          : 'text-slate-600 dark:text-sky-200/75 hover:bg-slate-200/60 dark:hover:bg-sky-900/40'
                      }`}
                    >
                      {res}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Motion Prompt with Microphone Transcription */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-slate-800 dark:text-sky-100">
                  3. Animation &amp; Camera Motion Prompt
                </label>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-500 dark:text-sky-200/65">
                    Dictate prompt:
                  </span>
                  <MicTranscribeButton
                    language={language}
                    disabled={generating}
                    onTranscribed={(spoken) =>
                      setPrompt((prev) => (prev.trim() ? `${prev.trim()} ${spoken}` : spoken))
                    }
                    onError={(msg) => setError(msg)}
                  />
                </div>
              </div>

              <textarea
                rows={3}
                value={prompt}
                disabled={generating}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the camera movement, lighting, or action you want in the animated video..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-xs sm:text-sm text-slate-900 dark:text-sky-50 leading-relaxed focus:outline-none focus:ring-2 focus:ring-sky-500"
              />

              <div className="flex flex-wrap gap-1.5">
                {MOTION_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    disabled={generating}
                    onClick={() => setPrompt(preset.prompt)}
                    className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-slate-200 dark:border-sky-900/80 text-slate-600 dark:text-sky-200/80 hover:border-sky-500 hover:text-sky-700 dark:hover:text-sky-300 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    + {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 leading-relaxed">
                {error}
              </div>
            )}

            <button
              type="button"
              disabled={generating || !photoBase64}
              onClick={() => void startGeneration()}
              className="w-full py-3 px-4 rounded-xl text-sm font-semibold bg-sky-600 dark:bg-sky-500 hover:bg-sky-700 dark:hover:bg-sky-400 text-white dark:text-sky-950 disabled:opacity-50 inline-flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Animating Photo ({formatElapsed(elapsedSec)})...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate {aspectRatio} Video with Omni Flash
                </>
              )}
            </button>
          </div>

          {/* Right Column: Live Render Status & Generated Video Player */}
          <div className="lg:col-span-6 space-y-4">
            <div className="p-5 rounded-xl border border-slate-200 dark:border-sky-900/70 bg-slate-50/75 dark:bg-[#061526] min-h-[380px] flex flex-col justify-between gap-4">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-sky-300 inline-flex items-center gap-1.5">
                  <Film className="w-3.5 h-3.5 text-sky-500" />
                  Generated Video Output
                </h4>
                {activeClip && (
                  <span className="text-[11px] font-mono text-slate-500 dark:text-sky-300/80">
                    {activeClip.aspectRatio} · {activeClip.duration} · {activeClip.resolution}
                  </span>
                )}
              </div>

              {generating ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-10 px-4 space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-sky-100 dark:bg-sky-900/60 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                  <div className="space-y-1 max-w-sm">
                    <p className="text-sm font-semibold text-slate-900 dark:text-sky-50">
                      Synthesizing Animated Video...
                    </p>
                    <p className="text-xs text-slate-600 dark:text-sky-200/75 leading-relaxed">
                      {statusMessage || 'Rendering frames via Gemini Interactions API.'}
                    </p>
                    <p className="text-[11px] font-mono text-sky-700 dark:text-sky-400 pt-1">
                      Elapsed: {formatElapsed(elapsedSec)} · Model: gemini-omni-1.2-flash
                    </p>
                  </div>
                </div>
              ) : activeClip ? (
                <div className="space-y-4">
                  <div
                    className={`rounded-xl overflow-hidden bg-slate-950 border border-slate-800 ${
                      activeClip.aspectRatio === '9:16'
                        ? 'max-w-[260px] mx-auto aspect-[9/16]'
                        : 'w-full aspect-video'
                    }`}
                  >
                    <video
                      key={activeClip.mediaUrl}
                      src={activeClip.mediaUrl}
                      controls
                      playsInline
                      loop
                      className="w-full h-full object-contain"
                    />
                  </div>

                  <p className="text-xs text-slate-600 dark:text-sky-200/80 leading-relaxed">
                    <strong className="text-slate-800 dark:text-sky-100">Prompt:</strong>{' '}
                    {activeClip.prompt}
                  </p>

                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={`${activeClip.mediaUrl.split('?')[0]}?download=1`}
                      download={`reboot-earth-${activeClip.aspectRatio.replace(':', 'x')}.mp4`}
                      className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 hover:bg-sky-700 dark:hover:bg-sky-400 inline-flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download MP4
                    </a>
                    <button
                      type="button"
                      onClick={() => void startGeneration()}
                      className="px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-sky-800 text-slate-700 dark:text-sky-200 hover:border-sky-500 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Regenerate
                    </button>
                  </div>

                  {/* Multi-turn Interactions API Follow-up Edit / Extension */}
                  <div className="pt-3 border-t border-slate-200 dark:border-sky-900/60 space-y-2">
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-sky-200 inline-flex items-center gap-1.5">
                      <Wand2 className="w-3.5 h-3.5 text-sky-500" />
                      Multi-Turn Edit or Extend This Clip (via previous_interaction_id)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={followUpPrompt}
                        onChange={(e) => setFollowUpPrompt(e.target.value)}
                        placeholder="e.g., Extend the camera pan outward to reveal the whole workspace"
                        className="flex-1 px-3 py-2 rounded-lg text-xs border border-slate-300 dark:border-sky-800 bg-white dark:bg-[#0B223B] text-slate-900 dark:text-sky-50"
                      />
                      <button
                        type="button"
                        disabled={!followUpPrompt.trim() || generating}
                        onClick={() =>
                          void startGeneration({
                            previousInteractionId: activeClip.interactionId,
                            overridePrompt: followUpPrompt,
                          })
                        }
                        className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-sky-800 text-white hover:bg-slate-800 dark:hover:bg-sky-700 disabled:opacity-50 shrink-0 cursor-pointer"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-12 px-4 space-y-2.5">
                  <div className="w-11 h-11 rounded-2xl bg-slate-200/80 dark:bg-sky-900/50 text-slate-500 dark:text-sky-300 flex items-center justify-center">
                    <Clapperboard className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-sky-100">
                    Your animated video will appear here
                  </p>
                  <p className="text-xs text-slate-500 dark:text-sky-200/65 max-w-xs leading-relaxed">
                    Upload a photo on the left, choose <span className="font-mono">16:9</span> landscape or{' '}
                    <span className="font-mono">9:16</span> portrait, and click Generate.
                  </p>
                </div>
              )}
            </div>

            {/* Session Clip History */}
            {clips.length > 1 && (
              <div className="p-4 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-2.5">
                <p className="text-xs font-semibold text-slate-800 dark:text-sky-100">
                  Recent Clips ({clips.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {clips.map((clip, idx) => (
                    <button
                      key={clip.id}
                      type="button"
                      onClick={() => setActiveClip(clip)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                        activeClip?.id === clip.id
                          ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/50 text-sky-800 dark:text-sky-100'
                          : 'border-slate-200 dark:border-sky-900/70 text-slate-600 dark:text-sky-200/75 hover:border-sky-400'
                      }`}
                    >
                      Clip #{clips.length - idx} · {clip.aspectRatio} ({clip.createdAt})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
