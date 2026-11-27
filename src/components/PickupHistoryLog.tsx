import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Building2,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  ExternalLink,
  FileDown,
  History,
  Image as ImageIcon,
  List,
  Loader2,
  MapPin,
  Package,
  RefreshCw,
  RotateCcw,
  Search,
  Share2,
  SlidersHorizontal,
  Truck,
  X,
  ZoomIn,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { createScheduledPickup } from '../lib/firebase';
import { generateRecyclingImpactPdf } from '../lib/recyclingReportPdf';
import { useAuth } from '../context/AuthContext';
import {
  EWASTE_CATEGORIES,
  PICKUP_STATUS_FLOW,
  PICKUP_TIME_SLOTS,
  ROLE_LABELS,
  type Facility,
  type PickupRequest,
  type PickupTimeSlot,
  type Vehicle,
} from '../types';

import itTelecomImg from '../assets/images/ewaste_it_telecom_1795771768079.jpg';
import batteriesPowerImg from '../assets/images/ewaste_batteries_power_1795771766945.jpg';
import appliancesPcbImg from '../assets/images/ewaste_appliances_pcb_1795771766270.jpg';
import consumerElectronicsImg from '../assets/images/ewaste_consumer_electronics_1795771767933.jpg';
import { PickupHistoryMapView } from './PickupHistoryMapView';

export interface PickupPrefillTemplate {
  deviceName: string;
  category: string;
  condition: string;
  quantity: number;
  estimatedWeightKg: number;
  pickupAddress: string;
  lat: number;
  lng: number;
  timeSlot: PickupTimeSlot;
  contactName: string;
  contactPhone: string;
  instructions: string;
  photoDataUrl?: string;
  aiNote?: string;
}

interface StatusHistoryEntry {
  id: number;
  requestId: number;
  fromStatus: string;
  toStatus: string;
  changedByUid: string;
  note: string | null;
  createdAt: string;
}

interface StoredMaterialPhoto {
  id: string;
  dataUrl: string;
  caption: string;
  uploadedAt: string;
}

interface PickupHistoryLogProps {
  pickups: PickupRequest[];
  facilities: Facility[];
  vehicles: Vehicle[];
  onRefreshData: () => void;
  onCustomizeReorder: (template: PickupPrefillTemplate) => void;
}

const PHOTO_STORAGE_KEY = 'reboot_earth_pickup_material_photos_v1';

