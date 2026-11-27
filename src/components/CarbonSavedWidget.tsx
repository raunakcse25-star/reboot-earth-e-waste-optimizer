import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Car,
  ChevronDown,
  ChevronUp,
  Info,
  Leaf,
  Smartphone,
  Trees,
} from 'lucide-react';
import type { PickupRequest } from '../types';

export interface MaterialEmissionFactor {
  category: string;
  factorKgCo2PerKg: number;
  rationale: string;
  barClass: string;
}

/**
 * Material-specific lifecycle CO2e avoidance factors (kg CO2e avoided per kg of
 * properly collected & recycled e-waste vs. primary virgin extraction & landfilling).
 * Aligned with US EPA WARM / UNEP e-waste material recovery benchmarks.
 */
export const MATERIAL_EMISSION_FACTORS: Record<string, MaterialEmissionFactor> = {
  'PCB & Components': {
    category: 'PCB & Components',
    factorKgCo2PerKg: 4.85,
    rationale: 'High gold, palladium, silver, and copper refining offset',
    barClass: 'bg-emerald-500 dark:bg-emerald-400',
  },
  'IT & Telecom': {
    category: 'IT & Telecom',
    factorKgCo2PerKg: 3.2,
    rationale: 'Servers, laptops, and telecom hardware with dense IC/metal recovery',
    barClass: 'bg-sky-500 dark:bg-sky-400',
  },
  'Batteries & Power': {
    category: 'Batteries & Power',
    factorKgCo2PerKg: 2.65,
    rationale: 'Lithium, cobalt, nickel, and lead hydrometallurgical recovery',
    barClass: 'bg-cyan-500 dark:bg-cyan-400',
  },
  'Medical & Lab': {
    category: 'Medical & Lab',
    factorKgCo2PerKg: 2.4,
    rationale: 'Precision instrumentation alloys and high-grade electronics',
    barClass: 'bg-teal-500 dark:bg-teal-400',
  },
  'Consumer Electronics': {
    category: 'Consumer Electronics',
    factorKgCo2PerKg: 2.15,
    rationale: 'Displays, audio, and personal devices metal & polymer recovery',
    barClass: 'bg-indigo-500 dark:bg-indigo-400',
  },
  'Solar & Energy': {
    category: 'Solar & Energy',
    factorKgCo2PerKg: 1.95,
    rationale: 'Crystalline silicon, silver contacts, and aluminum frame recovery',
    barClass: 'bg-amber-500 dark:bg-amber-400',
  },
  'Large Appliances': {
    category: 'Large Appliances',
    factorKgCo2PerKg: 1.8,
    rationale: 'Ferrous steel, aluminum, copper compressors, and safe gas capture',
    barClass: 'bg-blue-500 dark:bg-blue-400',
  },
  'Small Appliances': {
    category: 'Small Appliances',
    factorKgCo2PerKg: 1.45,
    rationale: 'Copper windings, mixed metals, and ABS/PP resin recycling',
    barClass: 'bg-slate-500 dark:bg-sky-600',
  },
};

const DEFAULT_EMISSION_FACTOR: MaterialEmissionFactor = {
  category: 'Other Electronics',
  factorKgCo2PerKg: 1.44,
  rationale: 'Baseline mixed electronic waste recycling offset',
  barClass: 'bg-slate-500 dark:bg-slate-400',
};

export const COLLECTED_HISTORY_STATUSES = new Set([
  'Collected',
  'Received at Facility',
  'Processing',
  'Completed',
]);

