export type BatteryDevicePresetId =
  | 'smartphone'
  | 'laptop'
  | 'tablet'
  | 'earbuds'
  | 'powerbank'
  | 'ebike'
  | 'ups';

export type BatteryChemistryId = 'li_po_lco' | 'li_nmc' | 'lifepo4' | 'nimh';

export type ChargeHabitId = 'optimized_20_80' | 'standard_0_100' | 'overnight_100' | 'fast_deep';

export type ThermalProfileId = 'cool' | 'moderate' | 'warm' | 'hot';

export type BatteryVerdictId = 'keep_optimize' | 'repurpose' | 'replace_battery' | 'recycle_now';

export interface BatteryDevicePreset {
  id: BatteryDevicePresetId;
  label: string;
  defaultName: string;
  defaultChemistry: BatteryChemistryId;
  defaultCapacityWh: number;
  baseRatedCyclesTo80: number;
  typicalDailyCycles: number;
  typicalWeightKg: number;
  embodiedCarbonKg: number;
  pickupCategory: string;
  batteryReplaceable: boolean;
  repurposeRoles: string[];
}

export interface BatteryChemistrySpec {
  id: BatteryChemistryId;
  label: string;
  shortLabel: string;
  cycleLifeMultiplier: number;
  annualCalendarFadePct: number;
  nominalVoltageV: number;
  thermalStability: string;
  /** Grams of recoverable materials per 100 Wh of cell capacity */
  mineralsPer100Wh: {
    lithiumG: number;
    cobaltG: number;
    nickelG: number;
    copperG: number;
    graphiteG: number;
  };
}

export interface BatteryHealthInput {
  devicePreset: BatteryDevicePresetId;
  deviceName: string;
  chemistry: BatteryChemistryId;
  capacityWh: number;
  ageYears: number;
  cycleInputMode: 'daily' | 'exact';
  dailyCycles: number;
  exactCycles: number;
  useKnownSoh: boolean;
  knownSohPct: number;
  chargeHabit: ChargeHabitId;
  thermalProfile: ThermalProfileId;
  isSwollen: boolean;
  hasUnexpectedShutdowns: boolean;
  overheatsWhileCharging: boolean;
  chassisIntact: boolean;
}

export interface DegradationPoint {
  yearOffset: number;
  totalAgeYears: number;
  currentSohPct: number;
  optimizedSohPct: number;
  projectedCycles: number;
}

export interface RecoverableMinerals {
  lithiumG: number;
  cobaltG: number;
  nickelG: number;
  copperG: number;
  graphiteG: number;
  estimatedRecoveryInr: number;
}

export interface BatteryHealthReport {
  estimatedSohPct: number;
  effectiveCycles: number;
  ratedCyclesTo80: number;
  cycleUtilizationPct: number;
  remainingMonthsTo80: number;
  remainingMonthsTo65: number;
  extraMonthsWithOptimization: number;
  remainingCyclesTo80: number;
  remainingCyclesTo65: number;
  effectiveRuntimePct: number;
  annualFadeRatePct: number;
  optimizedAnnualFadeRatePct: number;
  verdict: BatteryVerdictId;
  verdictLabel: string;
  verdictHeadline: string;
  verdictExplanation: string;
  safetyOverride: boolean;
  safetyWarning: string | null;
  actionRecommendations: string[];
  repurposeIdeas: string[];
  safetyHandlingChecklist: string[];
  embodiedCarbonSavedKg: number;
  recoverableMinerals: RecoverableMinerals;
  suggestedPickupCondition:
    | 'Working / Refurbishable'
    | 'Partially Working'
    | 'Non-working'
    | 'Damaged / Swollen Battery';
  projectionCurve: DegradationPoint[];
}

export interface SavedBatteryAssessment {
  id: string;
  savedAtIso: string;
  input: BatteryHealthInput;
  estimatedSohPct: number;
  remainingMonthsTo65: number;
  verdict: BatteryVerdictId;
  verdictLabel: string;
  embodiedCarbonSavedKg: number;
  recoverableTotalG: number;
}

