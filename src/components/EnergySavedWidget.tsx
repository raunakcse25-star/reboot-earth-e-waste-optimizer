import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Home,
  Info,
  Lightbulb,
  PlugZap,
  Zap,
} from 'lucide-react';
import type { PickupRequest } from '../types';
import { COLLECTED_HISTORY_STATUSES } from './CarbonSavedWidget';

export interface MaterialEnergyFactor {
  category: string;
  factorKwhPerKg: number;
  factorMjPerKg: number;
  rationale: string;
  barClass: string;
}

const MJ_PER_KWH = 3.6;

/**
 * Material-specific lifecycle electricity & embodied energy savings per kg of
 * recycled e-waste compared to primary ore extraction, refining, and smelting.
 * Aligned with UNEP Global E-Waste Monitor & US EPA WARM benchmarks (1 kWh = 3.6 MJ).
 */
export const MATERIAL_ENERGY_FACTORS: Record<string, MaterialEnergyFactor> = {
  'PCB & Components': {
    category: 'PCB & Components',
    factorKwhPerKg: 18.4,
    factorMjPerKg: Number((18.4 * MJ_PER_KWH).toFixed(1)),
    rationale: 'Avoided primary gold, palladium, silver, and copper electro-refining',
    barClass: 'bg-amber-500 dark:bg-amber-400',
  },
  'IT & Telecom': {
    category: 'IT & Telecom',
    factorKwhPerKg: 14.2,
    factorMjPerKg: Number((14.2 * MJ_PER_KWH).toFixed(1)),
    rationale: 'High-embodied-energy silicon, aluminum housings, and server boards',
    barClass: 'bg-orange-500 dark:bg-orange-400',
  },
  'Batteries & Power': {
    category: 'Batteries & Power',
    factorKwhPerKg: 11.6,
    factorMjPerKg: Number((11.6 * MJ_PER_KWH).toFixed(1)),
    rationale: 'Hydrometallurgical lithium, cobalt, and nickel cathode recovery',
    barClass: 'bg-yellow-500 dark:bg-yellow-400',
  },
  'Medical & Lab': {
    category: 'Medical & Lab',
    factorKwhPerKg: 11.0,
    factorMjPerKg: Number((11.0 * MJ_PER_KWH).toFixed(1)),
    rationale: 'Precision instrumentation alloys and high-grade circuit modules',
    barClass: 'bg-teal-500 dark:bg-teal-400',
  },
  'Solar & Energy': {
    category: 'Solar & Energy',
    factorKwhPerKg: 10.5,
    factorMjPerKg: Number((10.5 * MJ_PER_KWH).toFixed(1)),
    rationale: 'Crystalline silicon wafer and extruded aluminum frame recovery',
    barClass: 'bg-sky-500 dark:bg-sky-400',
  },
  'Consumer Electronics': {
    category: 'Consumer Electronics',
    factorKwhPerKg: 9.8,
    factorMjPerKg: Number((9.8 * MJ_PER_KWH).toFixed(1)),
    rationale: 'Display glass, copper coils, aluminum, and engineered polymers',
    barClass: 'bg-indigo-500 dark:bg-indigo-400',
  },
  'Large Appliances': {
    category: 'Large Appliances',
    factorKwhPerKg: 7.4,
    factorMjPerKg: Number((7.4 * MJ_PER_KWH).toFixed(1)),
    rationale: 'Primary steel, copper compressor windings, and aluminum smelting offset',
    barClass: 'bg-blue-500 dark:bg-blue-400',
  },
  'Small Appliances': {
    category: 'Small Appliances',
    factorKwhPerKg: 6.2,
    factorMjPerKg: Number((6.2 * MJ_PER_KWH).toFixed(1)),
    rationale: 'Copper motor windings, ferrous alloys, and thermoplastics recovery',
    barClass: 'bg-slate-500 dark:bg-sky-600',
  },
};

const DEFAULT_ENERGY_FACTOR: MaterialEnergyFactor = {
  category: 'Other Electronics',
  factorKwhPerKg: 8.5,
  factorMjPerKg: Number((8.5 * MJ_PER_KWH).toFixed(1)),
  rationale: 'Baseline mixed electronic waste embodied energy recovery',
  barClass: 'bg-amber-500 dark:bg-amber-400',
};