export function getEmissionFactorForCategory(category: string): MaterialEmissionFactor {
  const exact = MATERIAL_EMISSION_FACTORS[category];
  if (exact) return exact;
  const normalized = category.toLowerCase();
  if (normalized.includes('pcb') || normalized.includes('circuit') || normalized.includes('board')) {
    return MATERIAL_EMISSION_FACTORS['PCB & Components'];
  }
  if (normalized.includes('it') || normalized.includes('telecom') || normalized.includes('laptop') || normalized.includes('server')) {
    return MATERIAL_EMISSION_FACTORS['IT & Telecom'];
  }
  if (normalized.includes('batter') || normalized.includes('power') || normalized.includes('ups')) {
    return MATERIAL_EMISSION_FACTORS['Batteries & Power'];
  }
  if (normalized.includes('medical') || normalized.includes('lab')) {
    return MATERIAL_EMISSION_FACTORS['Medical & Lab'];
  }
  if (normalized.includes('solar') || normalized.includes('energy')) {
    return MATERIAL_EMISSION_FACTORS['Solar & Energy'];
  }
  if (normalized.includes('large') || normalized.includes('fridge') || normalized.includes('ac')) {
    return MATERIAL_EMISSION_FACTORS['Large Appliances'];
  }
  if (normalized.includes('small')) {
    return MATERIAL_EMISSION_FACTORS['Small Appliances'];
  }
  if (normalized.includes('consumer')) {
    return MATERIAL_EMISSION_FACTORS['Consumer Electronics'];
  }
  return { ...DEFAULT_EMISSION_FACTOR, category: category || 'Other Electronics' };
}

interface CategoryBreakdownRow {
  category: string;
  weightKg: number;
  co2SavedKg: number;
  factorKgCo2PerKg: number;
  pickupsCount: number;
  sharePct: number;
  barClass: string;
}

interface CarbonSavedWidgetProps {
  pickups: PickupRequest[];
  onOpenHistory?: () => void;
  onSchedulePickup?: () => void;
}

