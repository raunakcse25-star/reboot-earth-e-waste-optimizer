import type {
  BuyBackAlertCondition,
  BuyBackCategoryId,
  BuyBackMarketQuote,
  MarketPriceAlert,
} from '../types';

export type BrowserPushPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

interface BuyBackCategorySeed {
  id: BuyBackCategoryId;
  name: string;
  shortName: string;
  description: string;
  metalHighlights: string;
  linkedPickupCategory: string;
  basePriceInr: number;
  minBandInr: number;
  maxBandInr: number;
  defaultTargetInr: number;
  volatilityPct: number;
  demandLevel: 'Surging' | 'High' | 'Steady';
}

export const BUYBACK_CATEGORY_SEEDS: readonly BuyBackCategorySeed[] = [
  {
    id: 'gold_pcb',
    name: 'Gold-Bearing Circuit Boards',
    shortName: 'Gold PCBs',
    description: 'Telecom, server motherboards, gold-finger expansion cards & high-grade PCB scrap.',
    metalHighlights: 'Au · Pd · Cu',
    linkedPickupCategory: 'PCB & Components',
    basePriceInr: 3480,
    minBandInr: 3100,
    maxBandInr: 4150,
    defaultTargetInr: 3600,
    volatilityPct: 0.024,
    demandLevel: 'Surging',
  },
  {
    id: 'ram_cpu',
    name: 'RAM Modules & Ceramic CPUs',
    shortName: 'RAM & CPUs',
    description: 'Gold-plated DIMM sticks, server Xeon/EPYC processors, and ceramic IC packages.',
    metalHighlights: 'Au · Ag · Cu',
    linkedPickupCategory: 'IT & Telecom',
    basePriceInr: 5240,
    minBandInr: 4750,
    maxBandInr: 6100,
    defaultTargetInr: 5450,
    volatilityPct: 0.022,
    demandLevel: 'Surging',
  },
  {
    id: 'smartphone_boards',
    name: 'Smartphone Logic Boards',
    shortName: 'Mobile PCBs',
    description: 'Intact mobile phone mainboards with high precious-metal & tantalum density.',
    metalHighlights: 'Au · Ag · Ta',
    linkedPickupCategory: 'IT & Telecom',
    basePriceInr: 2860,
    minBandInr: 2520,
    maxBandInr: 3420,
    defaultTargetInr: 3000,
    volatilityPct: 0.023,
    demandLevel: 'High',
  },
  {
    id: 'laptop_boards',
    name: 'Laptop Motherboards',
    shortName: 'Laptop PCBs',
    description: 'Multi-layer notebook system boards with integrated BGA chips and gold connectors.',
    metalHighlights: 'Au · Cu · Sn',
    linkedPickupCategory: 'IT & Telecom',
    basePriceInr: 1440,
    minBandInr: 1240,
    maxBandInr: 1760,
    defaultTargetInr: 1520,
    volatilityPct: 0.02,
    demandLevel: 'High',
  },
  {
    id: 'copper_cables',
    name: 'Insulated Copper Cables & Harnesses',
    shortName: 'Copper Cables',
    description: 'Power cords, Cat6 Ethernet looms, industrial wiring harnesses & transformer coils.',
    metalHighlights: 'Cu · Brass',
    linkedPickupCategory: 'Consumer Electronics',
    basePriceInr: 645,
    minBandInr: 560,
    maxBandInr: 790,
    defaultTargetInr: 685,
    volatilityPct: 0.019,
    demandLevel: 'High',
  },
  {
    id: 'li_ion_batteries',
    name: 'Lithium-Ion Battery Packs',
    shortName: 'Li-Ion Packs',
    description: 'Laptop & EV black-mass grade cells rich in recoverable cobalt, nickel, and lithium.',
    metalHighlights: 'Co · Ni · Li',
    linkedPickupCategory: 'Batteries & Power',
    basePriceInr: 485,
    minBandInr: 410,
    maxBandInr: 620,
    defaultTargetInr: 520,
    volatilityPct: 0.025,
    demandLevel: 'Surging',
  },
  {
    id: 'power_supplies',
    name: 'SMPS & Server Power Supplies',
    shortName: 'SMPS / PSUs',
    description: 'Desktop and rackmount power supplies with copper windings and aluminum sinks.',
    metalHighlights: 'Cu · Al · Fe',
    linkedPickupCategory: 'Small Appliances',
    basePriceInr: 215,
    minBandInr: 175,
    maxBandInr: 280,
    defaultTargetInr: 235,
    volatilityPct: 0.018,
    demandLevel: 'Steady',
  },
  {
    id: 'solar_pv_cells',
    name: 'Solar PV Cells & Silver Busbars',
    shortName: 'Solar PV',
    description: 'Decommissioned crystalline silicon panels & high-purity silver tabbing ribbons.',
    metalHighlights: 'Ag · Si · Al',
    linkedPickupCategory: 'Solar & Energy',
    basePriceInr: 930,
    minBandInr: 820,
    maxBandInr: 1140,
    defaultTargetInr: 985,
    volatilityPct: 0.021,
    demandLevel: 'High',
  },
];

function deterministicWave(seedIndex: number, step: number): number {
  const x = Math.sin((seedIndex + 1) * 1.7 + step * 0.65) * 0.6 + Math.cos(step * 0.35 + seedIndex) * 0.4;
  return x;
}

