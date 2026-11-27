import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BatteryCharging,
  BookmarkPlus,
  CalendarClock,
  CheckCircle2,
  Flame,
  Leaf,
  Repeat,
  RotateCcw,
  ShieldAlert,
  Thermometer,
  Trash2,
  Wrench,
} from 'lucide-react';
import {
  BATTERY_CHEMISTRIES,
  BATTERY_DEVICE_PRESETS,
  CHARGE_HABIT_CONFIG,
  THERMAL_PROFILE_CONFIG,
  calculateBatteryHealth,
  createDefaultBatteryInput,
  getPresetById,
  type BatteryChemistryId,
  type BatteryDevicePresetId,
  type BatteryHealthInput,
  type BatteryHealthReport,
  type BatteryVerdictId,
  type ChargeHabitId,
  type SavedBatteryAssessment,
  type ThermalProfileId,
} from '../lib/batteryHealth';
import type { PickupPrefillTemplate } from './PickupHistoryLog';

interface BatteryHealthCalculatorProps {
  userKey: string;
  contactName?: string;
  contactPhone?: string;
  onScheduleRecyclePickup: (prefill: PickupPrefillTemplate) => void;
  onOpenMarketplace: () => void;
}

const VERDICT_META: Record<
  BatteryVerdictId,
  {
    icon: React.ComponentType<{ className?: string }>;
    textTone: string;
    surfaceTone: string;
    borderTone: string;
    barTone: string;
  }
> = {
  keep_optimize: {
    icon: CheckCircle2,
    textTone: 'text-emerald-700 dark:text-emerald-300',
    surfaceTone: 'bg-emerald-50/70 dark:bg-emerald-950/35',
    borderTone: 'border-emerald-300 dark:border-emerald-800/80',
    barTone: 'bg-emerald-600 dark:bg-emerald-400',
  },
  repurpose: {
    icon: Repeat,
    textTone: 'text-sky-700 dark:text-sky-300',
    surfaceTone: 'bg-sky-50/75 dark:bg-sky-950/40',
    borderTone: 'border-sky-300 dark:border-sky-800/80',
    barTone: 'bg-sky-600 dark:bg-sky-400',
  },
  replace_battery: {
    icon: Wrench,
    textTone: 'text-amber-700 dark:text-amber-300',
    surfaceTone: 'bg-amber-50/75 dark:bg-amber-950/35',
    borderTone: 'border-amber-300 dark:border-amber-800/80',
    barTone: 'bg-amber-500 dark:bg-amber-400',
  },
  recycle_now: {
    icon: AlertTriangle,
    textTone: 'text-rose-700 dark:text-rose-300',
    surfaceTone: 'bg-rose-50/75 dark:bg-rose-950/35',
    borderTone: 'border-rose-300 dark:border-rose-800/80',
    barTone: 'bg-rose-600 dark:bg-rose-400',
  },
};

function formatMonthsToHuman(months: number): string {
  if (months <= 0) return '0 mo (EOL)';
  if (months < 12) return `${months} mo`;
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (remMonths === 0) return `${years} yr${years === 1 ? '' : 's'}`;
  return `${years} yr ${remMonths} mo`;
}