export const CarbonSavedWidget: React.FC<CarbonSavedWidgetProps> = ({
  pickups,
  onOpenHistory,
  onSchedulePickup,
}) => {
  const [scope, setScope] = useState<'collected' | 'all_active'>('collected');
  const [showFactors, setShowFactors] = useState(false);

  const stats = useMemo(() => {
    const collectedPickups = pickups.filter((p) => COLLECTED_HISTORY_STATUSES.has(p.status));
    const pendingPickups = pickups.filter(
      (p) => !COLLECTED_HISTORY_STATUSES.has(p.status) && p.status !== 'Cancelled'
    );

    const activeSet = scope === 'collected' ? collectedPickups : [...collectedPickups, ...pendingPickups];

    const byCategoryMap = new Map<
      string,
      {
        weightKg: number;
        co2SavedKg: number;
        factorKgCo2PerKg: number;
        pickupsCount: number;
        barClass: string;
      }
    >();

    let totalWeightKg = 0;
    let totalCo2Kg = 0;

    for (const p of activeSet) {
      const weight = Math.max(0, Number(p.estimatedWeightKg) || 0);
      const factorInfo = getEmissionFactorForCategory(p.category);
      const co2 = weight * factorInfo.factorKgCo2PerKg;

      totalWeightKg += weight;
      totalCo2Kg += co2;

      const key = p.category || 'Other Electronics';
      const existing = byCategoryMap.get(key);
      if (existing) {
        existing.weightKg += weight;
        existing.co2SavedKg += co2;
        existing.pickupsCount += 1;
      } else {
        byCategoryMap.set(key, {
          weightKg: weight,
          co2SavedKg: co2,
          factorKgCo2PerKg: factorInfo.factorKgCo2PerKg,
          pickupsCount: 1,
          barClass: factorInfo.barClass,
        });
      }
    }

    let pendingCo2Kg = 0;
    let pendingWeightKg = 0;
    for (const p of pendingPickups) {
      const weight = Math.max(0, Number(p.estimatedWeightKg) || 0);
      const factorInfo = getEmissionFactorForCategory(p.category);
      pendingWeightKg += weight;
      pendingCo2Kg += weight * factorInfo.factorKgCo2PerKg;
    }

    const breakdown: CategoryBreakdownRow[] = Array.from(byCategoryMap.entries())
      .map(([category, row]) => ({
        category,
        weightKg: Number(row.weightKg.toFixed(1)),
        co2SavedKg: Number(row.co2SavedKg.toFixed(1)),
        factorKgCo2PerKg: row.factorKgCo2PerKg,
        pickupsCount: row.pickupsCount,
        sharePct: totalCo2Kg > 0 ? Math.round((row.co2SavedKg / totalCo2Kg) * 100) : 0,
        barClass: row.barClass,
      }))
      .sort((a, b) => b.co2SavedKg - a.co2SavedKg);

    const avgFactor = totalWeightKg > 0 ? totalCo2Kg / totalWeightKg : 0;

    return {
      totalCo2Kg,
      totalWeightKg,
      avgFactor,
      includedCount: activeSet.length,
      collectedCount: collectedPickups.length,
      pendingCount: pendingPickups.length,
      pendingCo2Kg,
      pendingWeightKg,
      breakdown,
      // Standard equivalencies
      kmNotDriven: Math.round(totalCo2Kg / 0.21),
      treeYears: Number((totalCo2Kg / 21.77).toFixed(1)),
      smartphonesCharged: Math.round(totalCo2Kg / 0.00822),
    };
  }, [pickups, scope]);

  const formattedCo2 =
    stats.totalCo2Kg >= 1000
      ? { value: (stats.totalCo2Kg / 1000).toFixed(2), unit: 't CO₂e' }
      : { value: stats.totalCo2Kg.toFixed(1), unit: 'kg CO₂e' };

  return (
    <section
      aria-label="Carbon Saved from E-Waste History Log"
      className="rounded-2xl border border-emerald-200/80 dark:border-emerald-900/50 bg-white dark:bg-[#0B223B] overflow-hidden"
    >
      {/* Top Bar */}
      <div className="px-5 py-4 border-b border-slate-200/80 dark:border-sky-900/60 bg-gradient-to-r from-emerald-50/80 via-sky-50/40 to-transparent dark:from-emerald-950/35 dark:via-sky-950/20 dark:to-transparent flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800/70 flex items-center justify-center text-emerald-700 dark:text-emerald-300 shrink-0">
            <Leaf className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-sky-50">
              Carbon Saved
            </h3>
            <p className="text-[11px] text-slate-600 dark:text-sky-200/70">
              CO₂e emissions avoided calculated by material weight &amp; e-waste category from your history log
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-sky-900/70 p-0.5 bg-white dark:bg-[#061526] text-[11px]">
            <button
              type="button"
              onClick={() => setScope('collected')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                scope === 'collected'
                  ? 'bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950'
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

          {onOpenHistory && (
            <button
              type="button"
              onClick={onOpenHistory}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-sky-800 text-[11px] font-semibold text-sky-700 dark:text-sky-300 hover:border-sky-500 inline-flex items-center gap-1 transition-colors cursor-pointer"
            >
              History Log
              <ArrowUpRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Primary Hero Figure + Equivalencies */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-4 rounded-xl border border-emerald-200/70 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-[#061526] space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              {scope === 'collected'
                ? 'Verified CO₂e Avoided (Collected)'
                : 'Total Projected CO₂e Avoided'}
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-extrabold font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
                {formattedCo2.value}
              </span>
              <span className="text-sm font-semibold text-emerald-800/80 dark:text-emerald-200/80">
                {formattedCo2.unit}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs text-slate-600 dark:text-sky-200/75">
              <span>
                <strong className="font-mono text-slate-900 dark:text-sky-50">
                  {stats.totalWeightKg.toFixed(1)} kg
                </strong>{' '}
                across {stats.includedCount} pickup{stats.includedCount === 1 ? '' : 's'}
              </span>
              {stats.avgFactor > 0 && (
                <span>
                  Avg:{' '}
                  <strong className="font-mono text-slate-900 dark:text-sky-50">
                    {stats.avgFactor.toFixed(2)}
                  </strong>{' '}
                  kg CO₂e/kg
                </span>
              )}
            </div>
            {scope === 'collected' && stats.pendingCount > 0 && (
              <p className="text-[11px] text-sky-700 dark:text-sky-300/90 pt-1 border-t border-emerald-200/60 dark:border-sky-900/60">
                + <strong className="font-mono">{stats.pendingCo2Kg.toFixed(1)} kg CO₂e</strong>{' '}
                projected from {stats.pendingCount} scheduled pickup
                {stats.pendingCount === 1 ? '' : 's'} ({stats.pendingWeightKg.toFixed(1)} kg)
              </p>
            )}
          </div>

          {/* Real-World Equivalencies */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="p-3 rounded-xl border border-slate-200/80 dark:border-sky-900/60 bg-slate-50/70 dark:bg-[#061526] space-y-1">
              <Car className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              <p className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50">
                {stats.kmNotDriven.toLocaleString()}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-sky-200/65 leading-tight">
                Car km avoided
              </p>
            </div>
            <div className="p-3 rounded-xl border border-slate-200/80 dark:border-sky-900/60 bg-slate-50/70 dark:bg-[#061526] space-y-1">
              <Trees className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <p className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50">
                {stats.treeYears.toLocaleString()}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-sky-200/65 leading-tight">
                Tree-years eq.
              </p>
            </div>
            <div className="p-3 rounded-xl border border-slate-200/80 dark:border-sky-900/60 bg-slate-50/70 dark:bg-[#061526] space-y-1">
              <Smartphone className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              <p className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50">
                {stats.smartphonesCharged.toLocaleString()}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-sky-200/65 leading-tight">
                Phone charges
              </p>
            </div>
          </div>
        </div>

        {/* Right: Category-Weighted Material Breakdown */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-sky-300">
              CO₂e Avoided by Material Type
            </h4>
            <button
              type="button"
              onClick={() => setShowFactors((v) => !v)}
              className="text-[11px] font-medium text-sky-700 dark:text-sky-300 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <Info className="w-3 h-3" />
              Emission Factors
              {showFactors ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          {stats.breakdown.length === 0 ? (
            <div className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-sky-900/70 bg-slate-50/60 dark:bg-[#061526] text-center space-y-2.5">
              <p className="text-xs font-semibold text-slate-800 dark:text-sky-100">
                {scope === 'collected' && stats.pendingCount > 0
                  ? 'No pickups marked as Collected yet'
                  : 'No e-waste pickups logged yet'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-sky-200/70 max-w-md mx-auto">
                {scope === 'collected' && stats.pendingCount > 0
                  ? `You have ${stats.pendingCount} active pickup request${stats.pendingCount === 1 ? '' : 's'} in the pipeline worth an estimated ${stats.pendingCo2Kg.toFixed(1)} kg CO₂e. Switch to "Incl. Pipeline" to preview them.`
                  : 'Schedule your first e-waste pickup to track verified carbon savings weighted by material category.'}
              </p>
              <div className="flex items-center justify-center gap-2 pt-1">
                {scope === 'collected' && stats.pendingCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setScope('all_active')}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/40 cursor-pointer"
                  >
                    Preview Pipeline CO₂e
                  </button>
                )}
                {onSchedulePickup && (
                  <button
                    type="button"
                    onClick={onSchedulePickup}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950 hover:bg-emerald-700 dark:hover:bg-emerald-400 cursor-pointer"
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
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-sky-900/60 text-slate-600 dark:text-sky-200">
                        {row.pickupsCount} {row.pickupsCount === 1 ? 'log' : 'logs'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 font-mono tabular-nums">
                      <span className="text-[11px] text-slate-500 dark:text-sky-200/65">
                        {row.weightKg} kg × {row.factorKgCo2PerKg.toFixed(2)}
                      </span>
                      <span className="font-bold text-emerald-700 dark:text-emerald-300">
                        {row.co2SavedKg.toLocaleString()} kg CO₂e
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

          {/* Expandable Methodology & Factors Table */}
          {showFactors && (
            <div className="p-3.5 rounded-xl border border-sky-200/80 dark:border-sky-900/70 bg-sky-50/50 dark:bg-[#061526] space-y-2">
              <p className="text-[11px] text-slate-700 dark:text-sky-100/85 leading-relaxed">
                <strong>Formula:</strong>{' '}
                <code className="font-mono">Total CO₂e Avoided = Σ (Weight_kg × Material_Factor)</code>.
                Material factors reflect avoided virgin mining/refining and landfill emissions per kg of recycled e-waste:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                {Object.values(MATERIAL_EMISSION_FACTORS).map((f) => (
                  <div
                    key={f.category}
                    className="flex items-center justify-between gap-2 text-[11px] px-2.5 py-1.5 rounded-lg bg-white/80 dark:bg-[#0B223B] border border-slate-200/70 dark:border-sky-900/50"
                  >
                    <span className="text-slate-700 dark:text-sky-100 truncate">{f.category}</span>
                    <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-300 shrink-0">
                      {f.factorKgCo2PerKg.toFixed(2)} kg/kg
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
