import type { PickupRequest } from '../types';
import {
  COLLECTED_HISTORY_STATUSES,
  getEmissionFactorForCategory,
} from '../components/CarbonSavedWidget';
import type { EcoExperienceSummary } from './ecoLevelSystem';

export interface CategoryEnvironmentalFactors {
  energyKwhPerKg: number;
  waterLitersPerKg: number;
  copperPct: number;
  aluminumSteelPct: number;
  preciousMetalsGramsPerKg: number;
  accentHex: string;
}

/**
 * Category-weighted lifecycle energy (kWh/kg), water (L/kg), and urban-mining
 * secondary metal recovery factors aligned with UNEP Global E-Waste Monitor
 * and US EPA WARM recycling vs. primary extraction benchmarks.
 */
const CATEGORY_RESOURCE_FACTORS: Record<string, CategoryEnvironmentalFactors> = {
  'PCB & Components': {
    energyKwhPerKg: 18.4,
    waterLitersPerKg: 420,
    copperPct: 0.22,
    aluminumSteelPct: 0.14,
    preciousMetalsGramsPerKg: 1.45,
    accentHex: '#10B981',
  },
  'IT & Telecom': {
    energyKwhPerKg: 14.2,
    waterLitersPerKg: 310,
    copperPct: 0.11,
    aluminumSteelPct: 0.36,
    preciousMetalsGramsPerKg: 0.42,
    accentHex: '#0EA5E9',
  },
  'Batteries & Power': {
    energyKwhPerKg: 11.6,
    waterLitersPerKg: 265,
    copperPct: 0.08,
    aluminumSteelPct: 0.28,
    preciousMetalsGramsPerKg: 0.12,
    accentHex: '#06B6D4',
  },
  'Medical & Lab': {
    energyKwhPerKg: 11.0,
    waterLitersPerKg: 240,
    copperPct: 0.12,
    aluminumSteelPct: 0.42,
    preciousMetalsGramsPerKg: 0.35,
    accentHex: '#14B8A6',
  },
  'Consumer Electronics': {
    energyKwhPerKg: 9.8,
    waterLitersPerKg: 210,
    copperPct: 0.09,
    aluminumSteelPct: 0.31,
    preciousMetalsGramsPerKg: 0.24,
    accentHex: '#6366F1',
  },
  'Solar & Energy': {
    energyKwhPerKg: 10.5,
    waterLitersPerKg: 195,
    copperPct: 0.06,
    aluminumSteelPct: 0.45,
    preciousMetalsGramsPerKg: 0.28,
    accentHex: '#F59E0B',
  },
  'Large Appliances': {
    energyKwhPerKg: 7.4,
    waterLitersPerKg: 140,
    copperPct: 0.05,
    aluminumSteelPct: 0.62,
    preciousMetalsGramsPerKg: 0.04,
    accentHex: '#3B82F6',
  },
  'Small Appliances': {
    energyKwhPerKg: 6.2,
    waterLitersPerKg: 115,
    copperPct: 0.07,
    aluminumSteelPct: 0.44,
    preciousMetalsGramsPerKg: 0.05,
    accentHex: '#64748B',
  },
};

const DEFAULT_RESOURCE_FACTORS: CategoryEnvironmentalFactors = {
  energyKwhPerKg: 8.5,
  waterLitersPerKg: 175,
  copperPct: 0.08,
  aluminumSteelPct: 0.35,
  preciousMetalsGramsPerKg: 0.18,
  accentHex: '#38BDF8',
};

export function getResourceFactorsForCategory(category: string): CategoryEnvironmentalFactors {
  const exact = CATEGORY_RESOURCE_FACTORS[category];
  if (exact) return exact;
  const normalized = (category || '').toLowerCase();
  if (normalized.includes('pcb') || normalized.includes('circuit')) {
    return CATEGORY_RESOURCE_FACTORS['PCB & Components'];
  }
  if (normalized.includes('it') || normalized.includes('telecom') || normalized.includes('laptop')) {
    return CATEGORY_RESOURCE_FACTORS['IT & Telecom'];
  }
  if (normalized.includes('batter') || normalized.includes('power')) {
    return CATEGORY_RESOURCE_FACTORS['Batteries & Power'];
  }
  if (normalized.includes('medical') || normalized.includes('lab')) {
    return CATEGORY_RESOURCE_FACTORS['Medical & Lab'];
  }
  if (normalized.includes('solar') || normalized.includes('energy')) {
    return CATEGORY_RESOURCE_FACTORS['Solar & Energy'];
  }
  if (normalized.includes('large')) {
    return CATEGORY_RESOURCE_FACTORS['Large Appliances'];
  }
  if (normalized.includes('small')) {
    return CATEGORY_RESOURCE_FACTORS['Small Appliances'];
  }
  if (normalized.includes('consumer')) {
    return CATEGORY_RESOURCE_FACTORS['Consumer Electronics'];
  }
  return DEFAULT_RESOURCE_FACTORS;
}