export const BATTERY_DEVICE_PRESETS: BatteryDevicePreset[] = [
  {
    id: 'smartphone',
    label: 'Smartphone',
    defaultName: 'Smartphone (Li-Ion)',
    defaultChemistry: 'li_po_lco',
    defaultCapacityWh: 15.5,
    baseRatedCyclesTo80: 650,
    typicalDailyCycles: 0.95,
    typicalWeightKg: 0.2,
    embodiedCarbonKg: 70,
    pickupCategory: 'IT & Telecom',
    batteryReplaceable: true,
    repurposeRoles: [
      'Dedicated smart-home wall controller or security camera',
      'Offline navigation unit, dashcam, or dedicated music player',
      'Student learning / e-reader device via Circular Marketplace donation',
    ],
  },
  {
    id: 'laptop',
    label: 'Laptop',
    defaultName: 'Laptop / Ultrabook',
    defaultChemistry: 'li_nmc',
    defaultCapacityWh: 60,
    baseRatedCyclesTo80: 900,
    typicalDailyCycles: 0.55,
    typicalWeightKg: 1.6,
    embodiedCarbonKg: 260,
    pickupCategory: 'IT & Telecom',
    batteryReplaceable: true,
    repurposeRoles: [
      'Docked desktop workstation running on AC power with 80% charge limiter',
      'Home lab Linux server, NAS node, or classroom coding station',
      'Donate or trade on Circular Marketplace for community education',
    ],
  },
  {
    id: 'tablet',
    label: 'Tablet',
    defaultName: 'Tablet Device',
    defaultChemistry: 'li_po_lco',
    defaultCapacityWh: 30,
    baseRatedCyclesTo80: 850,
    typicalDailyCycles: 0.45,
    typicalWeightKg: 0.5,
    embodiedCarbonKg: 120,
    pickupCategory: 'Consumer Electronics',
    batteryReplaceable: true,
    repurposeRoles: [
      'Mounted kitchen recipe screen or calendar display',
      'Secondary wireless monitor for a desktop workstation',
      'Dedicated digital textbook reader for students',
    ],
  },
  {
    id: 'earbuds',
    label: 'Earbuds / Watch',
    defaultName: 'Wireless Earbuds / Smartwatch',
    defaultChemistry: 'li_po_lco',
    defaultCapacityWh: 1.8,
    baseRatedCyclesTo80: 450,
    typicalDailyCycles: 0.85,
    typicalWeightKg: 0.08,
    embodiedCarbonKg: 18,
    pickupCategory: 'Consumer Electronics',
    batteryReplaceable: false,
    repurposeRoles: [
      'Short-session desk call headset or podcast backup pair',
      'Spare charging case donor on Circular Marketplace',
    ],
  },
  {
    id: 'powerbank',
    label: 'Power Bank',
    defaultName: 'Portable Power Bank',
    defaultChemistry: 'li_nmc',
    defaultCapacityWh: 74,
    baseRatedCyclesTo80: 600,
    typicalDailyCycles: 0.35,
    typicalWeightKg: 0.45,
    embodiedCarbonKg: 32,
    pickupCategory: 'Batteries & Power',
    batteryReplaceable: false,
    repurposeRoles: [
      'Low-draw backup power for Wi-Fi routers, LED desk lamps, or sensors',
      'Emergency trickle charger for flashlights and small accessories',
    ],
  },
  {
    id: 'ebike',
    label: 'E-Bike Pack',
    defaultName: 'E-Bike / Mobility Battery Pack',
    defaultChemistry: 'li_nmc',
    defaultCapacityWh: 480,
    baseRatedCyclesTo80: 900,
    typicalDailyCycles: 0.4,
    typicalWeightKg: 3.4,
    embodiedCarbonKg: 145,
    pickupCategory: 'Batteries & Power',
    batteryReplaceable: true,
    repurposeRoles: [
      'Stationary solar micro-storage bank for garden lighting or shed power',
      'Short-range commuter pack or certified cell re-packing service',
    ],
  },
  {
    id: 'ups',
    label: 'UPS / Backup',
    defaultName: 'Home / Office UPS Pack',
    defaultChemistry: 'lifepo4',
    defaultCapacityWh: 180,
    baseRatedCyclesTo80: 1100,
    typicalDailyCycles: 0.25,
    typicalWeightKg: 4.0,
    embodiedCarbonKg: 85,
    pickupCategory: 'Batteries & Power',
    batteryReplaceable: true,
    repurposeRoles: [
      'Low-load modem and fiber router outage backup unit',
      'Portable DC camping or field-sensor energy buffer',
    ],
  },
];