export function getEnergyFactorForCategory(category: string): MaterialEnergyFactor {
  const exact = MATERIAL_ENERGY_FACTORS[category];
  if (exact) return exact;
  const normalized = (category || '').toLowerCase();
  if (normalized.includes('pcb') || normalized.includes('circuit') || normalized.includes('board')) {
    return MATERIAL_ENERGY_FACTORS['PCB & Components'];
  }
  if (
    normalized.includes('it') ||
    normalized.includes('telecom') ||
    normalized.includes('laptop') ||
    normalized.includes('server')
  ) {
    return MATERIAL_ENERGY_FACTORS['IT & Telecom'];
  }
  if (normalized.includes('batter') || normalized.includes('power') || normalized.includes('ups')) {
    return MATERIAL_ENERGY_FACTORS['Batteries & Power'];
  }
  if (normalized.includes('medical') || normalized.includes('lab')) {
    return MATERIAL_ENERGY_FACTORS['Medical & Lab'];
  }
  if (normalized.includes('solar') || normalized.includes('energy')) {
    return MATERIAL_ENERGY_FACTORS['Solar & Energy'];
  }
  if (normalized.includes('large') || normalized.includes('fridge') || normalized.includes('ac')) {
    return MATERIAL_ENERGY_FACTORS['Large Appliances'];
  }
  if (normalized.includes('small')) {
    return MATERIAL_ENERGY_FACTORS['Small Appliances'];
  }
  if (normalized.includes('consumer')) {
    return MATERIAL_ENERGY_FACTORS['Consumer Electronics'];
  }
  return { ...DEFAULT_ENERGY_FACTOR, category: category || 'Other Electronics' };
}

interface EnergyBreakdownRow {
  category: string;
  weightKg: number;
  kwhSaved: number;
  mjSaved: number;
  factorKwhPerKg: number;
  factorMjPerKg: number;
  pickupsCount: number;
  sharePct: number;
  barClass: string;
}

interface EnergySavedWidgetProps {
  pickups: PickupRequest[];
  onOpenLifetimeImpact?: () => void;
  onSchedulePickup?: () => void;
}

