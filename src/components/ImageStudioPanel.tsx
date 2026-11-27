import React, { useRef, useState } from 'react';
import {
  Download,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  Pencil,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { MicTranscribeButton } from './AudioTranscriber';

type ImageMode = 'create' | 'edit';
type ResolutionOption = '1K' | '2K' | '4K';
type AspectRatioOption = '16:9' | '1:1' | '4:3' | '3:4' | '9:16';

interface GeneratedArtwork {
  id: string;
  imageUrl: string;
  caption: string;
  prompt: string;
  model: string;
  mode: ImageMode;
  imageSize: ResolutionOption;
  aspectRatio: AspectRatioOption;
}

const CREATE_PRESETS = [
  {
    label: 'Eco-Drive Poster',
    prompt:
      'Clean editorial poster for an urban electronic waste recycling drive, vibrant emerald leaves emerging from recycled circuit board copper traces, minimalist modern design, crisp daylight lighting, no text',
  },
  {
    label: 'Circular Lab Showcase',
    prompt:
      'Architectural photography of a sunlit zero-waste electronics refurbishment studio with glass walls, organized copper and silicon recovery stations, indoor plants, ultra-sharp 35mm lens',
  },
  {
    label: 'Social Impact Graphic',
    prompt:
      'Isometric clean-tech 3D illustration of smartphones, laptops, and solar cells flowing through a glowing emerald circular economy loop, deep navy background, high-contrast studio lighting, no text',
  },
];

const EDIT_PRESETS = [
  'Change the lighting to warm golden-hour sunlight and add lush indoor greenery around the workspace.',
  'Transform the background into a sleek futuristic zero-waste recycling hub with soft teal rim lighting.',
  'Restyle as a crisp editorial risograph illustration with emerald, sky blue, and warm copper ink tones.',
];

function fileToBase64(file: Blob): Promise<{ base64: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = dataUrl.indexOf(',');
      if (commaIdx < 0) {
        reject(new Error('Could not encode uploaded image.'));
        return;
      }
      resolve({ base64: dataUrl.slice(commaIdx + 1), dataUrl });
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

function parseDataUrl(dataUrl: string): { base64: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' } | null {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i);
  if (!match) return null;
  return {
    mimeType: match[1].toLowerCase() as 'image/jpeg' | 'image/png' | 'image/webp',
    base64: match[2],
  };
}

export const ImageStudioPanel: React.FC = () => {
  const { language } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [mode, setMode] = useState<ImageMode>('create');
  const [prompt, setPrompt] = useState(CREATE_PRESETS[0].prompt);
  const [imageSize, setImageSize] = useState<ResolutionOption>('1K');
  const [aspectRatio, setAspectRatio] = useState<AspectRatioOption>('16:9');

  const [sourceBase64, setSourceBase64] = useState<string | null>(null);
  const [sourceMime, setSourceMime] = useState<'image/jpeg' | 'image/png' | 'image/webp'>('image/png');
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gallery, setGallery] = useState<GeneratedArtwork[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const activeArt = gallery.find((g) => g.id === selectedId) || gallery[0] || null;

  const handleUploadSource = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Please upload a JPEG, PNG, or WebP image to edit.');
      return;
    }
    if (file.size > 9 * 1024 * 1024) {
      setError('Uploaded image must be under 9 MB.');
      return;
    }
    try {
      const { base64, dataUrl } = await fileToBase64(file);
      setSourceBase64(base64);
      setSourceMime(file.type as 'image/jpeg' | 'image/png' | 'image/webp');
      setSourcePreview(dataUrl);
      setMode('edit');
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Unable to load source image.');
    }
  };

  const handleSendToEditor = (art: GeneratedArtwork) => {
    const parsed = parseDataUrl(art.imageUrl);
    if (!parsed) return;
    setSourceBase64(parsed.base64);
    setSourceMime(parsed.mimeType);
    setSourcePreview(art.imageUrl);
    setMode('edit');
    setPrompt(EDIT_PRESETS[0]);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) {
      setError('Enter a text prompt describing what to create or edit.');
      return;
    }
    if (mode === 'edit' && !sourceBase64) {
      setError('Upload a source image first (or click "Edit This Image" on a generated visual).');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch<{
        dataUrl?: string;
        imageUrl?: string;
        caption?: string;
        model?: string;
        mode?: ImageMode;
      }>(
        '/api/ai/generate-image',
        {
          method: 'POST',
          body: JSON.stringify({
            prompt: prompt.trim(),
            imageSize,
            aspectRatio,
            ...(mode === 'edit' && sourceBase64
              ? { sourceImageBase64: sourceBase64, sourceMimeType: sourceMime }
              : {}),
          }),
        },
        false
      );

      const url = res.dataUrl || res.imageUrl;
      if (!url) {
        throw new Error('No image data was returned by the model.');
      }

      const item: GeneratedArtwork = {
        id: `img_${Date.now()}`,
        imageUrl: url,
        caption: res.caption || '',
        prompt: prompt.trim(),
        model: res.model || 'gemini-nano-banana-2.1',
        mode,
        imageSize,
        aspectRatio,
      };
      setGallery((prev) => [item, ...prev].slice(0, 8));
      setSelectedId(item.id);
    } catch (err: any) {
      setError(err?.message || 'Unable to process image request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50 inline-flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-sky-500" />
            Create &amp; Edit Image Studio
          </h4>
          <p className="text-xs text-slate-600 dark:text-sky-200/70 mt-1">
            Generate high-resolution campaign visuals (1K, 2K, 4K) or edit uploaded photos with natural language using{' '}
            <code className="font-mono text-[11px] text-sky-700 dark:text-sky-300">gemini-nano-banana-2.1</code>.
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-slate-200 dark:border-sky-900/70 p-1 bg-slate-50 dark:bg-[#061526] self-start">
          <button
            type="button"
            onClick={() => {
              setMode('create');
              setError(null);
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
              mode === 'create'
                ? 'bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950'
                : 'text-slate-600 dark:text-sky-200/75 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Create Image
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('edit');
              setError(null);
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
              mode === 'edit'
                ? 'bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950'
                : 'text-slate-600 dark:text-sky-200/75 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit Image
          </button>
        </div>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {/* Source Image Upload Box when in Edit mode */}
        {mode === 'edit' && (
          <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-sky-800 bg-slate-50/75 dark:bg-[#061526] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => void handleUploadSource(e)}
            />
            {sourcePreview ? (
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={sourcePreview}
                  alt="Source image for editing"
                  className="w-20 h-20 rounded-lg object-cover border border-slate-200 dark:border-sky-800 shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-sky-50">
                    Source Image Loaded
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-sky-200/65">
                    Describe what to add, remove, restyle, or relight below.
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-sky-50">
                  Upload a Photo to Edit
                </p>
                <p className="text-[11px] text-slate-500 dark:text-sky-200/65 mt-0.5">
                  Supports JPEG, PNG, or WebP (or click &ldquo;Edit This Image&rdquo; on any generated artwork).
                </p>
              </div>
            )}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold border border-sky-500/60 bg-sky-500/10 text-sky-700 dark:text-sky-300 hover:bg-sky-500/20 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <ImagePlus className="w-3.5 h-3.5" />
                {sourcePreview ? 'Replace Image' : 'Upload Photo'}
              </button>
              {sourcePreview && (
                <button
                  type="button"
                  onClick={() => {
                    setSourceBase64(null);
                    setSourcePreview(null);
                  }}
                  className="p-2 rounded-lg text-slate-400 hover:text-red-500 cursor-pointer"
                  aria-label="Clear source image"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Presets */}
        <div className="flex flex-wrap gap-1.5">
          {mode === 'create'
            ? CREATE_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setPrompt(p.prompt)}
                  className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-slate-200 dark:border-sky-800/80 bg-slate-50 dark:bg-[#061526] text-slate-700 dark:text-sky-200 hover:border-sky-500 transition-colors cursor-pointer"
                >
                  {p.label}
                </button>
              ))
            : EDIT_PRESETS.map((instruction, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setPrompt(instruction)}
                  className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-slate-200 dark:border-sky-800/80 bg-slate-50 dark:bg-[#061526] text-slate-700 dark:text-sky-200 hover:border-emerald-500 transition-colors cursor-pointer"
                >
                  Edit Idea {idx + 1}
                </button>
              ))}
        </div>

        {/* Prompt Field + Voice Dictation */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="nano-banana-prompt" className="text-xs font-medium text-slate-700 dark:text-sky-200/85">
              {mode === 'edit' ? 'Editing Instructions' : 'Visual Prompt'}
            </label>
            <MicTranscribeButton
              language={language}
              disabled={loading}
              onTranscribed={(text) =>
                setPrompt((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text))
              }
              onError={(msg) => setError(msg)}
            />
          </div>
          <textarea
            id="nano-banana-prompt"
            rows={3}
            required
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              mode === 'edit'
                ? 'Describe the edits you want applied to the uploaded image...'
                : 'Describe the artwork, lighting, composition, and style...'
            }
            className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
          />
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 dark:text-sky-200/70">Resolution:</span>
              {(['1K', '2K', '4K'] as const).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setImageSize(sz)}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-semibold border cursor-pointer ${
                    imageSize === sz
                      ? 'border-sky-500 bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950'
                      : 'border-slate-300 dark:border-sky-800 text-slate-600 dark:text-sky-200/75'
                  }`}
                >
                  {sz}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 dark:text-sky-200/70">Ratio:</span>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value as AspectRatioOption)}
                className="px-2.5 py-1 text-xs rounded border border-slate-300 dark:border-sky-800 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
              >
                <option value="16:9">16:9 Banner</option>
                <option value="1:1">1:1 Square</option>
                <option value="4:3">4:3 Presentation</option>
                <option value="3:4">3:4 Poster</option>
                <option value="9:16">9:16 Story</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 hover:bg-sky-700 dark:hover:bg-sky-400 disabled:opacity-60 inline-flex items-center gap-1.5 cursor-pointer"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : mode === 'edit' ? (
              <Wand2 className="w-3.5 h-3.5" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {loading
              ? mode === 'edit'
                ? 'Applying Edits...'
                : `Generating ${imageSize}...`
              : mode === 'edit'
                ? `Apply Edit (${imageSize})`
                : `Generate ${imageSize} Image`}
          </button>
        </div>
      </form>

      {error && (
        <div className="p-3.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/35 text-xs text-amber-900 dark:text-amber-200">
          {error}
        </div>
      )}

      {/* Output Viewer */}
      {activeArt && (
        <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-sky-900/60">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-mono text-[11px] text-sky-700 dark:text-sky-300">
              {activeArt.model} · {activeArt.mode === 'edit' ? 'Edited' : 'Created'} · {activeArt.imageSize} ({activeArt.aspectRatio})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleSendToEditor(activeArt)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit This Image
              </button>
              <a
                href={activeArt.imageUrl}
                download={`reboot-earth-${activeArt.mode}-${activeArt.imageSize}.png`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-sky-800 text-slate-700 dark:text-sky-100 hover:border-sky-500"
              >
                <Download className="w-3.5 h-3.5" />
                Download PNG
              </a>
            </div>
          </div>

          <img
            src={activeArt.imageUrl}
            alt="Generated or edited Reboot Earth visual"
            referrerPolicy="no-referrer"
            className="w-full max-h-[480px] object-contain rounded-xl border border-slate-200 dark:border-sky-900/60 bg-slate-950"
          />

          {activeArt.caption && (
            <p className="text-xs text-slate-600 dark:text-sky-200/75">{activeArt.caption}</p>
          )}

          {gallery.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pt-1">
              {gallery.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`relative w-20 h-14 rounded-lg overflow-hidden border-2 shrink-0 cursor-pointer ${
                    item.id === activeArt.id
                      ? 'border-sky-500'
                      : 'border-slate-200 dark:border-sky-900/70 opacity-75 hover:opacity-100'
                  }`}
                >
                  <img
                    src={item.imageUrl}
                    alt={item.prompt}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