export const BATTERY_CHEMISTRIES: Record<BatteryChemistryId, BatteryChemistrySpec> = {
  li_po_lco: {
    id: 'li_po_lco',
    label: 'Lithium Polymer / LCO',
    shortLabel: 'Li-Po / LCO',
    cycleLifeMultiplier: 1.0,
    annualCalendarFadePct: 2.8,
    nominalVoltageV: 3.85,
    thermalStability: 'Moderate (sensitive above 35°C)',
    mineralsPer100Wh: {
      lithiumG: 7.4,
      cobaltG: 28.5,
      nickelG: 4.0,
      copperG: 16.5,
      graphiteG: 54.0,
    },
  },
  li_nmc: {
    id: 'li_nmc',
    label: 'Lithium-Ion NMC',
    shortLabel: 'Li-Ion NMC',
    cycleLifeMultiplier: 1.2,
    annualCalendarFadePct: 2.3,
    nominalVoltageV: 3.7,
    thermalStability: 'Balanced (optimal 15–30°C)',
    mineralsPer100Wh: {
      lithiumG: 8.2,
      cobaltG: 11.8,
      nickelG: 26.5,
      copperG: 18.0,
      graphiteG: 58.0,
    },
  },
  lifepo4: {
    id: 'lifepo4',
    label: 'Lithium Iron Phosphate (LFP)',
    shortLabel: 'LiFePO4 (LFP)',
    cycleLifeMultiplier: 2.4,
    annualCalendarFadePct: 1.4,
    nominalVoltageV: 3.2,
    thermalStability: 'High (robust up to 45°C)',
    mineralsPer100Wh: {
      lithiumG: 9.0,
      cobaltG: 0,
      nickelG: 0,
      copperG: 20.5,
      graphiteG: 62.0,
    },
  },
  nimh: {
    id: 'nimh',
    label: 'Nickel-Metal Hydride (NiMH)',
    shortLabel: 'NiMH',
    cycleLifeMultiplier: 0.85,
    annualCalendarFadePct: 3.1,
    nominalVoltageV: 1.2,
    thermalStability: 'High (tolerant of deep discharge)',
    mineralsPer100Wh: {
      lithiumG: 0,
      cobaltG: 2.5,
      nickelG: 48.0,
      copperG: 9.5,
      graphiteG: 0,
    },
  },
};

export const CHARGE_HABIT_CONFIG: Record<
  ChargeHabitId,
  { label: string; shortLabel: string; cycleStress: number; calendarStress: number; hint: string }
> = {
  optimized_20_80: {
    label: 'Optimized (20–80%)',
    shortLabel: '20–80% Care',
    cycleStress: 0.72,
    calendarStress: 0.82,
    hint: 'Avoids high-voltage cathode stress and deep anode strain.',
  },
  standard_0_100: {
    label: 'Standard (0–100%)',
    shortLabel: 'Standard',
    cycleStress: 1.0,
    calendarStress: 1.0,
    hint: 'Typical full daily charge and regular discharge.',
  },
  overnight_100: {
    label: 'Always Plugged / Overnight 100%',
    shortLabel: 'Overnight 100%',
    cycleStress: 1.15,
    calendarStress: 1.32,
    hint: 'Extended float time at 4.2V accelerates electrolyte oxidation.',
  },
  fast_deep: {
    label: 'Frequent Fast-Charge & Deep Drain',
    shortLabel: 'Fast + Deep',
    cycleStress: 1.38,
    calendarStress: 1.22,
    hint: 'High C-rate charging and <5% drains increase lithium plating.',
  },
};

export const THERMAL_PROFILE_CONFIG: Record<
  ThermalProfileId,
  { label: string; shortLabel: string; tempRange: string; stressFactor: number }
