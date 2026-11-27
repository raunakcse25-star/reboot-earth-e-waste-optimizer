import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CameraOff,
  CheckCircle2,
  Layers,
  Loader2,
  Plus,
  Recycle,
  RefreshCw,
  RotateCcw,
  ScanLine,
  ShieldAlert,
  Sparkles,
  SwitchCamera,
  Trash2,
  Upload,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { EWASTE_CATEGORIES } from '../types';
import type { PickupPrefillTemplate } from './PickupHistoryLog';

interface DeviceIdentificationResponse {
  deviceName: string;
  category: string;
  quantity?: number;
  estimatedWeightKg: number;
  weightBasis?: string;
  condition: string;
  confidencePct?: number;
  hazardousMaterials?: string[];
  hazards?: string[];
  recoverableMaterials?: string[];
  refurbishmentViability?: string;
  safeHandlingTip?: string;
}

interface ScannedBatchItem {
  id: string;
  deviceName: string;
  category: string;
  quantity: number;
  estimatedWeightKg: number;
  condition: string;
  confidencePct: number;
  weightBasis: string;
  hazardousMaterials: string[];
  recoverableMaterials: string[];
  refurbishmentViability: string;
  safeHandlingTip: string;
  photoDataUrl: string;
  scannedAt: string;
}

export interface CameraEwasteScannerProps {
  contactName?: string;
  contactPhone?: string;
  defaultCity?: string;
  onCreatePickup: (prefill: PickupPrefillTemplate) => void;
}

const VALID_CONDITIONS = [
  'Working / Refurbishable',
  'Partially Working',
  'Non-working',
  'Damaged / Swollen Battery',
] as const;

const CATEGORY_WEIGHT_BENCHMARKS: { category: string; examples: string; typicalKg: string }[] = [
  { category: 'IT & Telecom', examples: 'Laptops, routers, smartphones, monitors', typicalKg: '0.2 – 6.5 kg' },
  { category: 'Consumer Electronics', examples: 'TVs, speakers, consoles, cameras', typicalKg: '0.5 – 14.0 kg' },
  { category: 'Batteries & Power', examples: 'Power banks, UPS units, chargers', typicalKg: '0.3 – 8.5 kg' },
  { category: 'PCB & Components', examples: 'Motherboards, GPUs, RAM, drives', typicalKg: '0.1 – 1.8 kg' },
  { category: 'Small Appliances', examples: 'Microwaves, kettles, vacuums, irons', typicalKg: '1.2 – 12.0 kg' },
  { category: 'Large Appliances', examples: 'Refrigerators, washers, AC units', typicalKg: '25.0 – 75.0 kg' },
];

const CO2_PER_KG_EWASTE = 1.44;
const MAX_CAPTURE_DIMENSION = 1280;

function normalizeCondition(raw?: string): string {
  if (!raw) return 'Non-working';
  const match = VALID_CONDITIONS.find((c) => c.toLowerCase() === raw.trim().toLowerCase());
  if (match) return match;
  const lower = raw.toLowerCase();
  if (/swollen|damaged|hazard|cracked|leaking/.test(lower)) return 'Damaged / Swollen Battery';
  if (/partial/.test(lower)) return 'Partially Working';
  if (/working|refurb/.test(lower)) return 'Working / Refurbishable';
  return 'Non-working';
}

function normalizeCategory(raw?: string): string {
  if (!raw) return EWASTE_CATEGORIES[0];
  const exact = EWASTE_CATEGORIES.find((c) => c.toLowerCase() === raw.trim().toLowerCase());
  return exact || EWASTE_CATEGORIES[0];
}

