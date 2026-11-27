import type { PickupRequest } from '../types';

export type SmartGroupId =
  | 'working-electronics'
  | 'scrap-metals'
  | 'hazardous-batteries'
  | 'general-ewaste';

export interface SmartGroupDefinition {
  id: SmartGroupId;
  label: string;
  shortDescription: string;
  handlingGuidance: string;
  accent: 'emerald' | 'amber' | 'rose' | 'sky';
}

export interface SmartClassification {
  groupId: SmartGroupId;
  reason: string;
}

export interface SmartPickupGroup extends SmartGroupDefinition {
  items: {
    pickup: PickupRequest;
    reason: string;
  }[];
  totalWeightKg: number;
  totalUnits: number;
  estimatedCo2Kg: number;
}

export const SMART_GROUP_DEFINITIONS: SmartGroupDefinition[] = [
  {
    id: 'working-electronics',
    label: 'Working Electronics',
    shortDescription: 'Functional or refurbishable devices suited for reuse & circular resale',
    handlingGuidance: 'Prioritize wipe-and-refurbish intake or list spare parts on Circular Marketplace.',
    accent: 'emerald',
  },
  {
    id: 'scrap-metals',
    label: 'Scrap Metals',
    shortDescription: 'PCBs, copper cabling, heavy appliance frames & alloy-rich hardware',
    handlingGuidance: 'Route to mechanical shredding and precious/base metal smelting recovery.',
    accent: 'amber',
  },
  {
    id: 'hazardous-batteries',
    label: 'Hazardous Batteries',
    shortDescription: 'Lithium-ion cells, UPS backups, swollen packs & high-risk power units',
    handlingGuidance: 'Isolate terminals, store in fire-safe containment, and dispatch via hazmat handling.',
    accent: 'rose',
  },
  {
    id: 'general-ewaste',
    label: 'General E-Waste',
    shortDescription: 'Non-working consumer electronics, displays & mixed IT peripherals',
    handlingGuidance: 'Process through certified disassembly for polymer, glass, and component sorting.',
    accent: 'sky',
  },
];

const HAZARDOUS_BATTERY_KEYWORDS =
  /\b(battery|batteries|li-ion|lithium|lipo|li-po|lead[\s-]?acid|ni-cd|nimh|ups|inverter|power[\s-]?bank|cell[\s-]?pack|swollen|bulging|leaking|thermal|capacitor|mercury|crt|fluorescent|hazmat|hazardous)\b/i;

const SCRAP_METAL_KEYWORDS =
  /\b(pcb|circuit[\s-]?board|motherboard|logic[\s-]?board|gpu|graphics[\s-]?card|ram|memory[\s-]?module|cpu|processor|server[\s-]?rack|chassis|copper|cable|cables|wire|wiring|wiring[\s-]?harness|aluminum|aluminium|steel|metal|iron|motor|transformer|heatsink|heat[\s-]?sink|fridge|refrigerator|washer|washing[\s-]?machine|dishwasher|air[\s-]?conditioner|ac[\s-]?unit|microwave|scrap|coil|solar[\s-]?panel)\b/i;

const WORKING_CONDITION_KEYWORDS = /\b(working|refurbishable|partially[\s-]?working|functional|good|intact)\b/i;
const DAMAGED_BATTERY_CONDITION = /\b(swollen|damaged|hazard|leaking)\b/i;

/**
 * Pure local deterministic classifier for past e-waste pickup records.
 * Priority order:
 *  1. Hazardous Batteries (safety-critical isolation first)
 *  2. Working Electronics (reuse / refurbishment recovery)
 *  3. Scrap Metals (PCBs, cables, appliances, metal-dense streams)
 *  4. General E-Waste (other non-working devices & peripherals)
 */
export function classifyPickupLocally(pickup: PickupRequest): SmartClassification {
  const name = (pickup.deviceName || '').trim();
  const category = (pickup.category || '').trim();
  const condition = (pickup.condition || '').trim();
  const instructions = (pickup.instructions || '').trim();
  const combinedText = `${name} ${instructions}`;

  // 1. Hazardous Batteries (highest safety priority)
  if (DAMAGED_BATTERY_CONDITION.test(condition)) {
    return {
      groupId: 'hazardous-batteries',
      reason: `Flagged by condition (${condition})`,
    };
  }

  if (category === 'Batteries & Power') {
    return {
      groupId: 'hazardous-batteries',
      reason: 'Classified from Batteries & Power stream',
    };
  }

  const hazardMatch = combinedText.match(HAZARDOUS_BATTERY_KEYWORDS);
  if (hazardMatch) {
    return {
      groupId: 'hazardous-batteries',
      reason: `Detected battery / hazard term ("${hazardMatch[0]}")`,
    };
  }

  // 2. Working Electronics (reuse & refurbishment candidates)
  if (WORKING_CONDITION_KEYWORDS.test(condition) && !/\bnon[\s-]?working\b/i.test(condition)) {
    return {
      groupId: 'working-electronics',
      reason: `Condition eligible for reuse (${condition})`,
    };
  }

  // 3. Scrap Metals (PCBs, heavy appliances, cables, metal-dense electronics)
  if (
    category === 'PCB & Components' ||
    category === 'Large Appliances' ||
    category === 'Small Appliances' ||
    category === 'Solar & Energy'
  ) {
    return {
      groupId: 'scrap-metals',
      reason: `Metal & component recovery stream (${category})`,
    };
  }

  const metalMatch = combinedText.match(SCRAP_METAL_KEYWORDS);
  if (metalMatch) {
    return {
      groupId: 'scrap-metals',
      reason: `Matched metal/PCB recovery keyword ("${metalMatch[0]}")`,
    };
  }

  // 4. General E-Waste fallback
  return {
    groupId: 'general-ewaste',
    reason: `Standard disassembly (${category || 'Mixed Electronics'})`,
  };
}

export function groupPickupsWithSmartFilter(pickups: PickupRequest[]): SmartPickupGroup[] {
  const bucketMap = new Map<SmartGroupId, SmartPickupGroup>();

  for (const def of SMART_GROUP_DEFINITIONS) {
    bucketMap.set(def.id, {
      ...def,
      items: [],
      totalWeightKg: 0,
      totalUnits: 0,
      estimatedCo2Kg: 0,
    });
  }

  for (const pickup of pickups) {
    const classification = classifyPickupLocally(pickup);
    const group = bucketMap.get(classification.groupId);
    if (!group) continue;
    group.items.push({ pickup, reason: classification.reason });
    const weight = Number(pickup.estimatedWeightKg) || 0;
    const units = Number(pickup.quantity) || 0;
    group.totalWeightKg += weight;
    group.totalUnits += units;
  }

  return SMART_GROUP_DEFINITIONS.map((def) => {
    const group = bucketMap.get(def.id)!;
    const roundedWeight = Math.round(group.totalWeightKg * 10) / 10;
    return {
      ...group,
      totalWeightKg: roundedWeight,
      estimatedCo2Kg: Math.round(roundedWeight * 1.44 * 10) / 10,
    };
  });
}
