import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Award,
  CalendarClock,
  Check,
  Copy,
  Download,
  Droplets,
  ExternalLink,
  History,
  Leaf,
  Loader2,
  Package,
  Recycle,
  Share2,
  ShieldCheck,
  Sparkles,
  Trees,
  Zap,
  X,
} from 'lucide-react';
import type { PickupRequest } from '../types';
import type { EcoExperienceSummary } from '../lib/ecoLevelSystem';
import {
  computeLifetimeImpact,
  renderLifetimeImpactPng,
  type InfographicAspect,
  type InfographicTheme,
} from '../lib/lifetimeImpact';

export interface LifetimeImpactPageProps {
  pickups: PickupRequest[];
  ecoExperience: EcoExperienceSummary;
  userName: string;
  userCity: string;
  onOpenHistory: () => void;
  onSchedulePickup: () => void;
}

export const LifetimeImpactPage: React.FC<LifetimeImpactPageProps> = ({
  pickups,
  ecoExperience,
  userName,
  userCity,
  onOpenHistory,
  onSchedulePickup,
}) => {
  const [scope, setScope] = useState<'all' | 'verified'>('all');
  const [posterTheme, setPosterTheme] = useState<InfographicTheme>('ocean');
  const [exportAspect, setExportAspect] = useState<InfographicAspect>('poster');
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [copiedShareText, setCopiedShareText] = useState(false);

  const impact = useMemo(() => computeLifetimeImpact(pickups, scope), [pickups, scope]);

  const shareCaption = useMemo(() => {
    const scopeLabel = scope === 'verified' ? 'verified collected' : 'logged';
    return `My Lifetime E-Waste Impact on Reboot Earth (${ecoExperience.currentTier.title}): ${impact.totalWeightKg.toLocaleString()} kg of electronics recycled across ${impact.totalPickups} ${scopeLabel} pickups — saving ${impact.carbonSavedKg.toLocaleString()} kg CO₂e, ${impact.energySavedKwh.toLocaleString()} kWh of energy, and ${impact.waterSavedLiters.toLocaleString()} L of water! #RebootEarth #CircularEconomy #EWasteRecycling`;
  }, [ecoExperience.currentTier.title, impact, scope]);

  const handleDownloadInfographic = () => {
    setExporting(true);
    setExportNotice(null);
    try {
      const dataUrl = renderLifetimeImpactPng({
        impact,
        ecoExperience,
        userName,
        userCity,
        theme: posterTheme,
        aspect: exportAspect,
      });
      const dateStr = new Date().toISOString().slice(0, 10);
      const fileName = `reboot-earth-lifetime-impact-${exportAspect}-${dateStr}.png`;
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setExportNotice(`Saved ${fileName}`);
      window.setTimeout(() => setExportNotice(null), 4000);
    } catch {
      setExportNotice('Unable to render infographic PNG. Please try again.');
      window.setTimeout(() => setExportNotice(null), 4000);
    } finally {
      setExporting(false);
    }
  };

  const handleNativeShareInfographic = async () => {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return;
    try {
      const dataUrl = renderLifetimeImpactPng({
        impact,
        ecoExperience,
        userName,
        userCity,
        theme: posterTheme,
        aspect: exportAspect,
      });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], 'reboot-earth-lifetime-impact.png', { type: 'image/png' });

      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'My Lifetime Environmental Impact — Reboot Earth',
          text: shareCaption,
          files: [file],
        });
      } else {
        await navigator.share({
          title: 'My Lifetime Environmental Impact — Reboot Earth',
          text: shareCaption,
          url: window.location.origin,
        });
      }
    } catch {
      // User dismissed share sheet
    }
  };

  const handleCopyCaption = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareCaption);
      } else {
        const el = document.createElement('textarea');
        el.value = shareCaption;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopiedShareText(true);
      window.setTimeout(() => setCopiedShareText(false), 2400);
    } catch {
      setCopiedShareText(false);
    }
  };

  // Build SVG Cumulative Trajectory Path
  const chartGeometry = useMemo(() => {
    const pts = impact.timeline;
    const width = 560;
    const height = 156;
    const padX = 16;
    const padY = 18;
    const innerW = width - padX * 2;
    const innerH = height - padY * 2;

    if (pts.length === 0) {
      return { width, height, linePath: '', areaPath: '', coords: [] as { x: number; y: number; label: string; value: number }[] };
    }

    const maxVal = Math.max(1, ...pts.map((p) => p.cumulativeWeightKg));
    const coords = pts.map((p, idx) => {
      const x =
        pts.length === 1
          ? padX + innerW / 2
          : padX + (idx / (pts.length - 1)) * innerW;
      const y = padY + innerH - (p.cumulativeWeightKg / maxVal) * innerH;
      return { x, y, label: p.label, value: p.cumulativeWeightKg };
    });

    const linePath = coords
      .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(' ');
    const areaPath =
      coords.length === 1
        ? `M ${padX} ${height - padY} L ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)} L ${width - padX} ${height - padY} Z`
        : `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${height - padY} L ${coords[0].x.toFixed(1)} ${height - padY} Z`;

    return { width, height, linePath, areaPath, coords };
  }, [impact.timeline]);

  // Build SVG Donut Ring Segments
  const donutSegments = useMemo(() => {
    const radius = 58;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    return impact.categories.slice(0, 6).map((cat) => {
      const fraction = Math.max(0, Math.min(1, cat.sharePct / 100));
      const dash = fraction * circumference;
      const seg = {
        ...cat,
        strokeDasharray: `${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}`,
        strokeDashoffset: (-offset).toFixed(2),
      };
      offset += dash;
      return seg;
    });
  }, [impact.categories]);

  const isOceanPoster = posterTheme === 'ocean';

  // Surface tokens for the live infographic canvas itself (responds directly to Ocean / Editorial poster switch)
  const posterSurface = isOceanPoster
    ? 'bg-[#061526] text-sky-50 border-sky-800/80'
    : 'bg-[#F8FAFC] text-slate-900 border-slate-300';
  const posterCard = isOceanPoster
    ? 'bg-[#0B223B] border-sky-900/70'
    : 'bg-white border-slate-200';
  const posterSubtle = isOceanPoster
    ? 'bg-[#081B30] border-sky-900/60'
    : 'bg-slate-100/85 border-slate-200';
  const posterMuted = isOceanPoster ? 'text-sky-200/70' : 'text-slate-600';
  const posterSubtleText = isOceanPoster ? 'text-sky-300/60' : 'text-slate-500';
  const posterDivider = isOceanPoster ? 'border-sky-900/70' : 'border-slate-200';

  const supportsNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <div className="space-y-6">
      {/* Page Action & Export Toolbar */}
      <div className="rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] p-4 sm:p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            <Award className="w-4 h-4" />
            <span>Cumulative Environmental Infographic</span>
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-sky-50">
            Lifetime Impact Summary
          </h3>
          <p className="text-xs text-slate-600 dark:text-sky-200/75 max-w-2xl">
            Aggregates every record from your pickup history log into a shareable infographic highlighting carbon avoided, energy conserved, water preserved, and urban-mining recovery.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Scope Toggle */}
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-sky-900/70 p-1 bg-slate-50 dark:bg-[#061526]">
            <button
              type="button"
              onClick={() => setScope('all')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                scope === 'all'
                  ? 'bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950'
                  : 'text-slate-600 dark:text-sky-200/75 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All History
            </button>
            <button
              type="button"
              onClick={() => setScope('verified')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                scope === 'verified'
                  ? 'bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950'
                  : 'text-slate-600 dark:text-sky-200/75 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Verified Collected
            </button>
          </div>

          {/* Poster Theme Toggle */}
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-sky-900/70 p-1 bg-slate-50 dark:bg-[#061526]">
            <button
              type="button"
              onClick={() => setPosterTheme('ocean')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                posterTheme === 'ocean'
                  ? 'bg-slate-900 text-sky-100'
                  : 'text-slate-600 dark:text-sky-200/75'
              }`}
            >
              Deep Ocean
            </button>
            <button
              type="button"
              onClick={() => setPosterTheme('editorial')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                posterTheme === 'editorial'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 dark:text-sky-200/75'
              }`}
            >
              Editorial Light
            </button>
          </div>

          {/* Export Format */}
          <select
            value={exportAspect}
            onChange={(e) => setExportAspect(e.target.value as InfographicAspect)}
            aria-label="Infographic export dimensions"
            className="px-3 py-2 rounded-lg text-xs font-medium border border-slate-300 dark:border-sky-800 bg-white dark:bg-[#061526] text-slate-800 dark:text-sky-100 cursor-pointer"
          >
            <option value="poster">Social Poster (4:5 PNG)</option>
            <option value="slide">Widescreen Slide (16:9 PNG)</option>
          </select>

          <button
            type="button"
            onClick={handleDownloadInfographic}
            disabled={exporting}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Download PNG
          </button>

          <button
            type="button"
            onClick={() => setShareModalOpen(true)}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold border border-sky-500/50 bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
            Share
          </button>
        </div>
      </div>

      {exportNotice && (
        <div
          role="status"
          className="px-4 py-3 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-between gap-3 text-xs text-emerald-900 dark:text-emerald-100"
        >
          <span className="inline-flex items-center gap-2 font-medium">
            <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            {exportNotice}
          </span>
          <button
            type="button"
            onClick={() => setExportNotice(null)}
            className="text-emerald-700 dark:text-emerald-300 cursor-pointer"
            aria-label="Dismiss download notice"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* THE SHAREABLE INFOGRAPHIC POSTER */}
      <article
        className={`rounded-2xl border shadow-xl overflow-hidden transition-colors ${posterSurface}`}
      >
        {/* Architectural Accent Top Strip */}
        <div className="h-2 w-full bg-gradient-to-r from-sky-500 via-emerald-500 to-amber-500" />

        <div className="p-6 sm:p-8 lg:p-10 space-y-8">
          {/* 1. Masthead & Identity */}
          <header className={`flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b ${posterDivider}`}>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono uppercase tracking-[0.16em] text-sky-500">
                <span>REBOOT EARTH</span>
                <span>·</span>
                <span>LIFETIME IMPACT DOSSIER</span>
                <span>·</span>
                <span>{scope === 'verified' ? 'VERIFIED COLLECTED' : 'CUMULATIVE HISTORY'}</span>
              </div>
              <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight leading-none">
                {userName || 'Circular Steward'}
              </h2>
              <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${posterMuted}`}>
                <span>{userCity || 'Global Network'}</span>
                <span>·</span>
                <span className="font-semibold">
                  Level {ecoExperience.currentTier.level} — {ecoExperience.currentTier.title}
                </span>
                {impact.firstDateLabel && impact.latestDateLabel && (
                  <>
                    <span>·</span>
                    <span className="font-mono tabular-nums">
                      {impact.firstDateLabel} → {impact.latestDateLabel}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Hero Diverted Mass Callout */}
            <div className={`px-5 py-4 rounded-xl border ${posterCard} flex items-center gap-6 shrink-0`}>
              <div>
                <p className={`text-[10px] font-mono uppercase tracking-widest ${posterSubtleText}`}>
                  Total E-Waste Diverted
                </p>
                <p className="text-3xl sm:text-4xl font-extrabold font-mono tabular-nums tracking-tight mt-0.5">
                  {impact.totalWeightKg.toLocaleString()}{' '}
                  <span className="text-base font-semibold opacity-70">kg</span>
                </p>
              </div>
              <div className={`pl-5 border-l ${posterDivider} space-y-1 font-mono tabular-nums text-xs`}>
                <p>
                  <span className="font-bold">{impact.totalPickups}</span>{' '}
                  <span className={posterSubtleText}>pickups</span>
                </p>
                <p>
                  <span className="font-bold">{impact.totalUnits.toLocaleString()}</span>{' '}
                  <span className={posterSubtleText}>devices</span>
                </p>
                <p>
                  <span className="font-bold text-emerald-500">{impact.completionRatePct}%</span>{' '}
                  <span className={posterSubtleText}>verified</span>
                </p>
              </div>
            </div>
          </header>

          {/* Empty State Helper if user has no matching records */}
          {impact.totalPickups === 0 ? (
            <div className={`p-8 rounded-xl border border-dashed ${posterCard} text-center space-y-3`}>
              <Recycle className="w-9 h-9 mx-auto text-emerald-500" />
              <h4 className="text-base font-bold">
                {scope === 'verified'
                  ? 'No Verified Collected Pickups Yet'
                  : 'Your Lifetime Impact Canvas Awaits'}
              </h4>
              <p className={`text-xs max-w-md mx-auto ${posterMuted}`}>
                {scope === 'verified'
                  ? 'Switch to "All History" above to include scheduled pickups, or wait for your active collections to be verified at a facility.'
                  : 'Schedule your first doorstep e-waste pickup to automatically calculate your carbon, energy, and water savings here.'}
              </p>
              <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                {scope === 'verified' && (
                  <button
                    type="button"
                    onClick={() => setScope('all')}
                    className="px-4 py-2 rounded-lg text-xs font-semibold border border-sky-500 text-sky-500 hover:bg-sky-500/10 cursor-pointer"
                  >
                    View All History
                  </button>
                )}
                <button
                  type="button"
                  onClick={onSchedulePickup}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <CalendarClock className="w-3.5 h-3.5" />
                  Schedule First Pickup
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* 2. Three Environmental Pillars: Carbon, Energy, Water */}
              <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* CARBON */}
                <div className={`p-6 rounded-xl border ${posterCard} flex flex-col justify-between gap-5`}>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-emerald-500">
                        Carbon Avoided
                      </span>
                      <Leaf className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-4xl font-extrabold font-mono tabular-nums tracking-tight">
                        {impact.carbonSavedKg.toLocaleString()}
                      </p>
                      <p className={`text-xs font-semibold mt-0.5 ${posterMuted}`}>
                        kg CO₂e emissions prevented
                      </p>
                    </div>
                  </div>
                  <div className={`pt-4 border-t ${posterDivider} space-y-1.5 text-xs`}>
                    <p className="flex items-center justify-between gap-2">
                      <span className={posterSubtleText}>Mature trees / year</span>
                      <span className="font-mono tabular-nums font-bold text-emerald-500 inline-flex items-center gap-1">
                        <Trees className="w-3.5 h-3.5" />
                        {impact.treesEquivalent.toLocaleString()}
                      </span>
                    </p>
                    <p className="flex items-center justify-between gap-2">
                      <span className={posterSubtleText}>Petrol car travel offset</span>
                      <span className="font-mono tabular-nums font-semibold">
                        {impact.carKmAvoided.toLocaleString()} km
                      </span>
                    </p>
                  </div>
                </div>

                {/* ENERGY */}
                <div className={`p-6 rounded-xl border ${posterCard} flex flex-col justify-between gap-5`}>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-amber-500">
                        Energy Conserved
                      </span>
                      <Zap className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <p className="text-4xl font-extrabold font-mono tabular-nums tracking-tight">
                        {impact.energySavedKwh.toLocaleString()}
                      </p>
                      <p className={`text-xs font-semibold mt-0.5 ${posterMuted}`}>
                        kWh smelting &amp; mining power saved
                      </p>
                    </div>
                  </div>
                  <div className={`pt-4 border-t ${posterDivider} space-y-1.5 text-xs`}>
                    <p className="flex items-center justify-between gap-2">
                      <span className={posterSubtleText}>Avg. home days powered</span>
                      <span className="font-mono tabular-nums font-bold text-amber-500">
                        {impact.householdDaysPowered.toLocaleString()} days
                      </span>
                    </p>
                    <p className="flex items-center justify-between gap-2">
                      <span className={posterSubtleText}>Smartphone full charges</span>
                      <span className="font-mono tabular-nums font-semibold">
                        {impact.smartphoneCharges.toLocaleString()}×
                      </span>
                    </p>
                  </div>
                </div>

                {/* WATER */}
                <div className={`p-6 rounded-xl border ${posterCard} flex flex-col justify-between gap-5`}>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-sky-500">
                        Water Preserved
                      </span>
                      <Droplets className="w-5 h-5 text-sky-500" />
                    </div>
                    <div>
                      <p className="text-4xl font-extrabold font-mono tabular-nums tracking-tight">
                        {impact.waterSavedLiters.toLocaleString()}
                      </p>
                      <p className={`text-xs font-semibold mt-0.5 ${posterMuted}`}>
                        Liters of freshwater protected
                      </p>
                    </div>
                  </div>
                  <div className={`pt-4 border-t ${posterDivider} space-y-1.5 text-xs`}>
                    <p className="flex items-center justify-between gap-2">
                      <span className={posterSubtleText}>8-minute showers saved</span>
                      <span className="font-mono tabular-nums font-bold text-sky-500">
                        {impact.showersEquivalent.toLocaleString()}
                      </span>
                    </p>
                    <p className="flex items-center justify-between gap-2">
                      <span className={posterSubtleText}>Drinking water supplied</span>
                      <span className="font-mono tabular-nums font-semibold">
                        {impact.drinkingWaterDays.toLocaleString()} days
                      </span>
                    </p>
                  </div>
                </div>
              </section>

              {/* 3. Visual Breakdown: Material Streams Donut + Cumulative Trajectory */}
              <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Category Share Donut + Proportional Bars */}
                <div className={`lg:col-span-7 p-6 rounded-xl border ${posterCard} space-y-5`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold">Material Streams Diverted</h4>
                      <p className={`text-xs ${posterMuted}`}>
                        Weight share &amp; lifecycle savings by e-waste category
                      </p>
                    </div>
                    <span className={`text-xs font-mono tabular-nums ${posterSubtleText}`}>
                      {impact.categories.length} {impact.categories.length === 1 ? 'stream' : 'streams'}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    {/* Crisp SVG Ring */}
                    <div className="relative w-36 h-36 shrink-0">
                      <svg viewBox="0 0 144 144" className="w-full h-full -rotate-90">
                        <circle
                          cx="72"
                          cy="72"
                          r="58"
                          fill="none"
                          stroke={isOceanPoster ? '#0F2D4D' : '#E2E8F0'}
                          strokeWidth="16"
                        />
                        {donutSegments.map((seg) => (
                          <circle
                            key={seg.category}
                            cx="72"
                            cy="72"
                            r="58"
                            fill="none"
                            stroke={seg.accentHex}
                            strokeWidth="16"
                            strokeDasharray={seg.strokeDasharray}
                            strokeDashoffset={seg.strokeDashoffset}
                            strokeLinecap="butt"
                          />
                        ))}
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                        <span className="text-lg font-extrabold font-mono tabular-nums leading-none">
                          {impact.totalWeightKg}
                        </span>
                        <span className={`text-[10px] font-mono uppercase mt-0.5 ${posterSubtleText}`}>
                          kg total
                        </span>
                      </div>
                    </div>

                    {/* Stream Bars */}
                    <div className="flex-1 w-full space-y-3">
                      {impact.categories.slice(0, 5).map((cat) => (
                        <div key={cat.category} className="space-y-1">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-semibold flex items-center gap-2 truncate">
                              <span
                                className="w-2.5 h-2.5 rounded-xs shrink-0"
                                style={{ backgroundColor: cat.accentHex }}
                              />
                              <span className="truncate">{cat.category}</span>
                            </span>
                            <span className={`font-mono tabular-nums shrink-0 ${posterMuted}`}>
                              {cat.weightKg} kg · {cat.sharePct}%
                            </span>
                          </div>
                          <div
                            className={`h-2 w-full rounded-full overflow-hidden ${
                              isOceanPoster ? 'bg-[#081B30]' : 'bg-slate-200'
                            }`}
                          >
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.max(4, Math.min(100, cat.sharePct))}%`,
                                backgroundColor: cat.accentHex,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Cumulative Trajectory Spark-Area Chart */}
                <div className={`lg:col-span-5 p-6 rounded-xl border ${posterCard} flex flex-col justify-between gap-4`}>
                  <div>
                    <h4 className="text-sm font-bold">Cumulative Diversion Trajectory</h4>
                    <p className={`text-xs ${posterMuted}`}>
                      Total e-waste mass accumulated across history log periods
                    </p>
                  </div>

                  {chartGeometry.coords.length > 0 ? (
                    <div className="space-y-2">
                      <svg
                        viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
                        className="w-full h-36 overflow-visible"
                        role="img"
                        aria-label="Cumulative recycled e-waste weight over time"
                      >
                        <defs>
                          <linearGradient id="lifetimeAreaGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10B981" stopOpacity="0.35" />
                            <stop offset="100%" stopColor="#10B981" stopOpacity="0.02" />
                          </linearGradient>
                        </defs>
                        {/* Baseline */}
                        <line
                          x1="16"
                          y1={chartGeometry.height - 18}
                          x2={chartGeometry.width - 16}
                          y2={chartGeometry.height - 18}
                          stroke={isOceanPoster ? '#163B63' : '#CBD5E1'}
                          strokeWidth="1"
                        />
                        <path d={chartGeometry.areaPath} fill="url(#lifetimeAreaGrad)" />
                        {chartGeometry.coords.length > 1 && (
                          <path
                            d={chartGeometry.linePath}
                            fill="none"
                            stroke="#10B981"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        )}
                        {chartGeometry.coords.map((pt) => (
                          <circle
                            key={pt.label}
                            cx={pt.x}
                            cy={pt.y}
                            r="4.5"
                            fill="#10B981"
                            stroke={isOceanPoster ? '#0B223B' : '#FFFFFF'}
                            strokeWidth="2"
                          />
                        ))}
                      </svg>
                      <div className={`flex items-center justify-between text-[11px] font-mono tabular-nums ${posterSubtleText}`}>
                        <span>{impact.timeline[0]?.label}</span>
                        {impact.timeline.length > 2 && (
                          <span>{impact.timeline[Math.floor(impact.timeline.length / 2)]?.label}</span>
                        )}
                        <span>
                          {impact.timeline[impact.timeline.length - 1]?.label} ({impact.totalWeightKg} kg)
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className={`text-xs ${posterSubtleText}`}>
                      Timeline updates automatically as dated pickups are logged.
                    </p>
                  )}

                  <div className={`p-3.5 rounded-lg border ${posterSubtle} flex items-center justify-between gap-3 text-xs`}>
                    <span className="inline-flex items-center gap-2 font-medium">
                      <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                      Hazardous battery units isolated
                    </span>
                    <span className="font-mono tabular-nums font-bold">
                      {impact.hazardousItemsDiverted}
                    </span>
                  </div>
                </div>
              </section>

              {/* 4. Urban Mining Yield & Milestones Strip */}
              <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <div className={`lg:col-span-7 p-6 rounded-xl border ${posterCard} space-y-4`}>
                  <div>
                    <h4 className="text-sm font-bold">Urban Mining Secondary Resource Yield</h4>
                    <p className={`text-xs ${posterMuted}`}>
                      Estimated critical metals recovered from your recycled devices instead of mined virgin ore
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className={`p-4 rounded-lg border ${posterSubtle}`}>
                      <p className={`text-[11px] font-medium ${posterSubtleText}`}>Recovered Copper</p>
                      <p className="text-2xl font-extrabold font-mono tabular-nums text-amber-500 mt-1">
                        {impact.copperRecoveredKg} kg
                      </p>
                      <p className={`text-[10px] mt-1 ${posterSubtleText}`}>Cabling, motors &amp; boards</p>
                    </div>
                    <div className={`p-4 rounded-lg border ${posterSubtle}`}>
                      <p className={`text-[11px] font-medium ${posterSubtleText}`}>Aluminum &amp; Steel</p>
                      <p className="text-2xl font-extrabold font-mono tabular-nums text-sky-500 mt-1">
                        {impact.aluminumSteelRecoveredKg} kg
                      </p>
                      <p className={`text-[10px] mt-1 ${posterSubtleText}`}>Enclosures &amp; heatsinks</p>
                    </div>
                    <div className={`p-4 rounded-lg border ${posterSubtle}`}>
                      <p className={`text-[11px] font-medium ${posterSubtleText}`}>Precious Metals</p>
                      <p className="text-2xl font-extrabold font-mono tabular-nums text-emerald-500 mt-1">
                        {impact.preciousMetalsGrams} g
                      </p>
                      <p className={`text-[10px] mt-1 ${posterSubtleText}`}>Gold, silver &amp; palladium</p>
                    </div>
                  </div>
                </div>

                <div className={`lg:col-span-5 p-6 rounded-xl border ${posterCard} flex flex-col justify-between gap-4`}>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-bold inline-flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-emerald-500" />
                        Circular Rank &amp; Milestones
                      </h4>
                      <span className="font-mono tabular-nums text-xs font-bold text-emerald-500">
                        {ecoExperience.unlockedMilestonesCount}/{ecoExperience.milestones.length} unlocked
                      </span>
                    </div>
                    <p className={`text-xs ${posterMuted}`}>
                      {ecoExperience.currentTier.tagline}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                      <span>Level {ecoExperience.currentTier.level}</span>
                      <span>
                        {ecoExperience.nextTier
                          ? `${ecoExperience.kgToNextLevel} kg to ${ecoExperience.nextTier.title}`
                          : 'Max Tier Reached'}
                      </span>
                    </div>
                    <div
                      className={`h-2.5 w-full rounded-full overflow-hidden ${
                        isOceanPoster ? 'bg-[#081B30]' : 'bg-slate-200'
                      }`}
                    >
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-500"
                        style={{ width: `${Math.max(5, ecoExperience.levelProgressPct)}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-dashed border-sky-900/40 text-xs">
                    <span className={posterSubtleText}>
                      {ecoExperience.unlockedBadgesCount} of {ecoExperience.badges.length} eco badges earned
                    </span>
                    <span className="font-mono tabular-nums font-bold">
                      {ecoExperience.xp.toLocaleString()} XP
                    </span>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* 5. Infographic Footer Attribution */}
          <footer className={`pt-5 border-t ${posterDivider} flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[11px] ${posterSubtleText}`}>
            <p>
              Reboot Earth · Recycle Technology. Restart Tomorrow. Environmental equivalents modeled using category-weighted UNEP &amp; US EPA WARM lifecycle factors.
            </p>
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={onOpenHistory}
                className="font-semibold text-sky-500 hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <History className="w-3.5 h-3.5" />
                Inspect History Log
              </button>
              <button
                type="button"
                onClick={onSchedulePickup}
                className="font-semibold text-emerald-500 hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <span>Add Pickup</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </footer>
        </div>
      </article>

      {/* Share Infographic Modal */}
      {shareModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
          onClick={() => setShareModalOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-sky-800 bg-white dark:bg-[#0B223B] p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-sky-900/60">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Share Lifetime Impact Infographic
                </p>
                <h4 className="text-base font-bold text-slate-900 dark:text-sky-50 mt-0.5">
                  {impact.totalWeightKg.toLocaleString()} kg Diverted · {impact.carbonSavedKg.toLocaleString()} kg CO₂e Saved
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShareModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                aria-label="Close share dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5 p-3 rounded-lg bg-slate-50 dark:bg-[#061526] border border-slate-200 dark:border-sky-900/60 text-center">
              <div>
                <p className="text-[10px] uppercase text-emerald-600 dark:text-emerald-400 font-semibold">Carbon</p>
                <p className="font-mono tabular-nums text-sm font-bold text-slate-900 dark:text-sky-50">
                  {impact.carbonSavedKg.toLocaleString()} kg
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-amber-600 dark:text-amber-400 font-semibold">Energy</p>
                <p className="font-mono tabular-nums text-sm font-bold text-slate-900 dark:text-sky-50">
                  {impact.energySavedKwh.toLocaleString()} kWh
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-sky-600 dark:text-sky-400 font-semibold">Water</p>
                <p className="font-mono tabular-nums text-sm font-bold text-slate-900 dark:text-sky-50">
                  {impact.waterSavedLiters.toLocaleString()} L
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700 dark:text-sky-200/80">
                Shareable Caption
              </label>
              <textarea
                readOnly
                rows={4}
                value={shareCaption}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-sky-900 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50 leading-relaxed resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleDownloadInfographic}
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Download PNG Poster
              </button>
              <button
                type="button"
                onClick={() => void handleCopyCaption()}
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {copiedShareText ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedShareText ? 'Copied Summary' : 'Copy Caption'}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareCaption)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 inline-flex items-center justify-center gap-1"
              >
                X / Twitter
                <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href={`https://www.linkedin.com/feed/?shareActive=true&mini=true&text=${encodeURIComponent(shareCaption)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-[#0A66C2] text-white inline-flex items-center justify-center gap-1"
              >
                LinkedIn
                <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(shareCaption)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-[#16A34A] text-white inline-flex items-center justify-center gap-1"
              >
                WhatsApp
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {supportsNativeShare && (
              <button
                type="button"
                onClick={() => void handleNativeShareInfographic()}
                className="w-full py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-sky-800 text-slate-700 dark:text-sky-100 hover:bg-slate-100 dark:hover:bg-sky-900/40 inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Package className="w-3.5 h-3.5" />
                Share Infographic File via Device Sheet
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