export const BatteryHealthCalculator: React.FC<BatteryHealthCalculatorProps> = ({
  userKey,
  contactName = '',
  contactPhone = '',
  onScheduleRecyclePickup,
  onOpenMarketplace,
}) => {
  const storageKey = `reboot_earth_battery_bench_v1_${userKey || 'guest'}`;

  const [input, setInput] = useState<BatteryHealthInput>(() => createDefaultBatteryInput('laptop'));
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [savedBench, setSavedBench] = useState<SavedBatteryAssessment[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed as SavedBatteryAssessment[];
      }
    } catch {
      // Ignore malformed cache
    }
    return [];
  });
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setSavedBench(parsed as SavedBatteryAssessment[]);
          return;
        }
      }
      setSavedBench([]);
    } catch {
      setSavedBench([]);
    }
  }, [storageKey]);

  const persistBench = (next: SavedBatteryAssessment[]) => {
    setSavedBench(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Ignore quota issues
    }
  };

  const report: BatteryHealthReport = useMemo(() => calculateBatteryHealth(input), [input]);
  const preset = useMemo(() => getPresetById(input.devicePreset), [input.devicePreset]);
  const chemSpec = BATTERY_CHEMISTRIES[input.chemistry];
  const verdictMeta = VERDICT_META[report.verdict];
  const VerdictIcon = verdictMeta.icon;

  const handleSelectPreset = (presetId: BatteryDevicePresetId) => {
    setInput(createDefaultBatteryInput(presetId));
    setHoveredIndex(null);
  };

  const handleReset = () => {
    setInput(createDefaultBatteryInput(input.devicePreset));
    setHoveredIndex(null);
  };

  const handleSaveAssessment = () => {
    const m = report.recoverableMinerals;
    const totalG = Math.round((m.lithiumG + m.cobaltG + m.nickelG + m.copperG + m.graphiteG) * 10) / 10;
    const entry: SavedBatteryAssessment = {
      id: `bat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      savedAtIso: new Date().toISOString(),
      input: { ...input },
      estimatedSohPct: report.estimatedSohPct,
      remainingMonthsTo65: report.remainingMonthsTo65,
      verdict: report.verdict,
      verdictLabel: report.verdictLabel,
      embodiedCarbonSavedKg: report.embodiedCarbonSavedKg,
      recoverableTotalG: totalG,
    };
    const next = [entry, ...savedBench].slice(0, 12);
    persistBench(next);
    setSaveFeedback('Saved to comparison bench');
    window.setTimeout(() => setSaveFeedback(null), 2400);
  };

  const handleDeleteAssessment = (id: string) => {
    persistBench(savedBench.filter((item) => item.id !== id));
  };

  const buildPickupPrefill = (
    targetInput: BatteryHealthInput,
    targetReport: BatteryHealthReport
  ): PickupPrefillTemplate => {
    const targetPreset = getPresetById(targetInput.devicePreset);
    const chemLabel = BATTERY_CHEMISTRIES[targetInput.chemistry].shortLabel;
    const hazardNote = targetInput.isSwollen
      ? 'HAZARD FLAG: Swollen battery detected — requires insulated hazmat handling. '
      : targetInput.overheatsWhileCharging
        ? 'THERMAL FLAG: Overheats during charging — handle as damaged battery. '
        : '';
    return {
      deviceName: targetInput.deviceName.trim() || targetPreset.defaultName,
      category: targetPreset.pickupCategory,
      quantity: 1,
      estimatedWeightKg: Math.max(0.1, targetPreset.typicalWeightKg),
      condition: targetReport.suggestedPickupCondition,
      pickupAddress: '',
      lat: 28.6139,
      lng: 77.209,
      timeSlot: '10:00 AM - 01:00 PM',
      contactName,
      contactPhone,
      instructions: `${hazardNote}Battery Diagnostic: ${chemLabel}, ${targetInput.capacityWh} Wh, est. SoH ${targetReport.estimatedSohPct}%, ${targetReport.effectiveCycles} cycles. Verdict: ${targetReport.verdictLabel}.`,
    };
  };

  // SVG Degradation Chart Geometry
  const chartW = 640;
  const chartH = 228;
  const padL = 46;
  const padR = 20;
  const padT = 18;
  const padB = 34;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;

  const yToPx = (soh: number) => {
    const clamped = Math.max(20, Math.min(100, soh));
    return padT + ((100 - clamped) / 80) * innerH;
  };
  const xToPx = (yearOffset: number) => padL + (yearOffset / 6) * innerW;

  const currentLinePath = useMemo(() => {
    return report.projectionCurve
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${xToPx(pt.yearOffset).toFixed(1)} ${yToPx(pt.currentSohPct).toFixed(1)}`)
      .join(' ');
  }, [report.projectionCurve]);

  const currentAreaPath = useMemo(() => {
    if (report.projectionCurve.length === 0) return '';
    const last = report.projectionCurve[report.projectionCurve.length - 1];
    return `${currentLinePath} L ${xToPx(last.yearOffset).toFixed(1)} ${yToPx(20).toFixed(1)} L ${xToPx(0).toFixed(1)} ${yToPx(20).toFixed(1)} Z`;
  }, [currentLinePath, report.projectionCurve]);

  const optimizedLinePath = useMemo(() => {
    return report.projectionCurve
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${xToPx(pt.yearOffset).toFixed(1)} ${yToPx(pt.optimizedSohPct).toFixed(1)}`)
      .join(' ');
  }, [report.projectionCurve]);

  const activePoint =
    hoveredIndex !== null && report.projectionCurve[hoveredIndex]
      ? report.projectionCurve[hoveredIndex]
      : report.projectionCurve[0];

  const mineralRows = [
    { label: 'Lithium (Li)', grams: report.recoverableMinerals.lithiumG },
    { label: 'Cobalt (Co)', grams: report.recoverableMinerals.cobaltG },
    { label: 'Nickel (Ni)', grams: report.recoverableMinerals.nickelG },
    { label: 'Copper (Cu)', grams: report.recoverableMinerals.copperG },
    { label: 'Graphite (C)', grams: report.recoverableMinerals.graphiteG },
  ];
  const maxMineralG = Math.max(1, ...mineralRows.map((r) => r.grams));

  return (
    <div className="space-y-6">
      {/* Header & Preset Selector Bar */}
      <section className="rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-sky-200/70">
              <span>Electrochemical Lifecycle Diagnostic</span>
              <span aria-hidden="true">·</span>
              <span>{chemSpec.shortLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{chemSpec.nominalVoltageV}V nominal</span>
            </div>
            <h3 className="font-display text-lg font-bold text-slate-900 dark:text-sky-50">
              Battery Health &amp; Remaining Useful Life Calculator
            </h3>
            <p className="text-xs text-slate-600 dark:text-sky-200/75 max-w-2xl leading-relaxed">
              Model cyclic capacity fade, thermal calendar aging, and physical safety indicators to decide whether an electronic device should stay in service, be repurposed, receive a replacement pack, or enter certified recycling.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSaveAssessment}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 hover:bg-sky-700 dark:hover:bg-sky-400 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              <BookmarkPlus className="w-3.5 h-3.5" />
              <span>{saveFeedback || 'Save to Bench'}</span>
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-sky-800 text-slate-700 dark:text-sky-200 hover:bg-slate-100 dark:hover:bg-sky-900/40 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Device Preset Segmented Bar */}
        <div className="pt-3 border-t border-slate-200 dark:border-sky-900/50 flex flex-wrap items-center gap-1.5">
          {BATTERY_DEVICE_PRESETS.map((p) => {
            const active = input.devicePreset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectPreset(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'bg-slate-900 dark:bg-sky-400 text-white dark:text-sky-950 font-semibold'
                    : 'bg-slate-100 dark:bg-[#061526] text-slate-700 dark:text-sky-200/80 hover:bg-slate-200 dark:hover:bg-sky-900/50'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Main Asymmetric Split Console */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Parameter & Diagnostic Control Column */}
        <section className="xl:col-span-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] p-5 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-sky-900/50">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50">
              Device &amp; Usage Parameters
            </h4>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-sky-300/75">
              Rated {report.ratedCyclesTo80.toLocaleString()} cyc @ 80%
            </span>
          </div>

          {/* Device Name + Capacity */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1.5">
              <label
                htmlFor="bhc-device-name"
                className="block text-xs font-medium text-slate-700 dark:text-sky-200/90"
              >
                Device Model / Label
              </label>
              <input
                id="bhc-device-name"
                type="text"
                value={input.deviceName}
                onChange={(e) => setInput((prev) => ({ ...prev, deviceName: e.target.value }))}
                placeholder={preset.defaultName}
                className="w-full px-3 py-2 rounded-lg text-xs border border-slate-300 dark:border-sky-800 bg-white dark:bg-[#061526] text-slate-900 dark:text-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="bhc-capacity-wh"
                className="block text-xs font-medium text-slate-700 dark:text-sky-200/90"
              >
                Capacity (Wh)
              </label>
              <input
                id="bhc-capacity-wh"
                type="number"
                min={0.5}
                max={5000}
                step={0.5}
                value={input.capacityWh}
                onChange={(e) =>
                  setInput((prev) => ({
                    ...prev,
                    capacityWh: Math.max(0.5, Number(e.target.value) || 0.5),
                  }))
                }
                className="w-full px-3 py-2 rounded-lg text-xs font-mono tabular-nums border border-slate-300 dark:border-sky-800 bg-white dark:bg-[#061526] text-slate-900 dark:text-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          {/* Chemistry Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700 dark:text-sky-200/90">
                Cell Chemistry
              </span>
              <span className="text-slate-500 dark:text-sky-300/70">
                {chemSpec.thermalStability}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 rounded-lg bg-slate-100 dark:bg-[#061526]">
              {(Object.keys(BATTERY_CHEMISTRIES) as BatteryChemistryId[]).map((chemId) => {
                const c = BATTERY_CHEMISTRIES[chemId];
                const active = input.chemistry === chemId;
                return (
                  <button
                    key={chemId}
                    type="button"
                    onClick={() => setInput((prev) => ({ ...prev, chemistry: chemId }))}
                    className={`px-2 py-1.5 rounded-md text-xs font-medium whitespace-nowrap truncate transition-colors cursor-pointer ${
                      active
                        ? 'bg-white dark:bg-sky-500 text-slate-900 dark:text-sky-950 font-semibold shadow-sm'
                        : 'text-slate-600 dark:text-sky-200/75 hover:text-slate-900 dark:hover:text-sky-50'
                    }`}
                  >
                    {c.shortLabel}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Age Slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="bhc-age" className="font-medium text-slate-700 dark:text-sky-200/90">
                Device Age
              </label>
              <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-sky-50">
                {input.ageYears.toFixed(1)} yrs
              </span>
            </div>
            <input
              id="bhc-age"
              type="range"
              min={0}
              max={10}
              step={0.25}
              value={input.ageYears}
              onChange={(e) => {
                const nextAge = Number(e.target.value);
                setInput((prev) => ({
                  ...prev,
                  ageYears: nextAge,
                  exactCycles:
                    prev.cycleInputMode === 'daily'
                      ? Math.round(nextAge * 365 * prev.dailyCycles)
                      : prev.exactCycles,
                }));
              }}
              className="w-full accent-sky-600 dark:accent-sky-400 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-400 dark:text-sky-300/60">
              <span>0 yr</span>
              <span>2.5 yrs</span>
              <span>5 yrs</span>
              <span>7.5 yrs</span>
              <span>10 yrs</span>
            </div>
          </div>

          {/* Charge Cycles Mode + Control */}
          <div className="space-y-2.5 pt-3 border-t border-slate-200 dark:border-sky-900/50">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-700 dark:text-sky-200/90">
                Cycle Count Source
              </span>
              <div className="inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-[#061526]">
                <button
                  type="button"
                  onClick={() => setInput((prev) => ({ ...prev, cycleInputMode: 'daily' }))}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
                    input.cycleInputMode === 'daily'
                      ? 'bg-white dark:bg-sky-500 text-slate-900 dark:text-sky-950 font-semibold shadow-sm'
                      : 'text-slate-600 dark:text-sky-200/75'
                  }`}
                >
                  Daily Usage
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setInput((prev) => ({
                      ...prev,
                      cycleInputMode: 'exact',
                      exactCycles:
                        prev.cycleInputMode === 'daily'
                          ? Math.round(prev.ageYears * 365 * prev.dailyCycles)
                          : prev.exactCycles,
                    }))
                  }
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
                    input.cycleInputMode === 'exact'
                      ? 'bg-white dark:bg-sky-500 text-slate-900 dark:text-sky-950 font-semibold shadow-sm'
                      : 'text-slate-600 dark:text-sky-200/75'
                  }`}
                >
                  Exact Cycles
                </button>
              </div>
            </div>

            {input.cycleInputMode === 'daily' ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="bhc-daily-cycles" className="text-slate-600 dark:text-sky-200/75">
                    Average full charges / day
                  </label>
                  <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-sky-50">
                    {input.dailyCycles.toFixed(2)} / day · {report.effectiveCycles.toLocaleString()} total
                  </span>
                </div>
                <input
                  id="bhc-daily-cycles"
                  type="range"
                  min={0.1}
                  max={2.5}
                  step={0.05}
                  value={input.dailyCycles}
                  onChange={(e) =>
                    setInput((prev) => ({ ...prev, dailyCycles: Number(e.target.value) }))
                  }
                  className="w-full accent-sky-600 dark:accent-sky-400 cursor-pointer"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="bhc-exact-cycles" className="text-slate-600 dark:text-sky-200/75">
                    OS-reported cycle count
                  </label>
                  <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-sky-50">
                    {input.exactCycles.toLocaleString()} cycles
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    id="bhc-exact-cycles"
                    type="range"
                    min={0}
                    max={3000}
                    step={10}
                    value={Math.min(3000, input.exactCycles)}
                    onChange={(e) =>
                      setInput((prev) => ({ ...prev, exactCycles: Number(e.target.value) }))
                    }
                    className="flex-1 accent-sky-600 dark:accent-sky-400 cursor-pointer"
                  />
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    aria-label="Exact cycle count numeric input"
                    value={input.exactCycles}
                    onChange={(e) =>
                      setInput((prev) => ({
                        ...prev,
                        exactCycles: Math.max(0, Math.round(Number(e.target.value) || 0)),
                      }))
                    }
                    className="w-20 px-2 py-1.5 rounded-lg text-xs font-mono tabular-nums border border-slate-300 dark:border-sky-800 bg-white dark:bg-[#061526] text-slate-900 dark:text-sky-50"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Optional OS Battery Health Calibration */}
          <div className="pt-3 border-t border-slate-200 dark:border-sky-900/50 space-y-2">
            <label className="flex items-center justify-between gap-2 text-xs cursor-pointer">
              <span className="font-medium text-slate-700 dark:text-sky-200/90">
                Calibrate with known OS Battery Health %
              </span>
              <input
                type="checkbox"
                checked={input.useKnownSoh}
                onChange={(e) =>
                  setInput((prev) => ({
                    ...prev,
                    useKnownSoh: e.target.checked,
                    knownSohPct: e.target.checked
                      ? Math.round(report.estimatedSohPct)
                      : prev.knownSohPct,
                  }))
                }
                className="w-4 h-4 accent-sky-600 rounded cursor-pointer"
              />
            </label>
            {input.useKnownSoh && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-sky-300/70">
                    From iOS Battery Health, macOS, or Windows batteryreport
                  </span>
                  <span className="font-mono tabular-nums font-semibold text-sky-700 dark:text-sky-400">
                    {input.knownSohPct}%
                  </span>
                </div>
                <input
                  type="range"
                  min={35}
                  max={100}
                  step={1}
                  value={input.knownSohPct}
                  onChange={(e) =>
                    setInput((prev) => ({ ...prev, knownSohPct: Number(e.target.value) }))
                  }
                  className="w-full accent-sky-600 dark:accent-sky-400 cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* Charging Habit */}
          <div className="pt-3 border-t border-slate-200 dark:border-sky-900/50 space-y-2">
            <span className="block text-xs font-medium text-slate-700 dark:text-sky-200/90">
              Typical Charging Habit
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(CHARGE_HABIT_CONFIG) as ChargeHabitId[]).map((habitId) => {
                const cfg = CHARGE_HABIT_CONFIG[habitId];
                const active = input.chargeHabit === habitId;
                return (
                  <button
                    key={habitId}
                    type="button"
                    onClick={() => setInput((prev) => ({ ...prev, chargeHabit: habitId }))}
                    className={`px-2.5 py-2 rounded-lg border text-left text-xs transition-colors cursor-pointer ${
                      active
                        ? 'border-sky-500 bg-sky-50/80 dark:bg-sky-950/50 text-sky-900 dark:text-sky-100 font-semibold'
                        : 'border-slate-200 dark:border-sky-900/60 text-slate-700 dark:text-sky-200/80 hover:border-slate-300 dark:hover:border-sky-700'
                    }`}
                  >
                    <span className="block truncate">{cfg.shortLabel}</span>
                    <span className="block text-[10px] font-mono tabular-nums text-slate-500 dark:text-sky-300/65 mt-0.5">
                      {cfg.cycleStress.toFixed(2)}× stress
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-sky-200/65">
              {CHARGE_HABIT_CONFIG[input.chargeHabit].hint}
            </p>
          </div>

          {/* Operating Temperature */}
          <div className="pt-3 border-t border-slate-200 dark:border-sky-900/50 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700 dark:text-sky-200/90 inline-flex items-center gap-1.5">
                <Thermometer className="w-3.5 h-3.5 text-slate-400" />
                Operating Thermal Profile
              </span>
              <span className="font-mono tabular-nums text-slate-500 dark:text-sky-300/70">
                {THERMAL_PROFILE_CONFIG[input.thermalProfile].tempRange}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#061526]">
              {(Object.keys(THERMAL_PROFILE_CONFIG) as ThermalProfileId[]).map((tId) => {
                const t = THERMAL_PROFILE_CONFIG[tId];
                const active = input.thermalProfile === tId;
                return (
                  <button
                    key={tId}
                    type="button"
                    onClick={() => setInput((prev) => ({ ...prev, thermalProfile: tId }))}
                    className={`py-1.5 px-2 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      active
                        ? 'bg-white dark:bg-sky-500 text-slate-900 dark:text-sky-950 font-semibold shadow-sm'
                        : 'text-slate-600 dark:text-sky-200/75 hover:text-slate-900 dark:hover:text-sky-50'
                    }`}
                  >
                    {t.shortLabel}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Physical Condition & Safety Indicators */}
          <div className="pt-3 border-t border-slate-200 dark:border-sky-900/50 space-y-2">
            <span className="block text-xs font-medium text-slate-700 dark:text-sky-200/90">
              Physical &amp; Electrical Inspection
            </span>
            <div className="space-y-2 text-xs text-slate-700 dark:text-sky-100/85">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={input.isSwollen}
                  onChange={(e) => setInput((prev) => ({ ...prev, isSwollen: e.target.checked }))}
                  className="mt-0.5 w-4 h-4 accent-rose-600 rounded cursor-pointer"
                />
                <span>
                  <strong className="font-semibold text-rose-700 dark:text-rose-400">
                    Battery swelling or casing bulge
                  </strong>{' '}
                  <span className="text-slate-500 dark:text-sky-200/65">
                    (triggers immediate hazmat recycling verdict)
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={input.overheatsWhileCharging}
                  onChange={(e) =>
                    setInput((prev) => ({ ...prev, overheatsWhileCharging: e.target.checked }))
                  }
                  className="mt-0.5 w-4 h-4 accent-amber-600 rounded cursor-pointer"
                />
                <span>Becomes unusually hot while charging</span>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={input.hasUnexpectedShutdowns}
                  onChange={(e) =>
                    setInput((prev) => ({ ...prev, hasUnexpectedShutdowns: e.target.checked }))
                  }
                  className="mt-0.5 w-4 h-4 accent-sky-600 rounded cursor-pointer"
                />
                <span>Unexpected shutdowns above 20% charge (voltage sag)</span>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={input.chassisIntact}
                  onChange={(e) =>
                    setInput((prev) => ({ ...prev, chassisIntact: e.target.checked }))
                  }
                  className="mt-0.5 w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                />
                <span>Screen, ports, and outer chassis are still functional</span>
              </label>
            </div>
          </div>
        </section>

        {/* Right Telemetry, Degradation Curve & Decision Stage */}
        <section className="xl:col-span-7 space-y-6">
          {/* Primary Diagnostic Verdict & Key Telemetry Strip */}
          <div className="rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] p-5 space-y-5">
            {/* Safety Alert Banner (when swollen / thermal hazard) */}
            {report.safetyWarning && (
              <div
                role="alert"
                className="p-3.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/45 flex items-start gap-3"
              >
                <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-rose-900 dark:text-rose-200">
                    Thermal &amp; Hazmat Safety Override
                  </p>
                  <p className="text-xs text-rose-800 dark:text-rose-300/90 leading-relaxed">
                    {report.safetyWarning}
                  </p>
                </div>
              </div>
            )}

            {/* Verdict Header Row */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="space-y-1.5">
                <div className={`inline-flex items-center gap-1.5 text-xs font-semibold ${verdictMeta.textTone}`}>
                  <VerdictIcon className="w-4 h-4 shrink-0" />
                  <span>{report.verdictLabel}</span>
                  <span className="text-slate-400 dark:text-sky-400/50" aria-hidden="true">
                    ·
                  </span>
                  <span className="font-mono tabular-nums text-slate-500 dark:text-sky-200/75 font-normal">
                    {input.useKnownSoh ? 'OS-Calibrated' : 'Model Estimate'}
                  </span>
                </div>
                <h4 className="font-display text-lg font-bold text-slate-900 dark:text-sky-50 leading-snug">
                  {report.verdictHeadline}
                </h4>
                <p className="text-xs text-slate-600 dark:text-sky-200/80 leading-relaxed max-w-2xl">
                  {report.verdictExplanation}
                </p>
              </div>
            </div>

            {/* Precision 4-Column Metric Strip (Tabular Numerals, Hairline Dividers) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-sky-900/60 border-y border-slate-200 dark:border-sky-900/60 py-3.5">
              <div className="pr-3 pb-3 sm:pb-0">
                <p className="text-[11px] text-slate-500 dark:text-sky-200/70">State of Health</p>
                <p className="mt-1 flex items-baseline gap-1">
                  <span className={`text-2xl font-bold font-mono tabular-nums ${verdictMeta.textTone}`}>
                    {report.estimatedSohPct.toFixed(1)}
                  </span>
                  <span className="text-xs font-mono text-slate-400">%</span>
                </p>
                <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-sky-300/70 mt-0.5">
                  -{report.annualFadeRatePct}% / yr fade
                </p>
              </div>

              <div className="sm:px-4 pb-3 sm:pb-0 pl-3">
                <p className="text-[11px] text-slate-500 dark:text-sky-200/70">Remaining Life (to 65%)</p>
                <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50">
                  {formatMonthsToHuman(report.remainingMonthsTo65)}
                </p>
                <p className="text-[11px] font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-0.5">
                  {report.extraMonthsWithOptimization > 0
                    ? `+${report.extraMonthsWithOptimization} mo w/ 20–80%`
                    : `${formatMonthsToHuman(report.remainingMonthsTo80)} to 80%`}
                </p>
              </div>

              <div className="sm:px-4 pt-3 sm:pt-0 pr-3">
                <p className="text-[11px] text-slate-500 dark:text-sky-200/70">Cycles Remaining</p>
                <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50">
                  {report.remainingCyclesTo65.toLocaleString()}
                </p>
                <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-sky-300/70 mt-0.5">
                  {report.effectiveCycles.toLocaleString()} used ({report.cycleUtilizationPct}%)
                </p>
              </div>

              <div className="sm:pl-4 pt-3 sm:pt-0 pl-3">
                <p className="text-[11px] text-slate-500 dark:text-sky-200/70">Usable Runtime</p>
                <p className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50">
                    {report.effectiveRuntimePct}
                  </span>
                  <span className="text-xs font-mono text-slate-400">%</span>
                </p>
                <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-sky-300/70 mt-0.5">
                  {((input.capacityWh * report.effectiveRuntimePct) / 100).toFixed(1)} Wh usable
                </p>
              </div>
            </div>

            {/* Health Scale Bar with 65% & 80% Reference Markers */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-sky-200/70">
                <span>Capacity Retention Spectrum</span>
                <span className="font-mono tabular-nums">
                  Recycle &lt;65% · Repurpose 65–81% · Optimal ≥82%
                </span>
              </div>
              <div className="relative h-2.5 rounded-full bg-slate-100 dark:bg-[#061526] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${verdictMeta.barTone}`}
                  style={{ width: `${Math.max(4, Math.min(100, report.estimatedSohPct))}%` }}
                />
                {/* 65% EOL marker */}
                <span
                  aria-hidden="true"
                  className="absolute top-0 bottom-0 w-px bg-rose-500/80"
                  style={{ left: '65%' }}
                />
                {/* 80% optimal marker */}
                <span
                  aria-hidden="true"
                  className="absolute top-0 bottom-0 w-px bg-emerald-500/80"
                  style={{ left: '80%' }}
                />
              </div>
            </div>

            {/* Direct Circular Action Bar */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => onScheduleRecyclePickup(buildPickupPrefill(input, report))}
                className={`px-4 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  report.verdict === 'recycle_now'
                    ? 'bg-rose-600 hover:bg-rose-700 text-white'
                    : 'bg-sky-600 dark:bg-sky-500 hover:bg-sky-700 dark:hover:bg-sky-400 text-white dark:text-sky-950'
                }`}
              >
                <CalendarClock className="w-3.5 h-3.5" />
                <span>
                  {report.verdict === 'replace_battery'
                    ? 'Recycle Spent Battery Pack'
                    : report.safetyOverride
                      ? 'Schedule Hazmat Battery Pickup'
                      : 'Schedule Certified Recycling Pickup'}
                </span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              {!report.safetyOverride && report.verdict !== 'recycle_now' && (
                <button
                  type="button"
                  onClick={onOpenMarketplace}
                  className="px-4 py-2 rounded-lg text-xs font-semibold border border-emerald-300 dark:border-emerald-700 bg-emerald-50/70 dark:bg-emerald-950/35 text-emerald-800 dark:text-emerald-300 hover:border-emerald-500 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                >
                  <Repeat className="w-3.5 h-3.5" />
                  <span>Donate / Trade on Circular Marketplace</span>
                </button>
              )}
            </div>
          </div>

          {/* Dual-Curve Capacity Degradation Projection Chart */}
          <div className="rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50">
                  6-Year Capacity Degradation Trajectory
                </h4>
                <p className="text-xs text-slate-500 dark:text-sky-200/70">
                  Hover or focus across projection points to compare your current charging profile against 20–80% care.
                </p>
              </div>
              {/* Compact Live Crosshair Readout */}
              <div className="text-right font-mono tabular-nums text-[11px] text-slate-600 dark:text-sky-200/85 shrink-0">
                <div>
                  +{activePoint.yearOffset.toFixed(1)} yr (Age {activePoint.totalAgeYears.toFixed(1)}y) ·{' '}
                  {activePoint.projectedCycles.toLocaleString()} cyc
                </div>
                <div className="flex items-center sm:justify-end gap-3 mt-0.5">
                  <span className="text-sky-700 dark:text-sky-400 font-semibold">
                    Current: {activePoint.currentSohPct.toFixed(1)}%
                  </span>
                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                    20–80% Care: {activePoint.optimizedSohPct.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            <div className="w-full overflow-x-auto">
              <svg
                viewBox={`0 0 ${chartW} ${chartH}`}
                className="w-full h-auto min-w-[420px] select-none cursor-crosshair"
                role="img"
                aria-label="Projected battery capacity retention curve over the next 6 years"
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <defs>
                  <linearGradient id="bhcCurrentFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0284c7" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#0284c7" stopOpacity="0.01" />
                  </linearGradient>
                </defs>

                {/* Horizontal Y-Grid */}
                {[100, 80, 65, 40, 20].map((tick) => {
                  const y = yToPx(tick);
                  const isOptimal = tick === 80;
                  const isEol = tick === 65;
                  return (
                    <g key={tick}>
                      <line
                        x1={padL}
                        x2={chartW - padR}
                        y1={y}
                        y2={y}
                        stroke={isEol ? '#e11d48' : isOptimal ? '#059669' : 'currentColor'}
                        strokeOpacity={isEol || isOptimal ? 0.55 : 0.14}
                        strokeDasharray={isEol || isOptimal ? '4 4' : undefined}
                        strokeWidth={isEol || isOptimal ? 1.25 : 1}
                        className="text-slate-400 dark:text-sky-700"
                      />
                      <text
                        x={padL - 8}
                        y={y + 3.5}
                        textAnchor="end"
                        className={`text-[10px] font-mono ${
                          isEol
                            ? 'fill-rose-600 dark:fill-rose-400 font-semibold'
                            : isOptimal
                              ? 'fill-emerald-600 dark:fill-emerald-400 font-semibold'
                              : 'fill-slate-400 dark:fill-sky-300/60'
                        }`}
                      >
                        {tick}%
                      </text>
                    </g>
                  );
                })}

                {/* Threshold Annotations */}
                <text
                  x={chartW - padR - 4}
                  y={yToPx(80) - 5}
                  textAnchor="end"
                  className="text-[9px] font-mono fill-emerald-600 dark:fill-emerald-400"
                >
                  80% Primary Optimal
                </text>
                <text
                  x={chartW - padR - 4}
                  y={yToPx(65) - 5}
                  textAnchor="end"
                  className="text-[9px] font-mono fill-rose-600 dark:fill-rose-400"
                >
                  65% Serviceable EOL
                </text>

                {/* X-Axis Year Ticks */}
                {[0, 1, 2, 3, 4, 5, 6].map((yr) => {
                  const x = xToPx(yr);
                  return (
                    <g key={yr}>
                      <line
                        x1={x}
                        x2={x}
                        y1={padT}
                        y2={chartH - padB}
                        stroke="currentColor"
                        strokeOpacity={0.09}
                        className="text-slate-400 dark:text-sky-700"
                      />
                      <text
                        x={x}
                        y={chartH - 12}
                        textAnchor="middle"
                        className="text-[10px] font-mono fill-slate-500 dark:fill-sky-300/70"
                      >
                        {yr === 0 ? 'Now' : `+${yr}y`}
                      </text>
                    </g>
                  );
                })}

                {/* Area Fill Under Current Curve */}
                <path d={currentAreaPath} fill="url(#bhcCurrentFill)" />

                {/* Optimized 20-80% Care Dashed Curve */}
                <path
                  d={optimizedLinePath}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                />

                {/* Current Profile Solid Curve */}
                <path
                  d={currentLinePath}
                  fill="none"
                  stroke="#0284c7"
                  strokeWidth={2.5}
                />

                {/* Crosshair Vertical Guide */}
                <line
                  x1={xToPx(activePoint.yearOffset)}
                  x2={xToPx(activePoint.yearOffset)}
                  y1={padT}
                  y2={chartH - padB}
                  stroke="#0ea5e9"
                  strokeOpacity={0.45}
                  strokeDasharray="2 2"
                />

                {/* Highlight Dots at Active Point */}
                <circle
                  cx={xToPx(activePoint.yearOffset)}
                  cy={yToPx(activePoint.optimizedSohPct)}
                  r={4}
                  fill="#10b981"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
                <circle
                  cx={xToPx(activePoint.yearOffset)}
                  cy={yToPx(activePoint.currentSohPct)}
                  r={4.5}
                  fill="#0284c7"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />

                {/* Invisible Interactive Hit Targets for Every Half-Year Point */}
                {report.projectionCurve.map((pt, idx) => {
                  const x = xToPx(pt.yearOffset);
                  const sliceW = innerW / (report.projectionCurve.length - 1);
                  return (
                    <rect
                      key={pt.yearOffset}
                      x={x - sliceW / 2}
                      y={padT}
                      width={sliceW}
                      height={innerH}
                      fill="transparent"
                      onMouseEnter={() => setHoveredIndex(idx)}
                      onClick={() => setHoveredIndex(idx)}
                    />
                  );
                })}
              </svg>
            </div>

            {/* Clean Chart Legend (Unboxed Metadata Style) */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-sky-900/50 text-[11px] text-slate-600 dark:text-sky-200/75">
              <div className="flex flex-wrap items-center gap-4">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-4 h-0.5 bg-sky-600 inline-block" />
                  Current Habit (-{report.annualFadeRatePct}%/yr)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-4 h-0.5 border-t-2 border-dashed border-emerald-500 inline-block" />
                  20–80% Optimized (-{report.optimizedAnnualFadeRatePct}%/yr)
                </span>
              </div>
              <span className="font-mono tabular-nums text-slate-500 dark:text-sky-300/70">
                Knee inflection modeled below 70% SoH
              </span>
            </div>
          </div>

          {/* Decision Intelligence & Circular Material Ledger (Hairline Split) */}
          <div className="rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] p-5 grid grid-cols-1 md:grid-cols-2 gap-6 md:divide-x divide-slate-200 dark:divide-sky-900/60">
            {/* Left: Action Plan + Repurpose or Safety Steps */}
            <div className="space-y-4">
              <div className="space-y-2">
                <h5 className="text-xs font-semibold text-slate-900 dark:text-sky-50">
                  Recommended Next Steps
                </h5>
                <ul className="space-y-1.5 text-xs text-slate-600 dark:text-sky-200/80 leading-relaxed">
                  {report.actionRecommendations.map((step, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="font-mono text-[11px] text-sky-700 dark:text-sky-400 shrink-0">
                        0{idx + 1}.
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-sky-900/50 space-y-2">
                <h5 className="text-xs font-semibold text-slate-900 dark:text-sky-50 inline-flex items-center gap-1.5">
                  {report.verdict === 'recycle_now' ? (
                    <>
                      <Flame className="w-3.5 h-3.5 text-rose-500" />
                      <span>Safe Battery Handling Checklist</span>
                    </>
                  ) : (
                    <>
                      <Leaf className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Second-Life Repurpose Roles</span>
                    </>
                  )}
                </h5>
                <ul className="space-y-1.5 text-xs text-slate-600 dark:text-sky-200/80 leading-relaxed">
                  {(report.verdict === 'recycle_now'
                    ? report.safetyHandlingChecklist
                    : report.repurposeIdeas
                  ).map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span aria-hidden="true" className="text-slate-400">
                        –
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Right: Carbon Impact & Recoverable Critical Minerals */}
            <div className="md:pl-6 space-y-4">
              <div className="space-y-1">
                <h5 className="text-xs font-semibold text-slate-900 dark:text-sky-50">
                  Circular Material &amp; Carbon Ledger
                </h5>
                <p className="text-[11px] text-slate-500 dark:text-sky-200/70">
                  Estimated embodied carbon avoided via reuse vs. critical metals recoverable at end of life ({input.capacityWh} Wh {chemSpec.shortLabel}).
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 py-2.5 border-y border-slate-200 dark:border-sky-900/50">
                <div>
                  <p className="text-[11px] text-slate-500 dark:text-sky-200/70">
                    Embodied CO₂e Saved
                  </p>
                  <p className="text-lg font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                    {report.embodiedCarbonSavedKg} kg
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-500 dark:text-sky-200/70">
                    Est. Metal Recovery
                  </p>
                  <p className="text-lg font-bold font-mono tabular-nums text-sky-700 dark:text-sky-400">
                    ₹{report.recoverableMinerals.estimatedRecoveryInr}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {mineralRows.map((m) => (
                  <div key={m.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 dark:text-sky-200/80">{m.label}</span>
                      <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-sky-50">
                        {m.grams.toFixed(1)} g
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-[#061526] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-sky-600 dark:bg-sky-400"
                        style={{
                          width: `${m.grams > 0 ? Math.max(4, (m.grams / maxMineralG) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Bottom Comparison Bench Table */}
      <section className="rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-sky-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50">
              Saved Device Comparison Bench
            </h4>
            <p className="text-xs text-slate-500 dark:text-sky-200/70">
              Compare multiple household or office electronics side by side to prioritize recycling versus second-life repurposing.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-sky-300/75 shrink-0">
            {savedBench.length} / 12 saved
          </span>
        </div>

        {savedBench.length === 0 ? (
          <div className="p-6 text-center space-y-2">
            <BatteryCharging className="w-6 h-6 text-slate-400 dark:text-sky-400/60 mx-auto" />
            <p className="text-xs font-medium text-slate-700 dark:text-sky-100">
              No devices saved to your comparison bench yet.
            </p>
            <p className="text-xs text-slate-500 dark:text-sky-200/65 max-w-md mx-auto">
              Configure a device above and select “Save to Bench” to compare remaining life, carbon impact, and recycling priority across your electronics.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-[#061526] text-slate-500 dark:text-sky-200/70 border-b border-slate-200 dark:border-sky-900/50">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Device</th>
                  <th className="px-4 py-2.5 font-medium">Chemistry</th>
                  <th className="px-4 py-2.5 font-medium text-right">SoH</th>
                  <th className="px-4 py-2.5 font-medium text-right">RUL (to 65%)</th>
                  <th className="px-4 py-2.5 font-medium">Verdict</th>
                  <th className="px-4 py-2.5 font-medium text-right">CO₂e Saved</th>
                  <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-sky-900/50">
                {savedBench.map((item) => {
                  const meta = VERDICT_META[item.verdict];
                  return (
                    <tr
                      key={item.id}
                      className="text-slate-700 dark:text-sky-100/90 hover:bg-slate-50/70 dark:hover:bg-sky-950/30 transition-colors"
                    >
                      <td className="px-4 py-2.5">
                        <span className="font-semibold text-slate-900 dark:text-sky-50 block">
                          {item.input.deviceName || getPresetById(item.input.devicePreset).defaultName}
                        </span>
                        <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-sky-300/65">
                          {item.input.capacityWh} Wh · {item.input.ageYears.toFixed(1)} yrs
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {BATTERY_CHEMISTRIES[item.input.chemistry].shortLabel}
                      </td>
                      <td className="px-4 py-2.5 font-mono tabular-nums font-semibold text-right">
                        {item.estimatedSohPct.toFixed(1)}%
                      </td>
                      <td className="px-4 py-2.5 font-mono tabular-nums text-right whitespace-nowrap">
                        {formatMonthsToHuman(item.remainingMonthsTo65)}
                      </td>
                      <td className={`px-4 py-2.5 font-semibold whitespace-nowrap ${meta.textTone}`}>
                        {item.verdictLabel}
                      </td>
                      <td className="px-4 py-2.5 font-mono tabular-nums text-right">
                        {item.embodiedCarbonSavedKg} kg
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setInput(item.input);
                              setHoveredIndex(null);
                            }}
                            className="text-sky-700 dark:text-sky-400 hover:underline font-medium cursor-pointer"
                          >
                            Load
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const recomputed = calculateBatteryHealth(item.input);
                              onScheduleRecyclePickup(buildPickupPrefill(item.input, recomputed));
                            }}
                            className="text-emerald-700 dark:text-emerald-400 hover:underline font-medium cursor-pointer"
                          >
                            Recycle
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAssessment(item.id)}
                            aria-label={`Remove ${item.input.deviceName}`}
                            className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