export function createInitialMarketQuotes(): BuyBackMarketQuote[] {
  const nowIso = new Date().toISOString();
  const minuteSeed = Math.floor(Date.now() / 60000);

  return BUYBACK_CATEGORY_SEEDS.map((seed, idx) => {
    const history: number[] = [];
    let cursor = seed.basePriceInr;
    for (let i = 11; i >= 0; i--) {
      const wave = deterministicWave(idx, minuteSeed - i);
      const delta = seed.basePriceInr * seed.volatilityPct * 0.65 * wave;
      cursor = Math.round(
        Math.max(seed.minBandInr, Math.min(seed.maxBandInr, seed.basePriceInr + delta))
      );
      history.push(cursor);
    }

    const currentPriceInr = history[history.length - 1];
    const previousPriceInr = history[history.length - 2] ?? seed.basePriceInr;
    const changePct = Number(
      (((currentPriceInr - seed.basePriceInr) / Math.max(1, seed.basePriceInr)) * 100).toFixed(2)
    );

    return {
      id: seed.id,
      name: seed.name,
      shortName: seed.shortName,
      description: seed.description,
      metalHighlights: seed.metalHighlights,
      linkedPickupCategory: seed.linkedPickupCategory,
      basePriceInr: seed.basePriceInr,
      minBandInr: seed.minBandInr,
      maxBandInr: seed.maxBandInr,
      currentPriceInr,
      previousPriceInr,
      dayHighInr: Math.max(...history),
      dayLowInr: Math.min(...history),
      changePct,
      defaultTargetInr: seed.defaultTargetInr,
      demandLevel: seed.demandLevel,
      history,
      updatedAtIso: nowIso,
    };
  });
}

export function stepMarketQuotes(currentQuotes: BuyBackMarketQuote[]): BuyBackMarketQuote[] {
  const nowIso = new Date().toISOString();
  return currentQuotes.map((q, idx) => {
    const seed = BUYBACK_CATEGORY_SEEDS[idx];
    const vol = seed?.volatilityPct ?? 0.02;
    // Slight upward drift + mean reversion + organic tick jitter
    const reversion = (q.basePriceInr - q.currentPriceInr) * 0.14;
    const randomKick = (Math.random() - 0.46) * q.basePriceInr * vol * 1.15;
    const nextRaw = Math.round(q.currentPriceInr + reversion + randomKick);
    const nextPrice = Math.max(q.minBandInr, Math.min(q.maxBandInr, nextRaw));
    const nextHistory = [...q.history.slice(-11), nextPrice];
    const changePct = Number(
      (((nextPrice - q.basePriceInr) / Math.max(1, q.basePriceInr)) * 100).toFixed(2)
    );

    return {
      ...q,
      previousPriceInr: q.currentPriceInr,
      currentPriceInr: nextPrice,
      dayHighInr: Math.max(q.dayHighInr, nextPrice),
      dayLowInr: Math.min(q.dayLowInr, nextPrice),
      changePct,
      history: nextHistory,
      updatedAtIso: nowIso,
    };
  });
}

export function simulateCategoryPriceMove(
  currentQuotes: BuyBackMarketQuote[],
  categoryId: BuyBackCategoryId,
  targetPriceInr: number,
  condition: BuyBackAlertCondition
): BuyBackMarketQuote[] {
  const nowIso = new Date().toISOString();
  return currentQuotes.map((q) => {
    if (q.id !== categoryId) return q;
    const bump = Math.max(15, Math.round(targetPriceInr * 0.02));
    const nextPrice =
      condition === 'above'
        ? Math.min(100000, Math.max(targetPriceInr + bump, q.currentPriceInr + bump))
        : Math.max(10, Math.min(targetPriceInr - bump, q.currentPriceInr - bump));
    const nextHistory = [...q.history.slice(-11), nextPrice];
    const changePct = Number(
      (((nextPrice - q.basePriceInr) / Math.max(1, q.basePriceInr)) * 100).toFixed(2)
    );
    return {
      ...q,
      previousPriceInr: q.currentPriceInr,
      currentPriceInr: nextPrice,
      dayHighInr: Math.max(q.dayHighInr, nextPrice),
      dayLowInr: Math.min(q.dayLowInr, nextPrice),
      changePct,
      history: nextHistory,
      updatedAtIso: nowIso,
    };
  });
}

export function doesQuoteMeetAlert(quote: BuyBackMarketQuote, alert: MarketPriceAlert): boolean {
  if (!alert.active) return false;
  if (alert.condition === 'above') {
    return quote.currentPriceInr >= alert.targetPriceInr;
  }
  return quote.currentPriceInr <= alert.targetPriceInr;
}

export function getBrowserPushStatus(): BrowserPushPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return window.Notification.permission;
}

export async function requestBrowserPushPermission(): Promise<BrowserPushPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const result = await window.Notification.requestPermission();
    return result;
  } catch {
    return window.Notification.permission;
  }
}

export function dispatchBrowserPushNotification(params: {
  title: string;
  body: string;
  tag: string;
}): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (window.Notification.permission !== 'granted') {
    return false;
  }
  try {
    new window.Notification(params.title, {
      body: params.body,
      tag: params.tag,
    });
    return true;
  } catch {
    return false;
  }
}

export function formatInrPerKg(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}/kg`;
}