> = {
  cool: {
    label: 'Cool Indoor',
    shortLabel: 'Cool',
    tempRange: '< 22°C',
    stressFactor: 0.85,
  },
  moderate: {
    label: 'Moderate Ambient',
    shortLabel: 'Moderate',
    tempRange: '22–30°C',
    stressFactor: 1.0,
  },
  warm: {
    label: 'Warm Climate / Heavy Use',
    shortLabel: 'Warm',
    tempRange: '30–38°C',
    stressFactor: 1.34,
  },
  hot: {
    label: 'Hot / Intensive Load',
    shortLabel: 'Hot',
    tempRange: '> 38°C',
    stressFactor: 1.72,
  },
};

export function getPresetById(id: BatteryDevicePresetId): BatteryDevicePreset {
  return BATTERY_DEVICE_PRESETS.find((p) => p.id === id) || BATTERY_DEVICE_PRESETS[0];
}

export function createDefaultBatteryInput(
  presetId: BatteryDevicePresetId = 'laptop'
): BatteryHealthInput {
  const preset = getPresetById(presetId);
  return {
    devicePreset: preset.id,
    deviceName: preset.defaultName,
    chemistry: preset.defaultChemistry,
    capacityWh: preset.defaultCapacityWh,
    ageYears: 2.5,
    cycleInputMode: 'daily',
    dailyCycles: preset.typicalDailyCycles,
    exactCycles: Math.round(2.5 * 365 * preset.typicalDailyCycles),
    useKnownSoh: false,
    knownSohPct: 82,
    chargeHabit: 'standard_0_100',
    thermalProfile: 'moderate',
    isSwollen: false,
    hasUnexpectedShutdowns: false,
    overheatsWhileCharging: false,
    chassisIntact: true,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function calculateBatteryHealth(input: BatteryHealthInput): BatteryHealthReport {
  const preset = getPresetById(input.devicePreset);
  const chem = BATTERY_CHEMISTRIES[input.chemistry];
  const habit = CHARGE_HABIT_CONFIG[input.chargeHabit];
  const thermal = THERMAL_PROFILE_CONFIG[input.thermalProfile];

  const ageYears = clamp(Number(input.ageYears) || 0, 0, 12);
  const capacityWh = clamp(Number(input.capacityWh) || preset.defaultCapacityWh, 0.5, 5000);
  const dailyCycles = clamp(Number(input.dailyCycles) || preset.typicalDailyCycles, 0.05, 4);

  const effectiveCycles =
    input.cycleInputMode === 'exact'
      ? Math.max(0, Math.round(Number(input.exactCycles) || 0))
      : Math.round(ageYears * 365 * dailyCycles);

  const effectiveDailyCycles =
    input.cycleInputMode === 'exact' && ageYears > 0.15
      ? clamp(effectiveCycles / (ageYears * 365), 0.1, 3.5)
      : dailyCycles;

  const ratedCyclesTo80 = Math.round(preset.baseRatedCyclesTo80 * chem.cycleLifeMultiplier);

  // Cyclic fade: reaches ~20% loss at ratedCyclesTo80 under baseline (1.0) stress
  const cyclicFadePct =
    (effectiveCycles / Math.max(100, ratedCyclesTo80)) *
    20 *
    habit.cycleStress *
    (0.7 + 0.3 * thermal.stressFactor);

  // Calendar fade: Arrhenius-weighted SEI layer growth
  const calendarFadePct =
    ageYears * chem.annualCalendarFadePct * habit.calendarStress * thermal.stressFactor;

  // Symptom penalties reflect elevated internal impedance / cell imbalance
  const symptomPenaltyPct =
    (input.isSwollen ? 24 : 0) +
    (input.hasUnexpectedShutdowns ? 11 : 0) +
    (input.overheatsWhileCharging ? 7 : 0);

  const modeledSohPct = clamp(100 - (cyclicFadePct + calendarFadePct + symptomPenaltyPct), 22, 100);

  const estimatedSohPct = round1(
    input.useKnownSoh
      ? clamp(
          (Number(input.knownSohPct) || modeledSohPct) - (input.isSwollen ? 15 : 0),
          20,
          100
        )
      : modeledSohPct
  );

  // Forward annual fade rates (% SoH lost per year going forward)
  const annualCyclicFade =
    ((effectiveDailyCycles * 365) / Math.max(100, ratedCyclesTo80)) *
    20 *
    habit.cycleStress *
    (0.7 + 0.3 * thermal.stressFactor);
  const annualCalendarFade =
    chem.annualCalendarFadePct * habit.calendarStress * thermal.stressFactor;
  const annualFadeRatePct = round1(Math.max(1.2, annualCyclicFade + annualCalendarFade));

  // Optimized care profile (20-80% charge window + moderate/cool thermal management)
  const optHabit = CHARGE_HABIT_CONFIG.optimized_20_80;
  const optThermalStress = Math.min(thermal.stressFactor, THERMAL_PROFILE_CONFIG.moderate.stressFactor);
  const optimizedAnnualFadeRatePct = round1(
    Math.max(
      0.9,
      ((effectiveDailyCycles * 365) / Math.max(100, ratedCyclesTo80)) *
        20 *
        optHabit.cycleStress *
        (0.7 + 0.3 * optThermalStress) +
        chem.annualCalendarFadePct * optHabit.calendarStress * optThermalStress
    )
  );

  const safetyOverride = input.isSwollen;

  const remainingMonthsTo80 = safetyOverride
    ? 0
    : estimatedSohPct <= 80
      ? 0
      : Math.min(120, Math.round(((estimatedSohPct - 80) / annualFadeRatePct) * 12));

  const remainingMonthsTo65 = safetyOverride
    ? 0
    : estimatedSohPct <= 65
      ? 0
      : Math.min(144, Math.round(((estimatedSohPct - 65) / annualFadeRatePct) * 12));

  const optimizedMonthsTo65 = safetyOverride
    ? 0
    : estimatedSohPct <= 65
      ? 0
      : Math.min(168, Math.round(((estimatedSohPct - 65) / optimizedAnnualFadeRatePct) * 12));

  const extraMonthsWithOptimization = Math.max(0, optimizedMonthsTo65 - remainingMonthsTo65);

  const remainingCyclesTo80 = Math.round((remainingMonthsTo80 / 12) * effectiveDailyCycles * 365);
  const remainingCyclesTo65 = Math.round((remainingMonthsTo65 / 12) * effectiveDailyCycles * 365);

  // Real-world daily runtime lags raw SoH slightly due to rising internal resistance
  const impedancePenalty = input.hasUnexpectedShutdowns ? 10 : estimatedSohPct < 75 ? 5 : 2;
  const effectiveRuntimePct = Math.round(clamp(estimatedSohPct - impedancePenalty, 15, 100));

  const cycleUtilizationPct = Math.min(200, Math.round((effectiveCycles / ratedCyclesTo80) * 100));

  // Build 8-year forward projection curve (half-year steps -> 0 to 6 years for crisp readability)
  const projectionCurve: DegradationPoint[] = [];
  for (let step = 0; step <= 12; step++) {
    const yearOffset = step * 0.5;
    // Slight knee acceleration below 70% SoH (realistic SEI/lithium-plating inflection)
    const rawCurrent = estimatedSohPct - annualFadeRatePct * yearOffset;
    const kneeCurrent = rawCurrent < 70 ? rawCurrent - (70 - rawCurrent) * 0.16 : rawCurrent;
    const rawOpt = estimatedSohPct - optimizedAnnualFadeRatePct * yearOffset;
    const kneeOpt = rawOpt < 70 ? rawOpt - (70 - rawOpt) * 0.12 : rawOpt;

    projectionCurve.push({
      yearOffset,
      totalAgeYears: round1(ageYears + yearOffset),
      currentSohPct: round1(clamp(safetyOverride && yearOffset > 0 ? 20 : kneeCurrent, 20, 100)),
      optimizedSohPct: round1(clamp(safetyOverride && yearOffset > 0 ? 20 : kneeOpt, 20, 100)),
      projectedCycles: Math.round(effectiveCycles + yearOffset * 365 * effectiveDailyCycles),
    });
  }

  // Recoverable critical minerals from cell capacity
  const whScale = capacityWh / 100;
  const lithiumG = round1(chem.mineralsPer100Wh.lithiumG * whScale);
  const cobaltG = round1(chem.mineralsPer100Wh.cobaltG * whScale);
  const nickelG = round1(chem.mineralsPer100Wh.nickelG * whScale);
  const copperG = round1(chem.mineralsPer100Wh.copperG * whScale);
  const graphiteG = round1(chem.mineralsPer100Wh.graphiteG * whScale);

  // Indicative secondary material recovery value in INR
  const estimatedRecoveryInr = Math.max(
    15,
    Math.round(
      lithiumG * 2.1 + cobaltG * 3.4 + nickelG * 1.6 + copperG * 0.85 + graphiteG * 0.15
    )
  );

  // Embodied CO2e avoided by keeping or repurposing instead of premature replacement
  const extensionFraction = clamp(remainingMonthsTo65 / 36, 0.25, 0.75);
  const embodiedCarbonSavedKg = round1(
    safetyOverride ? preset.embodiedCarbonKg * 0.18 : preset.embodiedCarbonKg * extensionFraction
  );

  // Decision Matrix: Recycle vs Repurpose vs Replace Battery vs Keep & Optimize
  let verdict: BatteryVerdictId;
  let verdictLabel: string;
  let verdictHeadline: string;
  let verdictExplanation: string;
  let safetyWarning: string | null = null;
  let suggestedPickupCondition: BatteryHealthReport['suggestedPickupCondition'] =
    'Partially Working';

  if (input.isSwollen) {
    verdict = 'recycle_now';
    verdictLabel = 'Immediate Certified Recycling';
    verdictHeadline = 'Stop using and recycle via certified battery pickup';
    verdictExplanation =
      'Physical swelling indicates electrolyte decomposition and internal gas buildup. Do not repurpose, trade, or continue charging this device—route it immediately to a certified e-waste handler.';
    safetyWarning =
      'Swollen lithium cell detected: Stop charging immediately, move away from flammable surfaces, and never compress or puncture the casing.';
    suggestedPickupCondition = 'Damaged / Swollen Battery';
  } else if (
    estimatedSohPct < 58 ||
    (input.overheatsWhileCharging && estimatedSohPct < 72) ||
    (!input.chassisIntact && estimatedSohPct < 72)
  ) {
    verdict = 'recycle_now';
    verdictLabel = 'Recycle Responsibly';
    verdictHeadline = 'Battery has reached end of serviceable life — recycle now';
    verdictExplanation = input.overheatsWhileCharging
      ? 'Thermal instability during charging combined with elevated cell fade makes continued operation unsafe. Certified material recovery reclaims critical metals cleanly.'
      : `At ${estimatedSohPct}% State of Health (${effectiveCycles.toLocaleString()} cycles), internal resistance is high enough to cause voltage drops and poor efficiency. Certified recycling recovers valuable lithium, cobalt, nickel, and copper.`;
    if (input.overheatsWhileCharging) {
      safetyWarning =
        'Charging heat anomaly flagged: Unplug the device and store in a cool, dry place until certified collection.';
    }
    suggestedPickupCondition = input.overheatsWhileCharging
      ? 'Damaged / Swollen Battery'
      : 'Non-working';
  } else if (
    estimatedSohPct < 70 &&
    preset.batteryReplaceable &&
    input.chassisIntact &&
    preset.embodiedCarbonKg >= 65
  ) {
    verdict = 'replace_battery';
    verdictLabel = 'Replace Battery & Extend';
    verdictHeadline = 'Replace only the battery pack to save embodied carbon';
    verdictExplanation = `Your ${preset.label.toLowerCase()} chassis is intact and carries ~${preset.embodiedCarbonKg} kg CO₂e of manufacturing emissions. Swapping the worn pack (~${estimatedSohPct}% SoH) and recycling the old cell extends useful life by 2–3 years at a fraction of the carbon footprint.`;
    suggestedPickupCondition = 'Partially Working';
  } else if (estimatedSohPct < 82 || input.hasUnexpectedShutdowns) {
    verdict = 'repurpose';
    verdictLabel = 'Repurpose / Second-Life';
    verdictHeadline = 'Ideal candidate for low-power second-life reuse';
    verdictExplanation = `With ${estimatedSohPct}% estimated capacity (~${remainingMonthsTo65} months until 65% EOL), this device still holds substantial utility for stationary or low-draw workloads, or can be donated/traded on the Circular Marketplace.`;
    suggestedPickupCondition = 'Working / Refurbishable';
  } else {
    verdict = 'keep_optimize';
    verdictLabel = 'Keep & Optimize';
    verdictHeadline = 'Healthy cell — keep in primary service and optimize charging';
    verdictExplanation = `At ${estimatedSohPct}% State of Health with an estimated ${remainingMonthsTo65} months of serviceable life remaining, retiring this device now would waste roughly ${embodiedCarbonSavedKg} kg CO₂e of embodied carbon.`;
    suggestedPickupCondition = 'Working / Refurbishable';
  }

  const actionRecommendations: string[] = [];
  if (verdict === 'keep_optimize') {
    if (extraMonthsWithOptimization >= 2) {
      actionRecommendations.push(
        `Enable an 80% charge cap to gain ~${extraMonthsWithOptimization} additional months of serviceable battery life.`
      );
    } else {
      actionRecommendations.push(
        'Maintain your current 20–80% charging habits and avoid leaving the device in hot vehicles or direct sunlight.'
      );
    }
    actionRecommendations.push(
      `Re-assess battery health in 6–12 months once cycle count approaches ${Math.round(ratedCyclesTo80 * 0.75).toLocaleString()} cycles.`
    );
    actionRecommendations.push(
      'Avoid fast-charging overnight when standard slow charging is sufficient.'
    );
  } else if (verdict === 'repurpose') {
    actionRecommendations.push(
      'Enable battery charge limiting (60–80%) if running the device plugged in continuously for stationary tasks.'
    );
    actionRecommendations.push(
      'Factory-reset and list functional accessories or the full unit on the Circular Marketplace if you have upgraded.'
    );
    actionRecommendations.push(
      `Plan certified battery recycling once capacity drops below 65% (projected in ~${Math.max(1, remainingMonthsTo65)} months).`
    );
  } else if (verdict === 'replace_battery') {
    actionRecommendations.push(
      'Book an OEM or certified repair-shop battery swap instead of discarding the entire electronic unit.'
    );
    actionRecommendations.push(
      'Schedule a Reboot Earth certified pickup strictly for the removed spent battery pack so its minerals are recovered.'
    );
    actionRecommendations.push(
      'Alternatively, list the intact device on Circular Marketplace as a refurbishable unit for community repairers.'
    );
  } else {
    actionRecommendations.push(
      'Back up important data (only if the device is cool and safe to power on briefly) and wipe personal accounts.'
    );
    actionRecommendations.push(
      'Schedule a certified Reboot Earth doorstep pickup so the battery enters hydrometallurgical metal recovery.'
    );
    actionRecommendations.push(
      'Never dispose of lithium or NiMH batteries in household municipal bins due to thermal runaway fire hazards.'
    );
  }

  const safetyHandlingChecklist = [
    'Keep the device away from heat sources, moisture, and direct sunlight.',
    input.isSwollen
      ? 'Do NOT attempt to charge, discharge, or press down on the swollen enclosure.'
      : 'If safe, discharge the battery below 30% before transit to minimize stored energy.',
    'Cover exposed battery terminals (for removable packs) with non-conductive electrical tape.',
    'Store in a cool, ventilated container until handover to a certified e-waste transporter.',
  ];

  return {
    estimatedSohPct,
    effectiveCycles,
    ratedCyclesTo80,
    cycleUtilizationPct,
    remainingMonthsTo80,
    remainingMonthsTo65,
    extraMonthsWithOptimization,
    remainingCyclesTo80,
    remainingCyclesTo65,
    effectiveRuntimePct,
    annualFadeRatePct,
    optimizedAnnualFadeRatePct,
    verdict,
    verdictLabel,
    verdictHeadline,
    verdictExplanation,
    safetyOverride,
    safetyWarning,
    actionRecommendations,
    repurposeIdeas: preset.repurposeRoles,
    safetyHandlingChecklist,
    embodiedCarbonSavedKg,
    recoverableMinerals: {
      lithiumG,
      cobaltG,
      nickelG,
      copperG,
      graphiteG,
      estimatedRecoveryInr,
    },
    suggestedPickupCondition,
    projectionCurve,
  };
}