async function compressImageFileToJpegDataUrl(file: File): Promise<{ dataUrl: string; base64: string; mimeType: string }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode the selected image file.'));
      el.src = objectUrl;
    });

    const scale = Math.min(1, MAX_CAPTURE_DIMENSION / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const width = Math.max(1, Math.round((img.naturalWidth || 640) * scale));
    const height = Math.max(1, Math.round((img.naturalHeight || 480) * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Unable to initialize image canvas.');
    ctx.drawImage(img, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    return { dataUrl, base64, mimeType: 'image/jpeg' };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export const CameraEwasteScanner: React.FC<CameraEwasteScannerProps> = ({
  contactName = '',
  contactPhone = '',
  defaultCity = '',
  onCreatePickup,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [cameraState, setCameraState] = useState<'idle' | 'starting' | 'live' | 'captured' | 'error'>('idle');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraResolution, setCameraResolution] = useState<string>('');

  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [capturedBase64, setCapturedBase64] = useState<string | null>(null);
  const [capturedMimeType, setCapturedMimeType] = useState<string>('image/jpeg');
  const [scanNotes, setScanNotes] = useState('');

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [rawResult, setRawResult] = useState<DeviceIdentificationResponse | null>(null);

  // Editable inspection fields populated from AI identification
  const [deviceName, setDeviceName] = useState('');
  const [category, setCategory] = useState<string>(EWASTE_CATEGORIES[0]);
  const [quantity, setQuantity] = useState<number>(1);
  const [estimatedWeightKg, setEstimatedWeightKg] = useState<number>(1.5);
  const [condition, setCondition] = useState<string>('Non-working');

  // Multi-item batch scan tray
  const [batchItems, setBatchItems] = useState<ScannedBatchItem[]>([]);
  const [batchNotice, setBatchNotice] = useState<string | null>(null);

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, [stopCameraStream]);

  const startCamera = useCallback(
    async (requestedFacing: 'environment' | 'user' = facingMode) => {
      stopCameraStream();
      setCameraError(null);
      setAnalysisError(null);
      setCameraState('starting');

      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        setCameraError(
          'Live camera streaming is not supported in this browser context. Use Upload / Take Photo below to scan an e-waste image.'
        );
        setCameraState('error');
        return;
      }

      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: requestedFacing },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch {
          // Fallback to default camera when facingMode constraint is unavailable (e.g., laptop webcam)
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        streamRef.current = stream;
        setCameraState('live');

        // Bind stream to <video> once rendered
        requestAnimationFrame(() => {
          const videoEl = videoRef.current;
          if (!videoEl) return;
          videoEl.srcObject = stream;
          videoEl.onloadedmetadata = () => {
            if (videoEl.videoWidth && videoEl.videoHeight) {
              setCameraResolution(`${videoEl.videoWidth}×${videoEl.videoHeight}`);
            }
            void videoEl.play().catch(() => {});
          };
        });
      } catch (err: any) {
        stopCameraStream();
        const name = String(err?.name || '');
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setCameraError(
            'Camera permission was denied. Allow camera access in your browser settings, or upload a photo below to scan immediately.'
          );
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setCameraError(
            'No camera hardware was detected on this device. Upload a photo of your e-waste item to run automatic AI identification.'
          );
        } else {
          setCameraError(
            err?.message || 'Unable to start camera stream. You can upload an e-waste photo instead.'
          );
        }
        setCameraState('error');
      }
    },
    [facingMode, stopCameraStream]
  );

  const runVisionIdentification = useCallback(
    async (base64: string, mimeType: string, notesOverride?: string) => {
      setAnalyzing(true);
      setAnalysisError(null);
      setBatchNotice(null);

      try {
        const res = await apiFetch<DeviceIdentificationResponse>(
          '/api/ai/identify-device',
          {
            method: 'POST',
            body: JSON.stringify({
              imageBase64: base64,
              mimeType,
              notes: (notesOverride ?? scanNotes).trim() || undefined,
            }),
          },
          false
        );

        const resolvedHazards = Array.isArray(res.hazardousMaterials)
          ? res.hazardousMaterials
          : Array.isArray(res.hazards)
            ? res.hazards
            : [];

        const normalized: DeviceIdentificationResponse = {
          ...res,
          deviceName: res.deviceName || 'Electronic Device',
          category: normalizeCategory(res.category),
          quantity: Math.max(1, Math.round(Number(res.quantity) || 1)),
          estimatedWeightKg: Math.max(
            0.05,
            Math.round((Number(res.estimatedWeightKg) || 1.5) * 100) / 100
          ),
          condition: normalizeCondition(res.condition),
          confidencePct: Math.max(10, Math.min(100, Math.round(Number(res.confidencePct) || 84))),
          hazardousMaterials: resolvedHazards,
          recoverableMaterials: Array.isArray(res.recoverableMaterials) ? res.recoverableMaterials : [],
          weightBasis: res.weightBasis || 'Estimated from visual device dimensions and material class.',
          refurbishmentViability:
            res.refurbishmentViability || 'Eligible for certified e-waste disassembly and material recovery.',
          safeHandlingTip:
            res.safeHandlingTip || 'Keep dry and avoid puncturing any internal cells before pickup.',
        };

        setRawResult(normalized);
        setDeviceName(normalized.deviceName);
        setCategory(normalized.category);
        setQuantity(normalized.quantity || 1);
        setEstimatedWeightKg(normalized.estimatedWeightKg);
        setCondition(normalized.condition);
      } catch (err: any) {
        setAnalysisError(err?.message || 'AI vision identification failed. Please try capturing again.');
      } finally {
        setAnalyzing(false);
      }
    },
    [scanNotes]
  );

  const handleCaptureFrame = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      setAnalysisError('Camera feed is still warming up. Wait a moment and capture again.');
      return;
    }

    const scale = Math.min(1, MAX_CAPTURE_DIMENSION / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;

    stopCameraStream();
    setCapturedDataUrl(dataUrl);
    setCapturedBase64(base64);
    setCapturedMimeType('image/jpeg');
    setCameraState('captured');

    await runVisionIdentification(base64, 'image/jpeg');
  }, [runVisionIdentification, stopCameraStream]);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;

      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        setAnalysisError('Please select a JPEG, PNG, or WebP photo.');
        return;
      }

      stopCameraStream();
      setCameraError(null);
      setAnalysisError(null);

      try {
        const { dataUrl, base64, mimeType } = await compressImageFileToJpegDataUrl(file);
        setCapturedDataUrl(dataUrl);
        setCapturedBase64(base64);
        setCapturedMimeType(mimeType);
        setCameraState('captured');
        await runVisionIdentification(base64, mimeType);
      } catch (err: any) {
        setAnalysisError(err?.message || 'Unable to process the selected photo.');
      }
    },
    [runVisionIdentification, stopCameraStream]
  );

  const handleSwitchCamera = useCallback(() => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    if (cameraState === 'live') {
      void startCamera(nextMode);
    }
  }, [cameraState, facingMode, startCamera]);

  const handleRetake = useCallback(() => {
    setCapturedDataUrl(null);
    setCapturedBase64(null);
    setRawResult(null);
    setAnalysisError(null);
    void startCamera(facingMode);
  }, [facingMode, startCamera]);

  const handleResetToIdle = useCallback(() => {
    stopCameraStream();
    setCapturedDataUrl(null);
    setCapturedBase64(null);
    setRawResult(null);
    setAnalysisError(null);
    setCameraError(null);
    setCameraState('idle');
  }, [stopCameraStream]);

  const handleAddToBatch = useCallback(() => {
    if (!rawResult || !capturedDataUrl) return;
    const item: ScannedBatchItem = {
      id: `scan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      deviceName: deviceName.trim() || rawResult.deviceName,
      category,
      quantity: Math.max(1, Math.round(quantity || 1)),
      estimatedWeightKg: Math.max(0.05, Math.round((estimatedWeightKg || 0.5) * 100) / 100),
      condition,
      confidencePct: rawResult.confidencePct || 84,
      weightBasis: rawResult.weightBasis || '',
      hazardousMaterials: rawResult.hazardousMaterials || [],
      recoverableMaterials: rawResult.recoverableMaterials || [],
      refurbishmentViability: rawResult.refurbishmentViability || '',
      safeHandlingTip: rawResult.safeHandlingTip || '',
      photoDataUrl: capturedDataUrl,
      scannedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setBatchItems((prev) => [...prev, item]);
    setBatchNotice(`Added "${item.deviceName}" (${item.estimatedWeightKg} kg) to pickup batch tray.`);
  }, [rawResult, capturedDataUrl, deviceName, category, quantity, estimatedWeightKg, condition]);

  const handleCreateSinglePickup = useCallback(() => {
    if (!rawResult) return;
    const safeWeight = Math.max(0.05, Math.round((estimatedWeightKg || 0.5) * 100) / 100);
    const safeQty = Math.max(1, Math.round(quantity || 1));
    const hazards = rawResult.hazardousMaterials || [];
    const hazardLine = hazards.length > 0 ? `Detected hazards: ${hazards.join(', ')}. ` : '';
    const instructions = [
      `AI Camera Scan (${rawResult.confidencePct || 84}% confidence).`,
      rawResult.weightBasis ? `Weight basis: ${rawResult.weightBasis}` : '',
      rawResult.safeHandlingTip ? `Handling: ${rawResult.safeHandlingTip}` : '',
      scanNotes.trim() ? `Notes: ${scanNotes.trim()}` : '',
    ]
      .filter(Boolean)
      .join(' ');

    stopCameraStream();
    onCreatePickup({
      deviceName: deviceName.trim() || rawResult.deviceName,
      category,
      condition,
      quantity: safeQty,
      estimatedWeightKg: safeWeight,
      pickupAddress: defaultCity ? `${defaultCity}` : '',
      lat: 28.6139,
      lng: 77.209,
      timeSlot: '10:00 AM - 01:00 PM',
      contactName,
      contactPhone,
      instructions,
      photoDataUrl: capturedDataUrl || undefined,
      aiNote: `${hazardLine}${rawResult.safeHandlingTip || ''}`.trim() || undefined,
    });
  }, [
    rawResult,
    estimatedWeightKg,
    quantity,
    scanNotes,
    stopCameraStream,
    onCreatePickup,
    deviceName,
    category,
    condition,
    defaultCity,
    contactName,
    contactPhone,
    capturedDataUrl,
  ]);

  const handleCreateBatchPickup = useCallback(() => {
    if (batchItems.length === 0) return;

    const totalQty = batchItems.reduce((sum, item) => sum + item.quantity, 0);
    const totalWeight = Math.round(batchItems.reduce((sum, item) => sum + item.estimatedWeightKg, 0) * 100) / 100;

    // Pick category representing the largest mass in the batch
    const weightByCat = new Map<string, number>();
    batchItems.forEach((item) => {
      weightByCat.set(item.category, (weightByCat.get(item.category) || 0) + item.estimatedWeightKg);
    });
    let primaryCategory = batchItems[0].category;
    let topWeight = -1;
    weightByCat.forEach((w, cat) => {
      if (w > topWeight) {
        topWeight = w;
        primaryCategory = cat;
      }
    });

    // Escalate condition if any item has a damaged/swollen battery
    const hasHazardBattery = batchItems.some((item) => item.condition === 'Damaged / Swollen Battery');
    const primaryCondition = hasHazardBattery ? 'Damaged / Swollen Battery' : batchItems[0].condition;

    const allHazards = Array.from(
      new Set(batchItems.flatMap((item) => item.hazardousMaterials).filter(Boolean))
    );
    const summaryLabel =
      batchItems.length === 1
        ? batchItems[0].deviceName
        : `${batchItems[0].deviceName} + ${batchItems.length - 1} more scanned item${batchItems.length > 2 ? 's' : ''}`;

    const itemizedLines = batchItems
      .map((item, idx) => `${idx + 1}. ${item.deviceName} (${item.category}, qty ${item.quantity}, ~${item.estimatedWeightKg} kg, ${item.condition})`)
      .join(' | ');

    stopCameraStream();
    onCreatePickup({
      deviceName: summaryLabel.slice(0, 110),
      category: primaryCategory,
      condition: primaryCondition,
      quantity: totalQty,
      estimatedWeightKg: Math.max(0.05, totalWeight),
      pickupAddress: defaultCity ? `${defaultCity}` : '',
      lat: 28.6139,
      lng: 77.209,
      timeSlot: '10:00 AM - 01:00 PM',
      contactName,
      contactPhone,
      instructions: `AI Camera Batch (${batchItems.length} scans): ${itemizedLines}`,
      photoDataUrl: batchItems[0].photoDataUrl,
      aiNote:
        allHazards.length > 0
          ? `Batch hazard check: ${allHazards.join(', ')}. Separate battery-bearing items before pickup.`
          : 'All scanned batch items verified via AI camera intake.',
    });
  }, [batchItems, contactName, contactPhone, defaultCity, onCreatePickup, stopCameraStream]);

  const batchSummary = useMemo(() => {
    const count = batchItems.reduce((acc, item) => acc + item.quantity, 0);
    const weight = Math.round(batchItems.reduce((acc, item) => acc + item.estimatedWeightKg, 0) * 100) / 100;
    const co2 = Math.round(weight * CO2_PER_KG_EWASTE * 100) / 100;
    return { count, weight, co2 };
  }, [batchItems]);

  const currentCo2Avoided = useMemo(
    () => Math.round(Math.max(0, estimatedWeightKg || 0) * CO2_PER_KG_EWASTE * 100) / 100,
    [estimatedWeightKg]
  );

  return (
    <div className="space-y-6">
      {/* Hidden capture canvas & photo upload input */}
      <canvas ref={canvasRef} className="hidden" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Top Header Strip */}
      <div className="rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-400">
            <ScanLine className="w-4 h-4" />
            <span>Optical Intake &amp; Weight Estimator</span>
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-sky-50">
            AI Camera E-Waste Scanner
          </h3>
          <p className="text-xs text-slate-600 dark:text-sky-200/75 max-w-2xl">
            Point your device camera at electronics, cables, or appliances to automatically identify the item, classify its e-waste category, estimate weight, flag hazardous components, and prefill a doorstep pickup request.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 shrink-0">
          <div className="px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-sky-900/60 bg-slate-50 dark:bg-[#061526]">
            <p className="text-[11px] text-slate-500 dark:text-sky-200/70">Batch Tray</p>
            <p className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50">
              {batchSummary.count} {batchSummary.count === 1 ? 'item' : 'items'}
            </p>
          </div>
          <div className="px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-sky-900/60 bg-slate-50 dark:bg-[#061526]">
            <p className="text-[11px] text-slate-500 dark:text-sky-200/70">Batch Mass</p>
            <p className="text-base font-bold font-mono tabular-nums text-sky-700 dark:text-sky-400">
              {batchSummary.weight.toFixed(2)} kg
            </p>
          </div>
          <div className="px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-sky-900/60 bg-slate-50 dark:bg-[#061526]">
            <p className="text-[11px] text-slate-500 dark:text-sky-200/70">Est. CO₂e Saved</p>
            <p className="text-base font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
              {batchSummary.co2.toFixed(1)} kg
            </p>
          </div>
        </div>
      </div>

      {/* Main Split Optical Console */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Left: Camera Viewfinder & Capture Deck */}
        <div className="xl:col-span-7 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-sky-900/60 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span className="text-sm font-semibold text-slate-900 dark:text-sky-50">
                Camera Viewfinder
              </span>
              {cameraState === 'live' && cameraResolution && (
                <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-sky-300/70">
                  {cameraResolution} · {facingMode === 'environment' ? 'Rear' : 'Front'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {cameraState === 'live' && (
                <>
                  <button
                    type="button"
                    onClick={handleSwitchCamera}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-sky-800 text-slate-700 dark:text-sky-200 hover:bg-slate-100 dark:hover:bg-sky-900/40 transition-colors cursor-pointer"
                  >
                    <SwitchCamera className="w-3.5 h-3.5" />
                    Flip Camera
                  </button>
                  <button
                    type="button"
                    onClick={handleResetToIdle}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-sky-800 text-slate-700 dark:text-sky-200 hover:bg-slate-100 dark:hover:bg-sky-900/40 transition-colors cursor-pointer"
                  >
                    <CameraOff className="w-3.5 h-3.5" />
                    Stop
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={analyzing}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-sky-800 text-slate-700 dark:text-sky-200 hover:bg-slate-100 dark:hover:bg-sky-900/40 disabled:opacity-50 transition-colors cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload Photo
              </button>
            </div>
          </div>

          {/* Optical Viewport */}
          <div className="relative bg-slate-950 aspect-[4/3] w-full flex items-center justify-center overflow-hidden">
            {/* Static optical alignment brackets */}
            <div className="pointer-events-none absolute inset-4 z-10">
              <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-sky-400/75" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-sky-400/75" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-sky-400/75" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-sky-400/75" />
            </div>

            {cameraState === 'idle' && (
              <div className="text-center px-6 py-8 max-w-md space-y-4 z-10">
                <div className="mx-auto w-14 h-14 rounded-xl bg-sky-500/15 border border-sky-400/30 flex items-center justify-center text-sky-300">
                  <Camera className="w-7 h-7" />
                </div>
                <div className="space-y-1.5">
                  <h4 className="text-base font-semibold text-white">
                    Ready to Scan E-Waste Items
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Place devices on a clear, well-lit surface. Start your live camera to frame and capture, or upload an existing photo from your device.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => void startCamera(facingMode)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 transition-colors cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    Start Live Camera
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold border border-slate-600 text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    Upload / Take Photo
                  </button>
                </div>
              </div>
            )}

            {cameraState === 'starting' && (
              <div className="text-center space-y-3 text-sky-200 z-10">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-sky-400" />
                <p className="text-xs font-medium">Requesting camera access...</p>
              </div>
            )}

            {cameraState === 'live' && (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${facingMode === 'user' ? '-scale-x-100' : ''}`}
              />
            )}

            {cameraState === 'captured' && capturedDataUrl && (
              <img
                src={capturedDataUrl}
                alt="Captured e-waste frame"
                className="w-full h-full object-contain bg-slate-950"
              />
            )}

            {cameraState === 'error' && (
              <div className="text-center px-6 py-8 max-w-md space-y-4 z-10">
                <div className="mx-auto w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-300">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="space-y-1.5">
                  <h4 className="text-sm font-semibold text-white">Camera Unavailable</h4>
                  <p className="text-xs text-slate-300 leading-relaxed">{cameraError}</p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => void startCamera(facingMode)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Retry Camera
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 transition-colors cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Upload Photo Instead
                  </button>
                </div>
              </div>
            )}

            {/* Vision Analysis Overlay */}
            {analyzing && (
              <div className="absolute inset-0 z-20 bg-slate-950/75 backdrop-blur-xs flex flex-col items-center justify-center gap-3 px-6 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-white">
                    Identifying E-Waste &amp; Estimating Weight
                  </p>
                  <p className="text-xs text-sky-200/80">
                    Analyzing device class, quantity, hazardous cells, and recoverable materials...
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Capture Action Bar & Context Notes */}
          <div className="p-4 border-t border-slate-200 dark:border-sky-900/60 space-y-3 bg-slate-50/70 dark:bg-[#071A30]">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                value={scanNotes}
                onChange={(e) => setScanNotes(e.target.value)}
                placeholder="Optional scan hint (e.g., '2 dead laptops + chargers' or 'swollen battery')"
                className="flex-1 px-3 py-2 rounded-lg text-xs border border-slate-300 dark:border-sky-800/80 bg-white dark:bg-[#061526] text-slate-900 dark:text-sky-50 placeholder:text-slate-400 dark:placeholder:text-sky-300/45 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />

              {cameraState === 'live' && (
                <button
                  type="button"
                  onClick={() => void handleCaptureFrame()}
                  disabled={analyzing}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition-colors cursor-pointer shrink-0"
                >
                  <ScanLine className="w-4 h-4" />
                  Capture &amp; Identify
                </button>
              )}

              {cameraState === 'captured' && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleRetake}
                    disabled={analyzing}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-sky-800 text-slate-700 dark:text-sky-200 hover:bg-slate-100 dark:hover:bg-sky-900/50 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Retake
                  </button>
                  {capturedBase64 && (
                    <button
                      type="button"
                      onClick={() => void runVisionIdentification(capturedBase64, capturedMimeType)}
                      disabled={analyzing}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Re-Analyze
                    </button>
                  )}
                </div>
              )}

              {(cameraState === 'idle' || cameraState === 'error') && (
                <button
                  type="button"
                  onClick={() => void startCamera(facingMode)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white transition-colors cursor-pointer shrink-0"
                >
                  <Camera className="w-4 h-4" />
                  Launch Camera
                </button>
              )}
            </div>

            {analysisError && (
              <div className="p-3 rounded-lg border border-red-300 dark:border-red-800/80 bg-red-50 dark:bg-red-950/35 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{analysisError}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: AI Identification Inspector & Pickup Estimator */}
        <div className="xl:col-span-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-sky-900/60">
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-sky-50">
                Identification &amp; Pickup Estimate
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-sky-200/70">
                Verify or fine-tune detected values before booking pickup
              </p>
            </div>
            {rawResult && (
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-sky-200/60">
                  Confidence
                </p>
                <p className="text-sm font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                  {rawResult.confidencePct || 84}%
                </p>
              </div>
            )}
          </div>

          {!rawResult ? (
            <div className="space-y-4">
              <div className="p-4 rounded-lg border border-dashed border-slate-300 dark:border-sky-800/80 bg-slate-50/70 dark:bg-[#061526]/60 space-y-2.5">
                <p className="text-xs font-semibold text-slate-800 dark:text-sky-100">
                  How Automated Intake Works
                </p>
                <ol className="space-y-1.5 text-xs text-slate-600 dark:text-sky-200/75 list-decimal list-inside">
                  <li>Start your camera (or upload a photo) and frame the e-waste item.</li>
                  <li>AI detects the device type, count, category, and estimated mass in kg.</li>
                  <li>Review hazards and send a single item or multi-item batch straight to Schedule Pickup.</li>
                </ol>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-sky-300/75">
                  Reference Category Mass Ranges
                </p>
                <div className="divide-y divide-slate-200 dark:divide-sky-900/50 border border-slate-200 dark:border-sky-900/60 rounded-lg overflow-hidden">
                  {CATEGORY_WEIGHT_BENCHMARKS.map((row) => (
                    <div
                      key={row.category}
                      className="px-3 py-2 flex items-center justify-between gap-2 text-xs bg-white dark:bg-[#061526]/40"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800 dark:text-sky-100 truncate">
                          {row.category}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-sky-200/65 truncate">
                          {row.examples}
                        </p>
                      </div>
                      <span className="font-mono tabular-nums text-[11px] font-semibold text-sky-700 dark:text-sky-400 shrink-0">
                        {row.typicalKg}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Editable Pickup Estimation Form */}
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-sky-200/80 mb-1">
                    Identified Device / Bundle
                  </label>
                  <input
                    type="text"
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-xs font-medium border border-slate-300 dark:border-sky-800 bg-white dark:bg-[#061526] text-slate-900 dark:text-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-sky-200/80 mb-1">
                      E-Waste Category
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-xs border border-slate-300 dark:border-sky-800 bg-white dark:bg-[#061526] text-slate-900 dark:text-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    >
                      {EWASTE_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-sky-200/80 mb-1">
                      Condition
                    </label>
                    <select
                      value={condition}
                      onChange={(e) => setCondition(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-xs border border-slate-300 dark:border-sky-800 bg-white dark:bg-[#061526] text-slate-900 dark:text-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    >
                      {VALID_CONDITIONS.map((cond) => (
                        <option key={cond} value={cond}>
                          {cond}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-sky-200/80 mb-1">
                      Item Count (Qty)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full px-3 py-2 rounded-lg text-xs font-mono tabular-nums border border-slate-300 dark:border-sky-800 bg-white dark:bg-[#061526] text-slate-900 dark:text-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-sky-200/80 mb-1">
                      Estimated Weight (kg)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min={0.05}
                      max={500}
                      value={estimatedWeightKg}
                      onChange={(e) =>
                        setEstimatedWeightKg(Math.max(0.05, Number(e.target.value) || 0.1))
                      }
                      className="w-full px-3 py-2 rounded-lg text-xs font-mono tabular-nums border border-slate-300 dark:border-sky-800 bg-white dark:bg-[#061526] text-slate-900 dark:text-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </div>
              </div>

              {/* Weight Rationale & CO2 Impact Readout */}
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-sky-900/60 bg-slate-50 dark:bg-[#061526] space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-600 dark:text-sky-200/75 flex items-center gap-1.5">
                    <Recycle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    Projected CO₂e Avoided
                  </span>
                  <span className="font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-400">
                    {currentCo2Avoided.toFixed(2)} kg CO₂e
                  </span>
                </div>
                {rawResult.weightBasis && (
                  <p className="text-[11px] text-slate-500 dark:text-sky-200/70 leading-relaxed">
                    {rawResult.weightBasis}
                  </p>
                )}
              </div>

              {/* Hazardous Components & Safe Handling */}
              {rawResult.hazardousMaterials && rawResult.hazardousMaterials.length > 0 && (
                <div className="p-3.5 rounded-lg border border-amber-300 dark:border-amber-700/70 bg-amber-50/80 dark:bg-amber-950/30 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>Hazardous Components Flagged</span>
                  </div>
                  <p className="text-xs text-amber-900/90 dark:text-amber-200/90">
                    {rawResult.hazardousMaterials.join(' · ')}
                  </p>
                  {rawResult.safeHandlingTip && (
                    <p className="text-[11px] text-amber-800/85 dark:text-amber-200/75 leading-relaxed">
                      {rawResult.safeHandlingTip}
                    </p>
                  )}
                </div>
              )}

              {/* Recoverable Materials & Refurbishment Note */}
              {(rawResult.recoverableMaterials?.length || rawResult.refurbishmentViability) && (
                <div className="p-3.5 rounded-lg border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#071A30] space-y-2 text-xs">
                  {rawResult.recoverableMaterials && rawResult.recoverableMaterials.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-sky-300/70 mb-0.5">
                        Recoverable Circular Materials
                      </p>
                      <p className="text-slate-700 dark:text-sky-100">
                        {rawResult.recoverableMaterials.join(' · ')}
                      </p>
                    </div>
                  )}
                  {rawResult.refurbishmentViability && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-sky-300/70 mb-0.5">
                        Circularity Assessment
                      </p>
                      <p className="text-slate-600 dark:text-sky-200/80 leading-relaxed">
                        {rawResult.refurbishmentViability}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {batchNotice && (
                <div className="p-2.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{batchNotice}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleCreateSinglePickup}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer"
                >
                  <span>Create Pickup Request</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleAddToBatch}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/40 transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add to Batch
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Multi-Item Batch Scan Tray */}
      {batchItems.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-sky-900/60 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <h4 className="text-sm font-bold text-slate-900 dark:text-sky-50">
                Multi-Item Pickup Batch Tray ({batchItems.length}{' '}
                {batchItems.length === 1 ? 'scan' : 'scans'})
              </h4>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setBatchItems([]);
                  setBatchNotice(null);
                }}
                className="text-xs font-medium text-slate-500 dark:text-sky-300/75 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
              >
                Clear Batch
              </button>
              <button
                type="button"
                onClick={handleCreateBatchPickup}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer"
              >
                <span>Schedule Combined Pickup ({batchSummary.weight.toFixed(2)} kg)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-[#061526] text-slate-500 dark:text-sky-200/70">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Preview</th>
                  <th className="px-4 py-2.5 font-medium">Identified Item</th>
                  <th className="px-4 py-2.5 font-medium">Category</th>
                  <th className="px-4 py-2.5 font-medium">Condition</th>
                  <th className="px-4 py-2.5 font-medium text-right">Qty</th>
                  <th className="px-4 py-2.5 font-medium text-right">Weight</th>
                  <th className="px-4 py-2.5 font-medium text-right">Remove</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-sky-900/50">
                {batchItems.map((item) => (
                  <tr key={item.id} className="text-slate-700 dark:text-sky-100">
                    <td className="px-4 py-2.5">
                      <img
                        src={item.photoDataUrl}
                        alt={item.deviceName}
                        className="w-12 h-9 rounded object-cover border border-slate-200 dark:border-sky-800"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="font-semibold text-slate-900 dark:text-sky-50">
                        {item.deviceName}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-sky-300/65">
                        Scanned {item.scannedAt} · {item.confidencePct}% match
                      </p>
                    </td>
                    <td className="px-4 py-2.5">{item.category}</td>
                    <td className="px-4 py-2.5">{item.condition}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {item.quantity}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-sky-700 dark:text-sky-400">
                      {item.estimatedWeightKg.toFixed(2)} kg
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          setBatchItems((prev) => prev.filter((x) => x.id !== item.id))
                        }
                        aria-label={`Remove ${item.deviceName} from batch`}
                        className="p-1.5 rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