export const EnergySavedWidget: React.FC<EnergySavedWidgetProps> = ({
  pickups,
  onOpenLifetimeImpact,
  onSchedulePickup,
}) => {
  const [scope, setScope] = useState<'collected' | 'all_active'>('collected');
  const [unit, setUnit] = useState<'kwh' | 'mj'>('kwh');
  const [showFactors, setShowFactors] = useState(false);

  const stats = useMemo(() => {
    const collectedPickups = pickups.filter((p) => COLLECTED_HISTORY_STATUSES.has(p.status));
    const pendingPickups = pickups.filter(
      (p) => !COLLECTED_HISTORY_STATUSES.has(p.status) && p.status !== 'Cancelled'
    );

    const activeSet =
      scope === 'collected' ? collectedPickups : [...collectedPickups, ...pendingPickups];

    const byCategoryMap = new Map<
      string,
      {
        weightKg: number;
        kwhSaved: number;
        factorKwhPerKg: number;
        factorMjPerKg: number;
        pickupsCount: number;
        barClass: string;
      }
    >();

    let totalWeightKg = 0;
    let totalKwh = 0;

    for (const p of activeSet) {
      const weight = Math.max(0, Number(p.estimatedWeightKg) || 0);
      const factorInfo = getEnergyFactorForCategory(p.category);
      const kwh = weight * factorInfo.factorKwhPerKg;

      totalWeightKg += weight;
      totalKwh += kwh;

      const key = p.category || 'Other Electronics';
      const existing = byCategoryMap.get(key);
      if (existing) {
        existing.weightKg += weight;
        existing.kwhSaved += kwh;
        existing.pickupsCount += 1;
      } else {
        byCategoryMap.set(key, {
          weightKg: weight,
          kwhSaved: kwh,
          factorKwhPerKg: factorInfo.factorKwhPerKg,
          factorMjPerKg: factorInfo.factorMjPerKg,
          pickupsCount: 1,
          barClass: factorInfo.barClass,
        });
      }
    }

    let pendingKwh = 0;
    let pendingWeightKg = 0;
    for (const p of pendingPickups) {
      const weight = Math.max(0, Number(p.estimatedWeightKg) || 0);
      const factorInfo = getEnergyFactorForCategory(p.category);
      pendingWeightKg += weight;
      pendingKwh += weight * factorInfo.factorKwhPerKg;
    }

    const totalMj = totalKwh * MJ_PER_KWH;
    const pendingMj = pendingKwh * MJ_PER_KWH;

    const breakdown: EnergyBreakdownRow[] = Array.from(byCategoryMap.entries())
      .map(([category, row]) => {
        const mj = row.kwhSaved * MJ_PER_KWH;
        return {
          category,
          weightKg: Number(row.weightKg.toFixed(1)),
          kwhSaved: Number(row.kwhSaved.toFixed(1)),
          mjSaved: Number(mj.toFixed(1)),
          factorKwhPerKg: row.factorKwhPerKg,
          factorMjPerKg: row.factorMjPerKg,
          pickupsCount: row.pickupsCount,
          sharePct: totalKwh > 0 ? Math.round((row.kwhSaved / totalKwh) * 100) : 0,
          barClass: row.barClass,
        };
      })
      .sort((a, b) => b.kwhSaved - a.kwhSaved);

    const avgKwhPerKg = totalWeightKg > 0 ? totalKwh / totalWeightKg : 0;
    const avgMjPerKg = avgKwhPerKg * MJ_PER_KWH;

    return {
      totalKwh,
      totalMj,
      totalWeightKg,
      avgKwhPerKg,
      avgMjPerKg,
      includedCount: activeSet.length,
      collectedCount: collectedPickups.length,
      pendingCount: pendingPickups.length,
      pendingKwh,
      pendingMj,
      pendingWeightKg,
      breakdown,
      // Real-world electricity equivalencies
      homeDaysPowered: Number((totalKwh / 12).toFixed(1)), // 12 kWh avg daily household usage
      ledBulbHours: Math.round(totalKwh / 0.01), // 10W LED bulb hours
      evKmDriven: Math.round(totalKwh / 0.16), // 16 kWh / 100 km EV range
    };
  }, [pickups, scope]);

  const primaryDisplay = useMemo(() => {
    if (unit === 'kwh') {
      if (stats.totalKwh >= 1000) {
        return {
          value: (stats.totalKwh / 1000).toFixed(2),
          unitLabel: 'MWh',
          companion: `${stats.totalMj >= 1000 ? `${(stats.totalMj / 1000).toFixed(2)} GJ` : `${stats.totalMj.toFixed(1)} MJ`}`,
        };
      }
      return {
        value: stats.totalKwh.toFixed(1),
        unitLabel: 'kWh',
        companion: `${stats.totalMj >= 1000 ? `${(stats.totalMj / 1000).toFixed(2)} GJ` : `${stats.totalMj.toFixed(1)} MJ`}`,
      };
    }

    if (stats.totalMj >= 1000) {
      return {
        value: (stats.totalMj / 1000).toFixed(2),
        unitLabel: 'GJ',
        companion: `${stats.totalKwh >= 1000 ? `${(stats.totalKwh / 1000).toFixed(2)} MWh` : `${stats.totalKwh.toFixed(1)} kWh`}`,
      };
    }
    return {
      value: stats.totalMj.toFixed(1),
      unitLabel: 'MJ',
      companion: `${stats.totalKwh >= 1000 ? `${(stats.totalKwh / 1000).toFixed(2)} MWh` : `${stats.totalKwh.toFixed(1)} kWh`}`,
    };
  }, [stats.totalKwh, stats.totalMj, unit]);

  return (
    <section
      aria-label="Electricity and Megajoules Saved from Recycled Devices"
      className="rounded-2xl border border-amber-200/80 dark:border-amber-900/50 bg-white dark:bg-[#0B223B] overflow-hidden"
    >
      {/* Top Bar */}
      <div className="px-5 py-4 border-b border-slate-200/80 dark:border-sky-900/60 bg-gradient-to-r from-amber-50/80 via-orange-50/40 to-transparent dark:from-amber-950/35 dark:via-orange-950/15 dark:to-transparent flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/50 border border-amber-200 dark:border-amber-800/70 flex items-center justify-center text-amber-700 dark:text-amber-300 shrink-0">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-sky-50">
              Electricity &amp; Energy Saved
            </h3>
            <p className="text-[11px] text-slate-600 dark:text-sky-200/70">
              Total electricity (kWh) &amp; embodied energy (MJ) conserved by recovering recycled electronics
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Unit Switcher: kWh vs MJ */}
          <div
            role="group"
            aria-label="Energy display unit"
            className="inline-flex rounded-lg border border-slate-200 dark:border-sky-900/70 p-0.5 bg-white dark:bg-[#061526] text-[11px]"
          >
            <button
              type="button"
              onClick={() => setUnit('kwh')}
              className={`px-2.5 py-1 rounded-md font-mono font-semibold transition-colors cursor-pointer ${
                unit === 'kwh'
                  ? 'bg-amber-600 dark:bg-amber-500 text-white dark:text-amber-950'
                  : 'text-slate-600 dark:text-sky-200/75 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              kWh
            </button>
            <button
              type="button"
              onClick={() => setUnit('mj')}
              className={`px-2.5 py-1 rounded-md font-mono font-semibold transition-colors cursor-pointer ${
                unit === 'mj'
                  ? 'bg-amber-600 dark:bg-amber-500 text-white dark:text-amber-950'
                  : 'text-slate-600 dark:text-sky-200/75 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              MJ
            </button>
          </div>

          {/* Scope Switcher */}
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-sky-900/70 p-0.5 bg-white dark:bg-[#061526] text-[11px]">
            <button
              type="button"
              onClick={() => setScope('collected')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                scope === 'collected'
                  ? 'bg-amber-600 dark:bg-amber-500 text-white dark:text-amber-950'
                  : 'text-slate-600 dark:text-sky-200/75 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Collected ({stats.collectedCount})
            </button>
            <button
              type="button"
              onClick={() => setScope('all_active')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                scope === 'all_active'
                  ? 'bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950'
                  : 'text-slate-600 dark:text-sky-200/75 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Incl. Pipeline ({stats.collectedCount + stats.pendingCount})
            </button>
          </div>

          {onOpenLifetimeImpact && (
            <button
              type="button"
              onClick={onOpenLifetimeImpact}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-sky-800 text-[11px] font-semibold text-amber-700 dark:text-amber-300 hover:border-amber-500 inline-flex items-center gap-1 transition-colors cursor-pointer"
            >
              Lifetime Infographic
              <ArrowUpRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Primary Hero Readout (kWh + MJ) & Equivalencies */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-4 rounded-xl border border-amber-200/70 dark:border-amber-900/50 bg-amber-50/50 dark:bg-[#061526] space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              {scope === 'collected'
                ? 'Verified Energy Conserved (Collected)'
                : 'Total Projected Energy Conserved'}
            </p>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-extrabold font-mono tabular-nums text-amber-700 dark:text-amber-300">
                  {primaryDisplay.value}
                </span>
                <span className="text-sm font-semibold text-amber-800/80 dark:text-amber-200/80">
                  {primaryDisplay.unitLabel}
                </span>
              </div>
              <span className="text-xs font-mono tabular-nums font-semibold text-slate-600 dark:text-sky-200/80">
                = {primaryDisplay.companion}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs text-slate-600 dark:text-sky-200/75">
              <span>
                <strong className="font-mono text-slate-900 dark:text-sky-50">
                  {stats.totalWeightKg.toFixed(1)} kg
                </strong>{' '}
                across {stats.includedCount} pickup{stats.includedCount === 1 ? '' : 's'}
              </span>
              {stats.avgKwhPerKg > 0 && (
                <span>
                  Avg:{' '}
                  <strong className="font-mono text-slate-900 dark:text-sky-50">
                    {unit === 'kwh' ? stats.avgKwhPerKg.toFixed(1) : stats.avgMjPerKg.toFixed(1)}
                  </strong>{' '}
                  {unit === 'kwh' ? 'kWh/kg' : 'MJ/kg'}
                </span>
              )}
            </div>

            {scope === 'collected' && stats.pendingCount > 0 && (
              <p className="text-[11px] text-sky-700 dark:text-sky-300/90 pt-1 border-t border-amber-200/60 dark:border-sky-900/60">
                +{' '}
                <strong className="font-mono tabular-nums">
                  {unit === 'kwh'
                    ? `${stats.pendingKwh.toFixed(1)} kWh`
                    : `${stats.pendingMj.toFixed(1)} MJ`}
                </strong>{' '}
                projected from {stats.pendingCount} scheduled pickup
                {stats.pendingCount === 1 ? '' : 's'} ({stats.pendingWeightKg.toFixed(1)} kg)
              </p>
            )}
          </div>

          {/* Real-World Electricity Equivalencies */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="p-3 rounded-xl border border-slate-200/80 dark:border-sky-900/60 bg-slate-50/70 dark:bg-[#061526] space-y-1">
              <Home className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <p className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50">
                {stats.homeDaysPowered.toLocaleString()}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-sky-200/65 leading-tight">
                Home days powered
              </p>
            </div>
            <div className="p-3 rounded-xl border border-slate-200/80 dark:border-sky-900/60 bg-slate-50/70 dark:bg-[#061526] space-y-1">
              <Lightbulb className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400" />
              <p className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50">
                {stats.ledBulbHours.toLocaleString()}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-sky-200/65 leading-tight">
                10W LED hrs
              </p>
            </div>
            <div className="p-3 rounded-xl border border-slate-200/80 dark:border-sky-900/60 bg-slate-50/70 dark:bg-[#061526] space-y-1">
              <PlugZap className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              <p className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50">
                {stats.evKmDriven.toLocaleString()}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-sky-200/65 leading-tight">
                EV range km
              </p>
            </div>
          </div>
        </div>

        {/* Right: Category-Weighted Energy Recovery Breakdown */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-sky-300">
              {unit === 'kwh' ? 'Electricity (kWh)' : 'Energy (MJ)'} Conserved by Device Stream
            </h4>
            <button
              type="button"
              onClick={() => setShowFactors((v) => !v)}
              className="text-[11px] font-medium text-amber-700 dark:text-amber-300 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <Info className="w-3 h-3" />
              Energy Factors
              {showFactors ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          {stats.breakdown.length === 0 ? (
            <div className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-sky-900/70 bg-slate-50/60 dark:bg-[#061526] text-center space-y-2.5">
              <p className="text-xs font-semibold text-slate-800 dark:text-sky-100">
                {scope === 'collected' && stats.pendingCount > 0
                  ? 'No pickups marked as Collected yet'
                  : 'No recycled device energy savings logged yet'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-sky-200/70 max-w-md mx-auto">
                {scope === 'collected' && stats.pendingCount > 0
                  ? `You have ${stats.pendingCount} active pickup request${stats.pendingCount === 1 ? '' : 's'} worth an estimated ${stats.pendingKwh.toFixed(1)} kWh (${stats.pendingMj.toFixed(0)} MJ). Switch to "Incl. Pipeline" to preview them.`
                  : 'Schedule your first doorstep e-waste pickup to track electricity and megajoules saved from recovering recycled devices.'}
              </p>
              <div className="flex items-center justify-center gap-2 pt-1">
                {scope === 'collected' && stats.pendingCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setScope('all_active')}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-amber-400 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 cursor-pointer"
                  >
                    Preview Pipeline Energy
                  </button>
                )}
                {onSchedulePickup && (
                  <button
                    type="button"
                    onClick={onSchedulePickup}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 dark:bg-amber-500 text-white dark:text-amber-950 hover:bg-amber-700 dark:hover:bg-amber-400 cursor-pointer"
                  >
                    Schedule a Pickup
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {stats.breakdown.map((row) => (
                <div
                  key={row.category}
                  className="p-3 rounded-xl border border-slate-200/80 dark:border-sky-900/60 bg-slate-50/70 dark:bg-[#061526] space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-slate-900 dark:text-sky-50 truncate">
                        {row.category}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 dark:text-sky-300/70">
                        · {row.pickupsCount} {row.pickupsCount === 1 ? 'log' : 'logs'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 font-mono tabular-nums">
                      <span className="text-[11px] text-slate-500 dark:text-sky-200/65">
                        {row.weightKg} kg ×{' '}
                        {unit === 'kwh' ? row.factorKwhPerKg.toFixed(1) : row.factorMjPerKg.toFixed(1)}
                      </span>
                      <span className="font-bold text-amber-700 dark:text-amber-300">
                        {unit === 'kwh'
                          ? `${row.kwhSaved.toLocaleString()} kWh`
                          : `${row.mjSaved.toLocaleString()} MJ`}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-sky-950 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${row.barClass}`}
                        style={{ width: `${Math.max(4, row.sharePct)}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-sky-200/70 w-9 text-right">
                      {row.sharePct}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Expandable Methodology & Energy Recovery Factors Table */}
          {showFactors && (
            <div className="p-3.5 rounded-xl border border-amber-200/80 dark:border-amber-900/70 bg-amber-50/40 dark:bg-[#061526] space-y-2">
              <p className="text-[11px] text-slate-700 dark:text-sky-100/85 leading-relaxed">
                <strong>Formula:</strong>{' '}
                <code className="font-mono">
                  Energy Saved = Σ (Weight_kg × Recovery_kWh/kg)
                </code>{' '}
                and <code className="font-mono">1 kWh = 3.6 MJ</code>. Factors model avoided primary smelting &amp; semiconductor manufacturing energy per kg recycled:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                {Object.values(MATERIAL_ENERGY_FACTORS).map((f) => (
                  <div
                    key={f.category}
                    className="flex items-center justify-between gap-2 text-[11px] px-2.5 py-1.5 rounded-lg bg-white/80 dark:bg-[#0B223B] border border-slate-200/70 dark:border-sky-900/50"
                  >
                    <span className="text-slate-700 dark:text-sky-100 truncate">{f.category}</span>
                    <span className="font-mono font-semibold text-amber-700 dark:text-amber-300 shrink-0">
                      {unit === 'kwh'
                        ? `${f.factorKwhPerKg.toFixed(1)} kWh/kg`
                        : `${f.factorMjPerKg.toFixed(1)} MJ/kg`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