export function savePickupMaterialPhoto(
  requestCode: string,
  dataUrl: string,
  caption = 'User uploaded material photo'
): void {
  try {
    const raw = localStorage.getItem(PHOTO_STORAGE_KEY);
    const map: Record<string, StoredMaterialPhoto[]> = raw ? JSON.parse(raw) : {};
    const existing = Array.isArray(map[requestCode]) ? map[requestCode] : [];
    const next: StoredMaterialPhoto = {
      id: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      dataUrl,
      caption,
      uploadedAt: new Date().toISOString(),
    };
    map[requestCode] = [next, ...existing].slice(0, 4);
    localStorage.setItem(PHOTO_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

function loadAllStoredPhotos(): Record<string, StoredMaterialPhoto[]> {
  try {
    const raw = localStorage.getItem(PHOTO_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function compressImageFileToDataUrl(file: File, maxDim = 760): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result || ''));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

function getCategoryMaterialPhotos(pickup: PickupRequest): { src: string; caption: string }[] {
  const cat = pickup.category.toLowerCase();
  const device = pickup.deviceName.toLowerCase();

  if (cat.includes('battery') || cat.includes('power') || device.includes('ups') || device.includes('battery')) {
    return [
      {
        src: batteriesPowerImg,
        caption: `Quarantined ${pickup.category} collection crate (${pickup.estimatedWeightKg} kg)`,
      },
      {
        src: appliancesPcbImg,
        caption: 'Sorted recovery bench & insulated power assemblies',
      },
    ];
  }
  if (cat.includes('appliance') || cat.includes('pcb') || cat.includes('solar') || device.includes('ac') || device.includes('pcb')) {
    return [
      {
        src: appliancesPcbImg,
        caption: `Recovered PCBs, copper coils & dismantled ${pickup.category}`,
      },
      {
        src: itTelecomImg,
        caption: 'Facility intake & component staging bay',
      },
    ];
  }
  if (cat.includes('consumer') || device.includes('printer') || device.includes('scanner') || device.includes('phone')) {
    return [
      {
        src: consumerElectronicsImg,
        caption: `Collected ${pickup.deviceName} staged in recovery totes`,
      },
      {
        src: appliancesPcbImg,
        caption: 'Downstream copper & board recovery inspection',
      },
    ];
  }
  return [
    {
      src: itTelecomImg,
      caption: `Sorted ${pickup.category} hardware in verified collection bins`,
    },
    {
      src: consumerElectronicsImg,
      caption: 'Accessory cables, adapters & peripheral recovery totes',
    },
  ];
}

function getTomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateTime(iso: string | undefined): string {
  if (!iso) return 'Recorded';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusBadgeStyle(status: string): string {
  if (status === 'Completed') {
    return 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
  }
  if (status === 'Cancelled') {
    return 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30';
  }
  if (['Collected', 'Received at Facility', 'Processing'].includes(status)) {
    return 'bg-cyan-500/12 text-cyan-700 dark:text-cyan-300 border-cyan-500/30';
  }
  if (['Approved', 'Scheduled', 'Transporter Assigned'].includes(status)) {
    return 'bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/30';
  }
  return 'bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/30';
}

export const PickupHistoryLog: React.FC<PickupHistoryLogProps> = ({
  pickups,
  facilities,
  vehicles,
  onRefreshData,
  onCustomizeReorder,
}) => {
  const { firebaseUser, dbUser, firestoreProfile, pushNotification } = useAuth();

  const [searchText, setSearchText] = useState('');
  const [statusTab, setStatusTab] = useState<'all' | 'completed' | 'active' | 'cancelled'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'weight_desc' | 'weight_asc'>('date_desc');
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [reportNotice, setReportNotice] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [historyByPickupId, setHistoryByPickupId] = useState<Record<number, StatusHistoryEntry[]>>({});
  const [loadingHistoryId, setLoadingHistoryId] = useState<number | null>(null);

  // User-uploaded material photos stored locally per requestCode
  const [storedPhotos, setStoredPhotos] = useState<Record<string, StoredMaterialPhoto[]>>(() =>
    loadAllStoredPhotos()
  );
  const [uploadingCode, setUploadingCode] = useState<string | null>(null);

  // Lightbox viewer
  const [lightbox, setLightbox] = useState<{
    src: string;
    caption: string;
    requestCode: string;
    deviceName: string;
  } | null>(null);

  // Quick Re-Order modal state
  const [reorderTarget, setReorderTarget] = useState<PickupRequest | null>(null);
  const [reorderDate, setReorderDate] = useState<string>(() => getTomorrowIso());
  const [reorderSlot, setReorderSlot] = useState<PickupTimeSlot>('10:00 AM - 01:00 PM');
  const [reorderQty, setReorderQty] = useState<number>(1);
  const [reorderWeight, setReorderWeight] = useState<number>(2);
  const [reorderNotes, setReorderNotes] = useState<string>('');
  const [reordering, setReordering] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [reorderSuccess, setReorderSuccess] = useState<{
    requestCode: string;
    deviceName: string;
    preferredDate: string;
    timeSlot: string;
  } | null>(null);

  // Social Share modal state
  const [shareModal, setShareModal] = useState<{
    scopeLabel: string;
    weightKg: number;
    co2Kg: number;
    detailLine: string;
  } | null>(null);
  const [sharePostText, setSharePostText] = useState('');
  const [shareCopied, setShareCopied] = useState(false);

  const facilityById = useMemo(() => new Map(facilities.map((f) => [f.id, f])), [facilities]);
  const vehicleById = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);

  // Count recurrence by normalized deviceName + category
  const recurrenceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of pickups) {
      const key = `${p.deviceName.trim().toLowerCase()}|${p.category.trim().toLowerCase()}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [pickups]);

  // Recurring / recent unique items for 1-click re-order strip
  const quickReorderItems = useMemo(() => {
    const seen = new Set<string>();
    const list: { pickup: PickupRequest; count: number }[] = [];
    for (const p of pickups) {
      if (p.status === 'Cancelled') continue;
      const key = `${p.deviceName.trim().toLowerCase()}|${p.category.trim().toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ pickup: p, count: recurrenceCounts.get(key) || 1 });
    }
    return list.sort((a, b) => b.count - a.count).slice(0, 4);
  }, [pickups, recurrenceCounts]);

  const filteredPickups = useMemo(() => {
    const getPickupTimestamp = (p: PickupRequest): number => {
      const createdTs = p.createdAt ? Date.parse(p.createdAt) : Number.NaN;
      if (!Number.isNaN(createdTs)) return createdTs;
      const prefTs = p.preferredDate ? Date.parse(p.preferredDate) : Number.NaN;
      return Number.isNaN(prefTs) ? 0 : prefTs;
    };

    const filtered = pickups.filter((p) => {
      if (statusTab === 'completed' && p.status !== 'Completed') return false;
      if (statusTab === 'cancelled' && p.status !== 'Cancelled') return false;
      if (statusTab === 'active' && (p.status === 'Completed' || p.status === 'Cancelled')) return false;
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
      if (searchText.trim()) {
        const q = searchText.toLowerCase();
        return (
          p.requestCode.toLowerCase().includes(q) ||
          p.deviceName.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.pickupAddress.toLowerCase().includes(q) ||
          p.status.toLowerCase().includes(q)
        );
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === 'weight_desc') {
        const diff = (Number(b.estimatedWeightKg) || 0) - (Number(a.estimatedWeightKg) || 0);
        if (diff !== 0) return diff;
        return getPickupTimestamp(b) - getPickupTimestamp(a);
      }
      if (sortBy === 'weight_asc') {
        const diff = (Number(a.estimatedWeightKg) || 0) - (Number(b.estimatedWeightKg) || 0);
        if (diff !== 0) return diff;
        return getPickupTimestamp(b) - getPickupTimestamp(a);
      }
      if (sortBy === 'date_asc') {
        const diff = getPickupTimestamp(a) - getPickupTimestamp(b);
        return diff !== 0 ? diff : a.id - b.id;
      }
      const diff = getPickupTimestamp(b) - getPickupTimestamp(a);
      return diff !== 0 ? diff : b.id - a.id;
    });
  }, [pickups, statusTab, categoryFilter, searchText, sortBy]);

  const stats = useMemo(() => {
    const nonCancelled = pickups.filter((p) => p.status !== 'Cancelled');
    const completed = pickups.filter((p) => p.status === 'Completed');
    const totalWeightKg = nonCancelled.reduce((sum, p) => sum + (Number(p.estimatedWeightKg) || 0), 0);
    return {
      totalCount: pickups.length,
      completedCount: completed.length,
      totalWeightKg: Number(totalWeightKg.toFixed(1)),
      estimatedCo2Kg: Number((totalWeightKg * 1.44).toFixed(1)),
    };
  }, [pickups]);

  const fetchPickupTimeline = useCallback(async (pickupId: number) => {
    setLoadingHistoryId(pickupId);
    try {
      const rows = await apiFetch<StatusHistoryEntry[]>(`/api/pickups/${pickupId}/history`);
      setHistoryByPickupId((prev) => ({ ...prev, [pickupId]: rows }));
    } catch {
      setHistoryByPickupId((prev) => ({ ...prev, [pickupId]: prev[pickupId] || [] }));
    } finally {
      setLoadingHistoryId(null);
    }
  }, []);

  // Automatically expand the first pickup on initial render so users immediately see status updates & photos
  useEffect(() => {
    if (expandedId === null && pickups.length > 0) {
      const preferred = pickups.find((p) => p.status === 'Completed') || pickups[0];
      setExpandedId(preferred.id);
      void fetchPickupTimeline(preferred.id);
    }
  }, [pickups, expandedId, fetchPickupTimeline]);

  const handleToggleExpand = (pickupId: number) => {
    if (expandedId === pickupId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(pickupId);
    if (!historyByPickupId[pickupId]) {
      void fetchPickupTimeline(pickupId);
    }
  };

  const handleUploadPhoto = async (requestCode: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      return;
    }
    setUploadingCode(requestCode);
    try {
      const dataUrl = await compressImageFileToDataUrl(file);
      savePickupMaterialPhoto(
        requestCode,
        dataUrl,
        `Collected material photo (${file.name.slice(0, 40)})`
      );
      setStoredPhotos(loadAllStoredPhotos());
    } catch {
      // Non-fatal
    } finally {
      setUploadingCode(null);
    }
  };

  const openQuickReorder = (pickup: PickupRequest) => {
    setReorderTarget(pickup);
    setReorderDate(getTomorrowIso());
    const matchedSlot = PICKUP_TIME_SLOTS.includes(pickup.timeSlot as PickupTimeSlot)
      ? (pickup.timeSlot as PickupTimeSlot)
      : '10:00 AM - 01:00 PM';
    setReorderSlot(matchedSlot);
    setReorderQty(Math.max(1, Number(pickup.quantity) || 1));
    setReorderWeight(Math.max(0.2, Number(pickup.estimatedWeightKg) || 2));
    setReorderNotes(pickup.instructions || '');
    setReorderError(null);
  };

  const handleConfirmQuickReorder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reorderTarget) return;
    setReordering(true);
    setReorderError(null);

    try {
      const created = await apiFetch<PickupRequest>('/api/pickups', {
        method: 'POST',
        body: JSON.stringify({
          deviceName: reorderTarget.deviceName,
          category: reorderTarget.category,
          quantity: Math.max(1, Math.min(5000, Math.round(reorderQty) || 1)),
          estimatedWeightKg: Math.max(0.2, Math.min(50000, Number(reorderWeight) || 1)),
          condition: reorderTarget.condition || 'Non-working',
          pickupAddress: reorderTarget.pickupAddress,
          lat: reorderTarget.lat,
          lng: reorderTarget.lng,
          preferredDate: reorderDate,
          timeSlot: reorderSlot,
          contactName: reorderTarget.contactName,
          contactPhone: reorderTarget.contactPhone,
          instructions: reorderNotes.trim().slice(0, 500),
          confirmDuplicate: true,
        }),
      });

      if (firebaseUser && firebaseUser.emailVerified) {
        void createScheduledPickup(firebaseUser.uid, {
          requestCode: created.requestCode,
          deviceName: created.deviceName,
          category: created.category,
          quantity: created.quantity,
          estimatedWeightKg: created.estimatedWeightKg,
          condition: created.condition,
          pickupAddress: created.pickupAddress,
          lat: created.lat,
          lng: created.lng,
          preferredDate: created.preferredDate,
          timeSlot: created.timeSlot,
          contactName: created.contactName,
          contactPhone: created.contactPhone,
          instructions: created.instructions || '',
        }).catch(() => {});
      }

      // Copy user-uploaded photo from the previous recurring pickup if one existed
      const prevPhotos = storedPhotos[reorderTarget.requestCode];
      if (prevPhotos && prevPhotos.length > 0) {
        savePickupMaterialPhoto(
          created.requestCode,
          prevPhotos[0].dataUrl,
          `Re-ordered from ${reorderTarget.requestCode}`
        );
        setStoredPhotos(loadAllStoredPhotos());
      }

      void pushNotification({
        title: `Recurring Pickup Re-Ordered — ${created.requestCode}`,
        message: `${created.deviceName} (${created.quantity} units, ${created.estimatedWeightKg} kg) scheduled for ${created.preferredDate} (${created.timeSlot}).`,
        category: 'pickup',
      }).catch(() => {});

      setReorderSuccess({
        requestCode: created.requestCode,
        deviceName: created.deviceName,
        preferredDate: created.preferredDate,
        timeSlot: created.timeSlot,
      });
      setReorderTarget(null);
      onRefreshData();
    } catch (err: any) {
      setReorderError(err?.message || 'Unable to submit recurring pickup re-order.');
    } finally {
      setReordering(false);
    }
  };

  const handleOpenInScheduler = (pickup: PickupRequest) => {
    const matchedSlot = PICKUP_TIME_SLOTS.includes(pickup.timeSlot as PickupTimeSlot)
      ? (pickup.timeSlot as PickupTimeSlot)
      : '10:00 AM - 01:00 PM';
    setReorderTarget(null);
    onCustomizeReorder({
      deviceName: pickup.deviceName,
      category: pickup.category,
      condition: pickup.condition || 'Non-working',
      quantity: Math.max(1, Number(pickup.quantity) || 1),
      estimatedWeightKg: Math.max(0.2, Number(pickup.estimatedWeightKg) || 2),
      pickupAddress: pickup.pickupAddress,
      lat: pickup.lat,
      lng: pickup.lng,
      timeSlot: matchedSlot,
      contactName: pickup.contactName,
      contactPhone: pickup.contactPhone,
      instructions: pickup.instructions || '',
    });
  };

  const formatWeightDisplay = (kg: number): string => {
    const rounded = Math.round(kg * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  };

  const openShareModal = (pickup?: PickupRequest) => {
    setShareCopied(false);
    if (pickup) {
      const weight = Math.max(0.1, Number(pickup.estimatedWeightKg) || 0);
      const co2 = Number((weight * 1.44).toFixed(1));
      const weightText = formatWeightDisplay(weight);
      const post = `I just recycled ${weightText} kg of e-waste (${pickup.deviceName}) with Reboot Earth, helping avoid ~${co2} kg of CO₂e emissions! Every responsible pickup keeps toxic heavy metals out of landfills. #EWasteRecycling #CircularEconomy #RebootEarth`;
      setShareModal({
        scopeLabel: `${pickup.requestCode} · ${pickup.category}`,
        weightKg: Number(weightText),
        co2Kg: co2,
        detailLine: `${pickup.deviceName} (${pickup.quantity} units)`,
      });
      setSharePostText(post);
      return;
    }

    const totalWeight = stats.totalWeightKg;
    const totalCo2 = stats.estimatedCo2Kg;
    const weightText = formatWeightDisplay(totalWeight);
    const post = `I just recycled ${weightText} kg of e-waste across ${stats.totalCount} verified pickup${stats.totalCount === 1 ? '' : 's'} with Reboot Earth, helping avoid ~${totalCo2} kg of CO₂e emissions! Join the circular electronics movement. #EWasteRecycling #CircularEconomy #RebootEarth`;
    setShareModal({
      scopeLabel: `Cumulative History (${stats.completedCount} completed)`,
      weightKg: totalWeight,
      co2Kg: totalCo2,
      detailLine: `${stats.totalCount} logged pickup${stats.totalCount === 1 ? '' : 's'}`,
    });
    setSharePostText(post);
  };

  const handleCopyShareText = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(sharePostText);
      } else {
        const el = document.createElement('textarea');
        el.value = sharePostText;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2400);
    } catch {
      setShareCopied(false);
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return;
    try {
      await navigator.share({
        title: 'My E-Waste Recycling Impact — Reboot Earth',
        text: sharePostText,
        url: typeof window !== 'undefined' ? window.location.origin : undefined,
      });
    } catch {
      // User dismissed share sheet
    }
  };

  const handleDownloadReport = () => {
    setDownloadingReport(true);
    setReportNotice(null);
    try {
      const roleLabel = dbUser?.role ? ROLE_LABELS[dbUser.role] : undefined;
      const result = generateRecyclingImpactPdf({
        pickups,
        facilities,
        userName: dbUser?.fullName || firebaseUser?.displayName || undefined,
        userEmail: dbUser?.email || firebaseUser?.email || undefined,
        userRole: roleLabel,
        userCity: firestoreProfile?.city || dbUser?.city || undefined,
      });
      setReportNotice(`Downloaded ${result.fileName}`);
      window.setTimeout(() => setReportNotice(null), 4000);
    } catch {
      setReportNotice('Unable to generate PDF report. Please try again.');
      window.setTimeout(() => setReportNotice(null), 4000);
    } finally {
      setDownloadingReport(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-sky-50 inline-flex items-center gap-2">
            <History className="w-5 h-5 text-sky-500" />
            E-Waste Pickup History Log
          </h3>
          <p className="text-xs text-slate-600 dark:text-sky-200/70 mt-0.5">
            Review past collections, inspect chronological status updates and collected material photos, or quickly re-order recurring pickups.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-sky-900/70 p-1 bg-white dark:bg-[#0B223B]">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950'
                  : 'text-slate-600 dark:text-sky-200/75 hover:bg-slate-100 dark:hover:bg-sky-900/40'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              List View
            </button>
            <button
              type="button"
              onClick={() => setViewMode('map')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                viewMode === 'map'
                  ? 'bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950'
                  : 'text-slate-600 dark:text-sky-200/75 hover:bg-slate-100 dark:hover:bg-sky-900/40'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              Pickup Map
            </button>
          </div>
          <button
            type="button"
            onClick={handleDownloadReport}
            disabled={downloadingReport}
            className="px-3.5 py-2 rounded-lg border border-sky-500/50 bg-sky-600 dark:bg-sky-500 hover:bg-sky-700 dark:hover:bg-sky-400 disabled:opacity-50 text-xs font-semibold text-white dark:text-sky-950 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Download a formatted PDF summary of your recycled e-waste, carbon savings, and milestones"
          >
            {downloadingReport ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileDown className="w-3.5 h-3.5" />
            )}
            {downloadingReport ? 'Generating PDF...' : 'Download Report'}
          </button>
          <button
            type="button"
            onClick={() => openShareModal()}
            disabled={stats.totalWeightKg <= 0}
            className="px-3.5 py-2 rounded-lg border border-emerald-500/50 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-45 text-xs font-semibold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Generate a pre-formatted social media post for your total recycled e-waste"
          >
            <Share2 className="w-3.5 h-3.5" />
            Share Impact
          </button>
          <button
            type="button"
            onClick={() => {
              onRefreshData();
              if (expandedId !== null) void fetchPickupTimeline(expandedId);
            }}
            className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-sky-800 bg-white dark:bg-[#0B223B] text-xs font-medium text-slate-700 dark:text-sky-200 hover:border-sky-500 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh Log
          </button>
        </div>
      </div>

      {/* PDF Download Confirmation Banner */}
      {reportNotice && (
        <div
          role="status"
          className="px-4 py-3 rounded-xl border border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 flex items-center justify-between gap-3 text-xs text-sky-900 dark:text-sky-100"
        >
          <span className="inline-flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
            {reportNotice}
          </span>
          <button
            type="button"
            onClick={() => setReportNotice(null)}
            className="text-sky-700 dark:text-sky-300 cursor-pointer"
            aria-label="Dismiss report notice"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Re-Order Confirmation Banner */}
      {reorderSuccess && (
        <div
          role="status"
          className="p-4 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-0.5">
              <p className="font-semibold text-emerald-900 dark:text-emerald-100">
                Recurring Pickup Re-Ordered —{' '}
                <span className="font-mono">{reorderSuccess.requestCode}</span>
              </p>
              <p className="text-emerald-800 dark:text-emerald-200/80">
                {reorderSuccess.deviceName} scheduled for {reorderSuccess.preferredDate} ({reorderSuccess.timeSlot}).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReorderSuccess(null)}
            className="text-emerald-700 dark:text-emerald-300 self-end sm:self-center cursor-pointer"
            aria-label="Dismiss confirmation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B]">
          <p className="text-[11px] font-medium text-slate-500 dark:text-sky-200/65">Logged Pickups</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50 mt-1">
            {stats.totalCount}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-sky-200/60 mt-0.5">
            {stats.completedCount} completed recovery
          </p>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B]">
          <p className="text-[11px] font-medium text-slate-500 dark:text-sky-200/65">Collected Mass</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50 mt-1">
            {stats.totalWeightKg.toLocaleString()} kg
          </p>
          <p className="text-[11px] text-sky-700 dark:text-sky-400 mt-0.5">Across active &amp; completed runs</p>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B]">
          <p className="text-[11px] font-medium text-slate-500 dark:text-sky-200/65">Est. CO₂e Avoided</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-sky-700 dark:text-sky-400 mt-1">
            {stats.estimatedCo2Kg.toLocaleString()} kg
          </p>
          <p className="text-[11px] text-slate-500 dark:text-sky-200/60 mt-0.5">1.44 kg CO₂e per kg diverted</p>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B]">
          <p className="text-[11px] font-medium text-slate-500 dark:text-sky-200/65">Quick Re-Order Templates</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50 mt-1">
            {quickReorderItems.length}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-sky-200/60 mt-0.5">Ready for 1-click repeat pickup</p>
        </div>
      </div>

      {/* Quick Re-Order Strip for Recurring Items */}
      {quickReorderItems.length > 0 && (
        <div className="p-4 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-semibold text-slate-900 dark:text-sky-50 inline-flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5 text-sky-500" />
                Quick Re-Order Recurring Items
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-sky-200/65">
                Schedule another pickup for frequently collected electronics with your saved address and contact details.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {quickReorderItems.map(({ pickup, count }) => {
              const userPhotos = storedPhotos[pickup.requestCode] || [];
              const thumb = userPhotos[0]?.dataUrl || getCategoryMaterialPhotos(pickup)[0].src;
              return (
                <div
                  key={pickup.requestCode}
                  className="p-3 rounded-lg border border-slate-200 dark:border-sky-900/60 bg-slate-50/70 dark:bg-[#071A2E] flex flex-col justify-between gap-2.5"
                >
                  <div className="flex items-start gap-2.5">
                    <img
                      src={thumb}
                      alt={pickup.deviceName}
                      className="w-12 h-12 rounded-md object-cover border border-slate-200 dark:border-sky-900/70 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-sky-50 line-clamp-2 leading-snug">
                        {pickup.deviceName}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-sky-200/65 mt-0.5 font-mono tabular-nums">
                        {pickup.quantity} units · {pickup.estimatedWeightKg} kg
                        {count > 1 ? ` · ${count}×` : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openQuickReorder(pickup)}
                    className="w-full px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 hover:bg-sky-700 dark:hover:bg-sky-400 inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Quick Re-Order
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search history by request code, device, address, or status..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-sky-900/70 bg-white dark:bg-[#0B223B] text-slate-900 dark:text-sky-50"
          />
        </div>
        <div className="flex items-center gap-1.5 bg-white dark:bg-[#0B223B] p-1 rounded-lg border border-slate-200 dark:border-sky-900/70 self-start">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'completed', label: 'Completed' },
              { id: 'active', label: 'Active' },
              { id: 'cancelled', label: 'Cancelled' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusTab(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                statusTab === tab.id
                  ? 'bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 font-semibold'
                  : 'text-slate-600 dark:text-sky-200/75 hover:bg-slate-100 dark:hover:bg-sky-900/40'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label="Filter by e-waste category"
          className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-sky-900/70 bg-white dark:bg-[#0B223B] text-slate-900 dark:text-sky-50"
        >
          <option value="all">All Categories</option>
          {EWASTE_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        <div className="relative flex items-center">
          <ArrowUpDown className="w-3.5 h-3.5 text-sky-500 absolute left-3 pointer-events-none" />
          <select
            value={sortBy}
            onChange={(e) =>
              setSortBy(e.target.value as 'date_desc' | 'date_asc' | 'weight_desc' | 'weight_asc')
            }
            aria-label="Sort past pickups"
            className="w-full md:w-auto pl-8 pr-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-sky-900/70 bg-white dark:bg-[#0B223B] text-slate-900 dark:text-sky-50 cursor-pointer"
          >
            <option value="date_desc">Date: Newest First</option>
            <option value="date_asc">Date: Oldest First</option>
            <option value="weight_desc">Weight: Heaviest First</option>
            <option value="weight_asc">Weight: Lightest First</option>
          </select>
        </div>
      </div>

      {/* Unified Successful Pickups Map View OR History Log List */}
      {viewMode === 'map' ? (
        <PickupHistoryMapView
          pickups={filteredPickups}
          facilities={facilities}
          getThumbnail={(p) => {
            const userPhotos = storedPhotos[p.requestCode] || [];
            return userPhotos[0]?.dataUrl || getCategoryMaterialPhotos(p)[0].src;
          }}
          onQuickReorder={openQuickReorder}
          onInspectInList={(p) => {
            setViewMode('list');
            setExpandedId(p.id);
            if (!historyByPickupId[p.id]) {
              void fetchPickupTimeline(p.id);
            }
          }}
        />
      ) : filteredPickups.length === 0 ? (
        <div className="p-10 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] text-center space-y-2">
          <Package className="w-8 h-8 text-slate-400 dark:text-sky-400/50 mx-auto" />
          <p className="text-sm font-semibold text-slate-900 dark:text-sky-50">
            No matching pickup history found
          </p>
          <p className="text-xs text-slate-500 dark:text-sky-200/65">
            Adjust your filters or schedule a new doorstep e-waste pickup to begin building your chain-of-custody log.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPickups.map((pickup) => {
            const isExpanded = expandedId === pickup.id;
            const facility = pickup.assignedFacilityId
              ? facilityById.get(pickup.assignedFacilityId)
              : undefined;
            const vehicle = pickup.assignedVehicleId
              ? vehicleById.get(pickup.assignedVehicleId)
              : undefined;
            const stageIndex = PICKUP_STATUS_FLOW.indexOf(pickup.status as any);
            const isCancelled = pickup.status === 'Cancelled';
            const userPhotos = storedPhotos[pickup.requestCode] || [];
            const defaultPhotos = getCategoryMaterialPhotos(pickup);
            const allPhotos = [
              ...userPhotos.map((u) => ({ src: u.dataUrl, caption: u.caption, isUserPhoto: true })),
              ...defaultPhotos.map((d) => ({ src: d.src, caption: d.caption, isUserPhoto: false })),
            ];
            const timeline = historyByPickupId[pickup.id];
            const recKey = `${pickup.deviceName.trim().toLowerCase()}|${pickup.category.trim().toLowerCase()}`;
            const repeatCount = recurrenceCounts.get(recKey) || 1;

            return (
              <article
                key={pickup.id}
                className="rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] overflow-hidden"
              >
                {/* Top Summary Row */}
                <div className="p-5 flex flex-col lg:flex-row gap-4 justify-between">
                  <div className="flex gap-4 min-w-0">
                    {/* Primary Material Photo Thumbnail */}
                    <button
                      type="button"
                      onClick={() =>
                        setLightbox({
                          src: allPhotos[0].src,
                          caption: allPhotos[0].caption,
                          requestCode: pickup.requestCode,
                          deviceName: pickup.deviceName,
                        })
                      }
                      className="group relative w-24 h-24 sm:w-28 sm:h-24 rounded-lg overflow-hidden border border-slate-200 dark:border-sky-900/70 shrink-0 bg-slate-100 dark:bg-[#061526] cursor-pointer"
                      title="Inspect collected material photo"
                    >
                      <img
                        src={allPhotos[0].src}
                        alt={pickup.deviceName}
                        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                      />
                      <span className="absolute inset-0 bg-slate-950/0 group-hover:bg-slate-950/35 transition-colors flex items-center justify-center">
                        <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </span>
                      <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-slate-950/75 text-white text-[10px] font-mono">
                        {allPhotos.length} img
                      </span>
                    </button>

                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-sky-700 dark:text-sky-400">
                          {pickup.requestCode}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold ${statusBadgeStyle(
                            pickup.status
                          )}`}
                        >
                          {pickup.status}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-sky-200/65">
                          {pickup.category}
                        </span>
                        {repeatCount > 1 && (
                          <span className="text-[11px] font-medium text-sky-700 dark:text-sky-300">
                            · Recurring ({repeatCount}×)
                          </span>
                        )}
                      </div>

                      <h4 className="text-base font-semibold text-slate-900 dark:text-sky-50 leading-snug">
                        {pickup.deviceName}
                      </h4>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-sky-200/75">
                        <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                          <Package className="w-3.5 h-3.5 text-sky-500" />
                          {pickup.quantity} units · {pickup.estimatedWeightKg} kg
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-sky-500" />
                          {pickup.preferredDate} ({pickup.timeSlot})
                        </span>
                        <span className="inline-flex items-center gap-1 truncate max-w-md">
                          <MapPin className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                          <span className="truncate">{pickup.pickupAddress}</span>
                        </span>
                      </div>

                      {(facility || vehicle) && (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-sky-200/65 pt-0.5">
                          {facility && (
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="w-3 h-3 text-emerald-500" />
                              {facility.name} ({facility.city})
                            </span>
                          )}
                          {vehicle && (
                            <span className="inline-flex items-center gap-1 font-mono">
                              <Truck className="w-3 h-3 text-sky-500" />
                              {vehicle.registrationNo} · {vehicle.vehicleType}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Controls */}
                  <div className="flex flex-wrap lg:flex-col items-center lg:items-end justify-start lg:justify-between gap-2 shrink-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {!isCancelled && (
                        <button
                          type="button"
                          onClick={() => openShareModal(pickup)}
                          className="px-3 py-2 rounded-lg text-xs font-semibold border border-emerald-500/45 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                          title={`Share that you recycled ${pickup.estimatedWeightKg} kg of e-waste`}
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          Share
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => openQuickReorder(pickup)}
                        className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 hover:bg-sky-700 dark:hover:bg-sky-400 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Quick Re-Order
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleExpand(pickup.id)}
                        className="px-3 py-2 rounded-lg text-xs font-medium border border-slate-300 dark:border-sky-800 text-slate-700 dark:text-sky-100 hover:bg-slate-100 dark:hover:bg-sky-900/40 inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="w-3.5 h-3.5" />
                            Hide Details
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3.5 h-3.5" />
                            Status &amp; Photos
                          </>
                        )}
                      </button>
                    </div>

                    <p className="text-[11px] text-slate-400 dark:text-sky-200/50 font-mono">
                      Updated {formatDateTime(pickup.updatedAt || pickup.createdAt)}
                    </p>
                  </div>
                </div>

                {/* Expanded Panel: Status Updates Timeline + Collected Materials Gallery */}
                {isExpanded && (
                  <div className="border-t border-slate-200 dark:border-sky-900/60 bg-slate-50/75 dark:bg-[#07182B] p-5 space-y-5">
                    {/* 9-Stage Progress Rail */}
                    {!isCancelled && (
                      <div className="space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-sky-300/70">
                          Chain-of-Custody Stage ({Math.max(1, stageIndex + 1)} of {PICKUP_STATUS_FLOW.length})
                        </p>
                        <div className="grid grid-cols-3 sm:grid-cols-9 gap-1.5">
                          {PICKUP_STATUS_FLOW.map((stage, idx) => {
                            const done = idx <= stageIndex;
                            return (
                              <div key={stage} className="space-y-1">
                                <div
                                  className={`h-1.5 rounded-full ${
                                    done ? 'bg-sky-500' : 'bg-slate-200 dark:bg-sky-950'
                                  }`}
                                />
                                <p
                                  className={`text-[10px] leading-tight ${
                                    done
                                      ? 'text-sky-800 dark:text-sky-300 font-medium'
                                      : 'text-slate-400 dark:text-sky-200/40'
                                  }`}
                                >
                                  {stage}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                      {/* Status Updates Audit Trail */}
                      <div className="lg:col-span-7 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <h5 className="text-xs font-semibold text-slate-900 dark:text-sky-50 inline-flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-sky-500" />
                            Status Updates Log
                          </h5>
                          <button
                            type="button"
                            onClick={() => void fetchPickupTimeline(pickup.id)}
                            className="text-[11px] text-sky-700 dark:text-sky-400 hover:underline cursor-pointer"
                          >
                            Sync updates
                          </button>
                        </div>

                        {loadingHistoryId === pickup.id ? (
                          <div className="p-4 rounded-lg border border-slate-200 dark:border-sky-900/50 bg-white dark:bg-[#0B223B] flex items-center gap-2 text-xs text-slate-500 dark:text-sky-200/70">
                            <Loader2 className="w-4 h-4 animate-spin text-sky-500" />
                            Loading chronological status updates...
                          </div>
                        ) : timeline && timeline.length > 0 ? (
                          <ol className="relative border-l-2 border-sky-200 dark:border-sky-800/80 ml-2 space-y-3 pl-4">
                            {timeline.map((entry, idx) => (
                              <li key={entry.id} className="relative">
                                <span
                                  className={`absolute -left-[22px] top-1 w-3 h-3 rounded-full border-2 border-white dark:border-[#07182B] ${
                                    idx === 0 ? 'bg-sky-500' : 'bg-slate-400 dark:bg-sky-700'
                                  }`}
                                />
                                <div className="p-3 rounded-lg border border-slate-200 dark:border-sky-900/50 bg-white dark:bg-[#0B223B] space-y-1">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-xs font-semibold text-slate-900 dark:text-sky-50">
                                      {entry.fromStatus === 'New'
                                        ? entry.toStatus
                                        : `${entry.fromStatus} → ${entry.toStatus}`}
                                    </p>
                                    <span className="text-[10px] font-mono text-slate-500 dark:text-sky-200/60">
                                      {formatDateTime(entry.createdAt)}
                                    </span>
                                  </div>
                                  {entry.note && (
                                    <p className="text-xs text-slate-600 dark:text-sky-200/75 leading-relaxed">
                                      {entry.note}
                                    </p>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <div className="p-3.5 rounded-lg border border-slate-200 dark:border-sky-900/50 bg-white dark:bg-[#0B223B] text-xs text-slate-600 dark:text-sky-200/75 space-y-1">
                            <p className="font-semibold text-slate-900 dark:text-sky-50">
                              Current Stage: {pickup.status}
                            </p>
                            <p>
                              Request logged on {formatDateTime(pickup.createdAt)} for {pickup.deviceName}.
                              {pickup.instructions ? ` Note: ${pickup.instructions}` : ''}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Collected Materials Photos Gallery */}
                      <div className="lg:col-span-5 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <h5 className="text-xs font-semibold text-slate-900 dark:text-sky-50 inline-flex items-center gap-1.5">
                            <ImageIcon className="w-3.5 h-3.5 text-sky-500" />
                            Collected Material Images ({allPhotos.length})
                          </h5>
                          <label className="px-2.5 py-1 rounded-md border border-sky-600/50 text-[11px] font-medium text-sky-700 dark:text-sky-300 hover:bg-sky-500/10 inline-flex items-center gap-1 cursor-pointer">
                            {uploadingCode === pickup.requestCode ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Camera className="w-3 h-3" />
                            )}
                            Add Photo
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className="hidden"
                              onChange={(e) => void handleUploadPhoto(pickup.requestCode, e)}
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          {allPhotos.map((photo, pIdx) => (
                            <button
                              key={`${pickup.requestCode}_p_${pIdx}`}
                              type="button"
                              onClick={() =>
                                setLightbox({
                                  src: photo.src,
                                  caption: photo.caption,
                                  requestCode: pickup.requestCode,
                                  deviceName: pickup.deviceName,
                                })
                              }
                              className="group relative rounded-lg overflow-hidden border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] text-left cursor-pointer"
                            >
                              <div className="aspect-[4/3] overflow-hidden bg-slate-100 dark:bg-[#061526]">
                                <img
                                  src={photo.src}
                                  alt={photo.caption}
                                  className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                                />
                              </div>
                              <div className="p-2">
                                <p className="text-[10px] font-medium text-slate-700 dark:text-sky-100 line-clamp-2 leading-snug">
                                  {photo.caption}
                                </p>
                                {photo.isUserPhoto && (
                                  <span className="inline-block mt-1 text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                                    Uploaded proof
                                  </span>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Full-Size Collected Material Image Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          onClick={() => setLightbox(null)}
        >
          <div
            className="w-full max-w-2xl rounded-xl border border-slate-200 dark:border-sky-800 bg-white dark:bg-[#0B223B] overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-200 dark:border-sky-900/60 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-xs font-semibold text-sky-700 dark:text-sky-400">
                  {lightbox.requestCode}
                </p>
                <p className="text-sm font-semibold text-slate-900 dark:text-sky-50 truncate">
                  {lightbox.deviceName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLightbox(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                aria-label="Close image preview"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-slate-950 flex items-center justify-center max-h-[65vh] overflow-hidden">
              <img
                src={lightbox.src}
                alt={lightbox.caption}
                className="max-h-[65vh] w-auto object-contain"
              />
            </div>
            <div className="px-4 py-3 text-xs text-slate-600 dark:text-sky-200/80">
              {lightbox.caption}
            </div>
          </div>
        </div>
      )}

      {/* Quick Re-Order Modal */}
      {reorderTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <form
            onSubmit={(e) => void handleConfirmQuickReorder(e)}
            className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-sky-800 bg-white dark:bg-[#0B223B] p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-sky-900/60 pb-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-400">
                  Quick Re-Order · Recurring Pickup
                </p>
                <h4 className="text-base font-semibold text-slate-900 dark:text-sky-50 mt-0.5">
                  {reorderTarget.deviceName}
                </h4>
                <p className="text-xs text-slate-500 dark:text-sky-200/65 mt-0.5">
                  {reorderTarget.category} · {reorderTarget.pickupAddress}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReorderTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {reorderError && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                {reorderError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-sky-200/80 mb-1">
                  Pickup Date *
                </label>
                <input
                  type="date"
                  required
                  min={getTomorrowIso()}
                  value={reorderDate}
                  onChange={(e) => setReorderDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-sky-200/80 mb-1">
                  Time Window *
                </label>
                <select
                  value={reorderSlot}
                  onChange={(e) => setReorderSlot(e.target.value as PickupTimeSlot)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
                >
                  {PICKUP_TIME_SLOTS.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-sky-200/80 mb-1">
                  Quantity (units) *
                </label>
                <input
                  type="number"
                  min={1}
                  max={5000}
                  required
                  value={reorderQty}
                  onChange={(e) => setReorderQty(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-sky-200/80 mb-1">
                  Estimated Weight (kg) *
                </label>
                <input
                  type="number"
                  step="0.1"
                  min={0.2}
                  max={50000}
                  required
                  value={reorderWeight}
                  onChange={(e) => setReorderWeight(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-sky-200/80 mb-1">
                  Pickup Instructions
                </label>
                <input
                  type="text"
                  maxLength={500}
                  value={reorderNotes}
                  onChange={(e) => setReorderNotes(e.target.value)}
                  placeholder="Optional access or battery handling notes"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-sky-900/60">
              <button
                type="button"
                onClick={() => handleOpenInScheduler(reorderTarget)}
                className="px-3 py-2 rounded-lg text-xs font-medium text-sky-700 dark:text-sky-300 hover:bg-sky-500/10 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Edit All Fields in Scheduler
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReorderTarget(null)}
                  className="px-3.5 py-2 rounded-lg text-xs border border-slate-300 dark:border-sky-800 text-slate-700 dark:text-sky-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reordering}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 hover:bg-sky-700 dark:hover:bg-sky-400 disabled:opacity-60 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {reordering ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Re-Ordering...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-3.5 h-3.5" />
                      Confirm Instant Re-Order
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Social Media Share Composer Modal */}
      {shareModal && (() => {
        const shareUrl = typeof window !== 'undefined' ? window.location.origin : 'https://rebootearth.app';
        const encodedText = encodeURIComponent(sharePostText);
        const encodedUrl = encodeURIComponent(shareUrl);
        const supportsNativeShare =
          typeof navigator !== 'undefined' && typeof navigator.share === 'function';

        const platforms = [
          {
            name: 'Post on X',
            href: `https://twitter.com/intent/tweet?text=${encodedText}`,
            classes:
              'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-white',
          },
          {
            name: 'Share on LinkedIn',
            href: `https://www.linkedin.com/feed/?shareActive=true&mini=true&text=${encodedText}`,
            classes: 'bg-[#0A66C2] text-white hover:bg-[#0958A8]',
          },
          {
            name: 'WhatsApp',
            href: `https://wa.me/?text=${encodedText}`,
            classes: 'bg-[#16A34A] text-white hover:bg-[#15803D]',
          },
          {
            name: 'Facebook',
            href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`,
            classes: 'bg-[#1877F2] text-white hover:bg-[#1466D1]',
          },
        ];

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
            onClick={() => setShareModal(null)}
          >
            <div
              className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-sky-800 bg-white dark:bg-[#0B223B] p-6 shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-sky-900/60 pb-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1.5">
                    <Share2 className="w-3.5 h-3.5" />
                    Share Recycling Milestone
                  </p>
                  <h4 className="text-base font-semibold text-slate-900 dark:text-sky-50 mt-0.5">
                    I just recycled {formatWeightDisplay(shareModal.weightKg)} kg of e-waste
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-sky-200/65 mt-0.5">
                    {shareModal.scopeLabel} · {shareModal.detailLine}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShareModal(null)}
                  className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                  aria-label="Close share dialog"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Impact Highlight Strip */}
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/35 border border-emerald-200/80 dark:border-emerald-900/60">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                    E-Waste Diverted
                  </p>
                  <p className="font-mono text-xl font-bold tabular-nums text-emerald-900 dark:text-emerald-100 mt-0.5">
                    {formatWeightDisplay(shareModal.weightKg)} kg
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">
                    Est. CO₂e Avoided
                  </p>
                  <p className="font-mono text-xl font-bold tabular-nums text-sky-900 dark:text-sky-100 mt-0.5">
                    {shareModal.co2Kg} kg
                  </p>
                </div>
              </div>

              {/* Editable Pre-Formatted Post */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="social-share-post-text"
                    className="text-xs font-medium text-slate-700 dark:text-sky-200/85"
                  >
                    Pre-formatted social post
                  </label>
                  <span className="text-[11px] font-mono tabular-nums text-slate-400 dark:text-sky-200/50">
                    {sharePostText.length} chars
                  </span>
                </div>
                <textarea
                  id="social-share-post-text"
                  rows={4}
                  value={sharePostText}
                  onChange={(e) => setSharePostText(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50 leading-relaxed resize-none"
                />
              </div>

              {/* Direct Platform Links */}
              <div className="space-y-2">
                <p className="text-[11px] font-medium text-slate-500 dark:text-sky-200/65">
                  Share directly to a platform
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {platforms.map((platform) => (
                    <a
                      key={platform.name}
                      href={platform.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`px-3 py-2 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${platform.classes}`}
                    >
                      <span>{platform.name}</span>
                      <ExternalLink className="w-3 h-3 opacity-80" />
                    </a>
                  ))}
                </div>
              </div>

              {/* Footer Actions: Copy & Native Share */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-sky-900/60">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCopyShareText()}
                    className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 hover:bg-sky-700 dark:hover:bg-sky-400 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {shareCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Copied Post
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy Post Text
                      </>
                    )}
                  </button>

                  {supportsNativeShare && (
                    <button
                      type="button"
                      onClick={() => void handleNativeShare()}
                      className="px-3 py-2 rounded-lg text-xs font-medium border border-slate-300 dark:border-sky-800 text-slate-700 dark:text-sky-100 hover:bg-slate-100 dark:hover:bg-sky-900/40 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      More Apps
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setShareModal(null)}
                  className="px-3.5 py-2 rounded-lg text-xs border border-slate-300 dark:border-sky-800 text-slate-700 dark:text-sky-100 cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