export interface LifetimeCategoryBreakdown {
  category: string;
  weightKg: number;
  units: number;
  pickupsCount: number;
  sharePct: number;
  co2Kg: number;
  energyKwh: number;
  waterLiters: number;
  accentHex: string;
}

export interface LifetimeTimelinePoint {
  key: string;
  label: string;
  periodWeightKg: number;
  cumulativeWeightKg: number;
  cumulativeCo2Kg: number;
  pickupsCount: number;
}

export interface LifetimeImpactSummary {
  scope: 'all' | 'verified';
  totalPickups: number;
  completedPickups: number;
  verifiedPickups: number;
  totalUnits: number;
  totalWeightKg: number;
  carbonSavedKg: number;
  energySavedKwh: number;
  waterSavedLiters: number;
  // Real-world equivalents
  treesEquivalent: number;
  carKmAvoided: number;
  householdDaysPowered: number;
  smartphoneCharges: number;
  showersEquivalent: number;
  drinkingWaterDays: number;
  // Secondary materials recovered
  copperRecoveredKg: number;
  aluminumSteelRecoveredKg: number;
  preciousMetalsGrams: number;
  hazardousItemsDiverted: number;
  // Span & breakdowns
  firstDateLabel: string | null;
  latestDateLabel: string | null;
  completionRatePct: number;
  categories: LifetimeCategoryBreakdown[];
  timeline: LifetimeTimelinePoint[];
}

function parsePickupDate(p: PickupRequest): Date | null {
  const raw = p.preferredDate || p.createdAt;
  if (!raw) return null;
  const ts = Date.parse(raw);
  if (Number.isNaN(ts)) return null;
  return new Date(ts);
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMonthLabel(year: number, monthIndex: number): string {
  return new Date(year, monthIndex, 1).toLocaleDateString(undefined, {
    month: 'short',
    year: '2-digit',
  });
}

export function computeLifetimeImpact(
  pickups: PickupRequest[],
  scope: 'all' | 'verified' = 'all'
): LifetimeImpactSummary {
  const eligible = pickups.filter((p) => {
    if (p.status === 'Cancelled') return false;
    if (scope === 'verified') {
      return COLLECTED_HISTORY_STATUSES.has(p.status);
    }
    return true;
  });

  let totalWeightKg = 0;
  let totalUnits = 0;
  let carbonSavedKg = 0;
  let energySavedKwh = 0;
  let waterSavedLiters = 0;
  let copperRecoveredKg = 0;
  let aluminumSteelRecoveredKg = 0;
  let preciousMetalsGrams = 0;
  let hazardousItemsDiverted = 0;
  let completedPickups = 0;
  let verifiedPickups = 0;

  let earliestDate: Date | null = null;
  let latestDate: Date | null = null;

  const categoryMap = new Map<string, LifetimeCategoryBreakdown>();
  const monthMap = new Map<
    string,
    { year: number; month: number; weightKg: number; co2Kg: number; count: number }
  >();

  for (const p of eligible) {
    const weight = Math.max(0, Number(p.estimatedWeightKg) || 0);
    const units = Math.max(0, Number(p.quantity) || 0);
    const emission = getEmissionFactorForCategory(p.category);
    const resource = getResourceFactorsForCategory(p.category);

    const co2 = weight * emission.factorKgCo2PerKg;
    const kwh = weight * resource.energyKwhPerKg;
    const water = weight * resource.waterLitersPerKg;

    totalWeightKg += weight;
    totalUnits += units;
    carbonSavedKg += co2;
    energySavedKwh += kwh;
    waterSavedLiters += water;

    copperRecoveredKg += weight * resource.copperPct;
    aluminumSteelRecoveredKg += weight * resource.aluminumSteelPct;
    preciousMetalsGrams += weight * resource.preciousMetalsGramsPerKg;

    if (
      p.category === 'Batteries & Power' ||
      /swollen|damaged|battery|hazard/i.test(`${p.condition} ${p.deviceName}`)
    ) {
      hazardousItemsDiverted += Math.max(1, units);
    }

    if (p.status === 'Completed') completedPickups += 1;
    if (COLLECTED_HISTORY_STATUSES.has(p.status)) verifiedPickups += 1;

    const catKey = emission.category;
    const existing = categoryMap.get(catKey);
    if (existing) {
      existing.weightKg += weight;
      existing.units += units;
      existing.pickupsCount += 1;
      existing.co2Kg += co2;
      existing.energyKwh += kwh;
      existing.waterLiters += water;
    } else {
      categoryMap.set(catKey, {
        category: catKey,
        weightKg: weight,
        units,
        pickupsCount: 1,
        sharePct: 0,
        co2Kg: co2,
        energyKwh: kwh,
        waterLiters: water,
        accentHex: resource.accentHex,
      });
    }

    const dt = parsePickupDate(p);
    if (dt) {
      if (!earliestDate || dt < earliestDate) earliestDate = dt;
      if (!latestDate || dt > latestDate) latestDate = dt;

      const y = dt.getFullYear();
      const m = dt.getMonth();
      const monthKey = `${y}-${String(m + 1).padStart(2, '0')}`;
      const mBucket = monthMap.get(monthKey);
      if (mBucket) {
        mBucket.weightKg += weight;
        mBucket.co2Kg += co2;
        mBucket.count += 1;
      } else {
        monthMap.set(monthKey, { year: y, month: m, weightKg: weight, co2Kg: co2, count: 1 });
      }
    }
  }

  const categories = Array.from(categoryMap.values())
    .map((c) => ({
      ...c,
      weightKg: Math.round(c.weightKg * 10) / 10,
      co2Kg: Math.round(c.co2Kg * 10) / 10,
      energyKwh: Math.round(c.energyKwh),
      waterLiters: Math.round(c.waterLiters),
      sharePct: totalWeightKg > 0 ? Math.round((c.weightKg / totalWeightKg) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.weightKg - a.weightKg);

  const sortedMonths = Array.from(monthMap.entries()).sort(([a], [b]) => a.localeCompare(b));
  let runningWeight = 0;
  let runningCo2 = 0;
  const timeline: LifetimeTimelinePoint[] = sortedMonths.map(([key, bucket]) => {
    runningWeight += bucket.weightKg;
    runningCo2 += bucket.co2Kg;
    return {
      key,
      label: formatMonthLabel(bucket.year, bucket.month),
      periodWeightKg: Math.round(bucket.weightKg * 10) / 10,
      cumulativeWeightKg: Math.round(runningWeight * 10) / 10,
      cumulativeCo2Kg: Math.round(runningCo2 * 10) / 10,
      pickupsCount: bucket.count,
    };
  });

  const roundedWeight = Math.round(totalWeightKg * 10) / 10;
  const roundedCo2 = Math.round(carbonSavedKg * 10) / 10;
  const roundedEnergy = Math.round(energySavedKwh);
  const roundedWater = Math.round(waterSavedLiters);

  return {
    scope,
    totalPickups: eligible.length,
    completedPickups,
    verifiedPickups,
    totalUnits,
    totalWeightKg: roundedWeight,
    carbonSavedKg: roundedCo2,
    energySavedKwh: roundedEnergy,
    waterSavedLiters: roundedWater,
    treesEquivalent: Math.round((roundedCo2 / 21) * 10) / 10,
    carKmAvoided: Math.round(roundedCo2 / 0.192),
    householdDaysPowered: Math.round((roundedEnergy / 12) * 10) / 10,
    smartphoneCharges: Math.round(roundedEnergy / 0.015),
    showersEquivalent: Math.round((roundedWater / 65) * 10) / 10,
    drinkingWaterDays: Math.round(roundedWater / 3),
    copperRecoveredKg: Math.round(copperRecoveredKg * 100) / 100,
    aluminumSteelRecoveredKg: Math.round(aluminumSteelRecoveredKg * 10) / 10,
    preciousMetalsGrams: Math.round(preciousMetalsGrams * 10) / 10,
    hazardousItemsDiverted,
    firstDateLabel: earliestDate ? formatShortDate(earliestDate) : null,
    latestDateLabel: latestDate ? formatShortDate(latestDate) : null,
    completionRatePct:
      eligible.length > 0 ? Math.round((verifiedPickups / eligible.length) * 100) : 0,
    categories,
    timeline,
  };
}

export type InfographicTheme = 'ocean' | 'editorial';
export type InfographicAspect = 'poster' | 'slide';

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * Generates a high-resolution shareable PNG infographic on an offscreen canvas.
 */
export function renderLifetimeImpactPng(params: {
  impact: LifetimeImpactSummary;
  ecoExperience: EcoExperienceSummary;
  userName: string;
  userCity: string;
  theme: InfographicTheme;
  aspect: InfographicAspect;
}): string {
  const { impact, ecoExperience, userName, userCity, theme, aspect } = params;
  const isPoster = aspect === 'poster';
  const width = isPoster ? 1200 : 1600;
  const height = isPoster ? 1500 : 960;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to initialize canvas for infographic export.');

  const isOcean = theme === 'ocean';
  const bg = isOcean ? '#061526' : '#F8FAFC';
  const cardBg = isOcean ? '#0B223B' : '#FFFFFF';
  const subtleBg = isOcean ? '#081B30' : '#F1F5F9';
  const border = isOcean ? '#163B63' : '#CBD5E1';
  const textPrimary = isOcean ? '#F0F9FF' : '#0F172A';
  const textSecondary = isOcean ? '#94B8D8' : '#475569';
  const textMuted = isOcean ? '#6489AD' : '#64748B';
  const accentCarbon = isOcean ? '#34D399' : '#059669';
  const accentEnergy = isOcean ? '#FBBF24' : '#D97706';
  const accentWater = isOcean ? '#38BDF8' : '#0284C7';

  // Background fill
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Subtle architectural grid hairline accent at top
  const grad = ctx.createLinearGradient(0, 0, width, 0);
  grad.addColorStop(0, '#0EA5E9');
  grad.addColorStop(0.5, '#10B981');
  grad.addColorStop(1, '#F59E0B');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, 10);

  const pad = isPoster ? 64 : 56;
  const contentW = width - pad * 2;

  // Masthead
  ctx.fillStyle = accentWater;
  ctx.font = '700 16px system-ui, -apple-system, sans-serif';
  ctx.fillText('REBOOT EARTH  ·  LIFETIME ENVIRONMENTAL IMPACT REPORT', pad, pad + 18);

  ctx.fillStyle = textPrimary;
  ctx.font = `800 ${isPoster ? 46 : 40}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(userName || 'Circular Steward', pad, pad + 72);

  const subtitleParts = [
    userCity || 'Global Network',
    `Level ${ecoExperience.currentTier.level} · ${ecoExperience.currentTier.title}`,
    impact.firstDateLabel && impact.latestDateLabel
      ? `${impact.firstDateLabel} – ${impact.latestDateLabel}`
      : 'Verified Recycling Dossier',
  ];
  ctx.fillStyle = textSecondary;
  ctx.font = '500 18px system-ui, -apple-system, sans-serif';
  ctx.fillText(subtitleParts.join('   •   '), pad, pad + 106);

  // Right-side Hero Total Mass readout in header
  const heroBoxW = 310;
  const heroBoxH = 98;
  const heroBoxX = width - pad - heroBoxW;
  const heroBoxY = pad + 12;
  drawRoundedRect(ctx, heroBoxX, heroBoxY, heroBoxW, heroBoxH, 16);
  ctx.fillStyle = cardBg;
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = textMuted;
  ctx.font = '700 13px system-ui, -apple-system, sans-serif';
  ctx.fillText('TOTAL E-WASTE DIVERTED', heroBoxX + 22, heroBoxY + 30);

  ctx.fillStyle = textPrimary;
  ctx.font = '800 38px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(`${impact.totalWeightKg.toLocaleString()} kg`, heroBoxX + 22, heroBoxY + 74);

  // Horizontal rule
  const ruleY = pad + 132;
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, ruleY);
  ctx.lineTo(width - pad, ruleY);
  ctx.stroke();

  // 3 Environmental Pillars: Carbon, Energy, Water
  const pillarGap = 24;
  const pillarW = (contentW - pillarGap * 2) / 3;
  const pillarH = isPoster ? 250 : 220;
  const pillarY = ruleY + 32;

  const pillars = [
    {
      label: 'CARBON AVOIDED',
      value: `${impact.carbonSavedKg.toLocaleString()}`,
      unit: 'kg CO₂e',
      accent: accentCarbon,
      eq1: `≈ ${impact.treesEquivalent.toLocaleString()} mature trees / yr`,
      eq2: `${impact.carKmAvoided.toLocaleString()} km car travel offset`,
    },
    {
      label: 'ENERGY CONSERVED',
      value: `${impact.energySavedKwh.toLocaleString()}`,
      unit: 'kWh',
      accent: accentEnergy,
      eq1: `≈ ${impact.householdDaysPowered.toLocaleString()} home days powered`,
      eq2: `${impact.smartphoneCharges.toLocaleString()} phone full charges`,
    },
    {
      label: 'WATER PRESERVED',
      value: `${impact.waterSavedLiters.toLocaleString()}`,
      unit: 'Liters',
      accent: accentWater,
      eq1: `≈ ${impact.showersEquivalent.toLocaleString()} eight-min showers`,
      eq2: `${impact.drinkingWaterDays.toLocaleString()} days drinking water`,
    },
  ];

  pillars.forEach((pillar, idx) => {
    const px = pad + idx * (pillarW + pillarGap);
    drawRoundedRect(ctx, px, pillarY, pillarW, pillarH, 18);
    ctx.fillStyle = cardBg;
    ctx.fill();
    ctx.strokeStyle = border;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Top accent rule inside card
    ctx.fillStyle = pillar.accent;
    ctx.fillRect(px + 24, pillarY + 22, 48, 4);

    ctx.fillStyle = pillar.accent;
    ctx.font = '700 14px system-ui, -apple-system, sans-serif';
    ctx.fillText(pillar.label, px + 24, pillarY + 52);

    ctx.fillStyle = textPrimary;
    ctx.font = `800 ${isPoster ? 48 : 44}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillText(pillar.value, px + 24, pillarY + 114);

    ctx.fillStyle = textSecondary;
    ctx.font = '700 18px system-ui, -apple-system, sans-serif';
    ctx.fillText(pillar.unit, px + 24, pillarY + 144);

    // Divider
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 24, pillarY + pillarH - 68);
    ctx.lineTo(px + pillarW - 24, pillarY + pillarH - 68);
    ctx.stroke();

    ctx.fillStyle = textSecondary;
    ctx.font = '500 14px system-ui, -apple-system, sans-serif';
    ctx.fillText(pillar.eq1, px + 24, pillarY + pillarH - 42);
    ctx.fillStyle = textMuted;
    ctx.fillText(pillar.eq2, px + 24, pillarY + pillarH - 20);
  });

  // Lower Section: Category Breakdown + Urban Mining Yield
  const lowerY = pillarY + pillarH + 30;
  const lowerH = isPoster ? 440 : 350;
  const leftW = isPoster ? contentW : Math.round(contentW * 0.58);
  const rightW = isPoster ? contentW : contentW - leftW - 24;

  // Category Breakdown Card
  const catCardH = isPoster ? 400 : lowerH;
  drawRoundedRect(ctx, pad, lowerY, leftW, catCardH, 18);
  ctx.fillStyle = cardBg;
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = textPrimary;
  ctx.font = '700 20px system-ui, -apple-system, sans-serif';
  ctx.fillText('Material Streams Diverted', pad + 28, lowerY + 42);

  ctx.fillStyle = textMuted;
  ctx.font = '500 14px system-ui, -apple-system, sans-serif';
  ctx.fillText(
    `${impact.totalPickups} logged pickups · ${impact.totalUnits.toLocaleString()} electronic units · ${impact.completionRatePct}% verified`,
    pad + 28,
    lowerY + 66
  );

  const topCategories = impact.categories.slice(0, 5);
  const barStartY = lowerY + 100;
  const rowGap = isPoster ? 56 : 48;
  const barMaxW = leftW - 56;

  if (topCategories.length === 0) {
    ctx.fillStyle = textMuted;
    ctx.font = '500 16px system-ui, -apple-system, sans-serif';
    ctx.fillText('Schedule your first doorstep pickup to populate material streams.', pad + 28, barStartY + 30);
  } else {
    topCategories.forEach((cat, idx) => {
      const ry = barStartY + idx * rowGap;
      ctx.fillStyle = textPrimary;
      ctx.font = '600 15px system-ui, -apple-system, sans-serif';
      ctx.fillText(cat.category, pad + 28, ry);

      ctx.fillStyle = textSecondary;
      ctx.font = '600 14px ui-monospace, SFMono-Regular, Menlo, monospace';
      const rightLabel = `${cat.weightKg} kg (${cat.sharePct}%) · ${cat.co2Kg} kg CO₂e`;
      const textWidth = ctx.measureText(rightLabel).width;
      ctx.fillText(rightLabel, pad + 28 + barMaxW - textWidth, ry);

      // Track
      drawRoundedRect(ctx, pad + 28, ry + 10, barMaxW, 12, 6);
      ctx.fillStyle = subtleBg;
      ctx.fill();

      // Fill
      const fillW = Math.max(12, Math.round((barMaxW * Math.min(100, cat.sharePct)) / 100));
      drawRoundedRect(ctx, pad + 28, ry + 10, fillW, 12, 6);
      ctx.fillStyle = cat.accentHex;
      ctx.fill();
    });
  }

  // Urban Mining & Milestones Card
  const mineX = isPoster ? pad : pad + leftW + 24;
  const mineY = isPoster ? lowerY + catCardH + 28 : lowerY;
  const mineH = isPoster ? 290 : lowerH;

  drawRoundedRect(ctx, mineX, mineY, rightW, mineH, 18);
  ctx.fillStyle = cardBg;
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = textPrimary;
  ctx.font = '700 20px system-ui, -apple-system, sans-serif';
  ctx.fillText('Urban Mining Recovery Yield', mineX + 28, mineY + 42);

  ctx.fillStyle = textMuted;
  ctx.font = '500 14px system-ui, -apple-system, sans-serif';
  ctx.fillText('Estimated secondary raw materials returned to manufacturing', mineX + 28, mineY + 66);

  const recoveryTiles = [
    { label: 'Recovered Copper', value: `${impact.copperRecoveredKg} kg`, color: accentEnergy },
    { label: 'Aluminum & Steel', value: `${impact.aluminumSteelRecoveredKg} kg`, color: accentWater },
    { label: 'Precious Metals (Au/Ag)', value: `${impact.preciousMetalsGrams} g`, color: accentCarbon },
    {
      label: 'Milestones Unlocked',
      value: `${ecoExperience.unlockedMilestonesCount} / ${ecoExperience.milestones.length}`,
      color: textPrimary,
    },
  ];

  const tileGap = 16;
  const tileW = (rightW - 56 - tileGap) / 2;
  const tileH = isPoster ? 82 : 104;
  const tileStartY = mineY + 92;

  recoveryTiles.forEach((tile, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const tx = mineX + 28 + col * (tileW + tileGap);
    const ty = tileStartY + row * (tileH + tileGap);

    drawRoundedRect(ctx, tx, ty, tileW, tileH, 12);
    ctx.fillStyle = subtleBg;
    ctx.fill();

    ctx.fillStyle = textMuted;
    ctx.font = '600 13px system-ui, -apple-system, sans-serif';
    ctx.fillText(tile.label, tx + 16, ty + 28);

    ctx.fillStyle = tile.color;
    ctx.font = '800 26px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(tile.value, tx + 16, ty + (isPoster ? 64 : 74));
  });

  // Footer
  const footerY = height - 42;
  ctx.fillStyle = textMuted;
  ctx.font = '500 14px system-ui, -apple-system, sans-serif';
  ctx.fillText(
    'Reboot Earth · Recycle Technology. Restart Tomorrow. · Lifecycle estimates modeled on UNEP & US EPA WARM benchmarks.',
    pad,
    footerY
  );

  const dateStamp = new Date().toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const stampWidth = ctx.measureText(`Generated ${dateStamp}`).width;
  ctx.fillText(`Generated ${dateStamp}`, width - pad - stampWidth, footerY);

  return canvas.toDataURL('image/png');
}
