export type EwasteFactCategory =
  | 'Urban Mining'
  | 'Carbon Impact'
  | 'Circular Design'
  | 'Battery Recovery'
  | 'Material Conservation';

export interface EwasteFact {
  id: string;
  category: EwasteFactCategory;
  headline: string;
  fact: string;
  metricHighlight: string;
  source: string;
  actionTip: string;
  ctaType: 'schedule' | 'marketplace';
}

export const EWASTE_FACTS: readonly EwasteFact[] = [
  {
    id: 'fact_gold_ore_density',
    category: 'Urban Mining',
    headline: 'Circuit boards outshine natural gold mines',
    fact: 'One metric ton of discarded smartphone circuit boards can yield up to 300 grams of gold—roughly 40 to 50 times higher concentration than mined gold ore, while avoiding toxic open-pit mining.',
    metricHighlight: '40–50× richer than gold ore',
    source: 'UN Global E-Waste Monitor',
    actionTip: 'Keep old phones and circuit boards out of drawers—book a certified pickup to recover precious metals.',
    ctaType: 'schedule',
  },
  {
    id: 'fact_laptop_energy_savings',
    category: 'Carbon Impact',
    headline: 'Recycling one million laptops saves city-scale power',
    fact: 'Recycling one million laptops saves enough energy to power more than 3,500 homes for an entire year by displacing energy-intensive virgin aluminum, copper, and silicon smelting.',
    metricHighlight: '3,500+ homes powered/yr',
    source: 'U.S. EPA Electronics Recycling',
    actionTip: 'Retire outdated office or home laptops through verified recyclers or donate functional chargers on the marketplace.',
    ctaType: 'schedule',
  },
  {
    id: 'fact_copper_circularity',
    category: 'Material Conservation',
    headline: 'Copper cables can be recycled infinitely',
    fact: 'Copper recovered from power cords, chargers, and Ethernet harnesses retains 100% of its electrical conductivity and uses up to 85% less energy than mining and refining primary copper.',
    metricHighlight: '85% less energy vs mining',
    source: 'International Copper Association',
    actionTip: 'Have spare working USB-C, HDMI, or power cables? Donate or swap them in the Circular Marketplace.',
    ctaType: 'marketplace',
  },
  {
    id: 'fact_global_ewaste_value',
    category: 'Urban Mining',
    headline: 'Billions in recoverable metals go uncollected',
    fact: 'Roughly $62 billion worth of recoverable natural resources—including gold, silver, palladium, copper, and cobalt—are discarded annually in global e-waste streams, yet under a quarter is formally documented as recycled.',
    metricHighlight: '$62B+ raw materials/yr',
    source: 'UNITAR / ITU Global E-Waste Monitor',
    actionTip: 'Every scheduled pickup improves formal recovery rates and keeps high-value metals in circulation.',
    ctaType: 'schedule',
  },
  {
    id: 'fact_aluminum_remelt',
    category: 'Carbon Impact',
    headline: 'Recycled aluminum cuts emissions by 95%',
    fact: 'Remelting aluminum salvaged from laptop chassis, monitor stands, and server heat sinks requires only 5% of the energy needed to produce virgin aluminum from bauxite ore.',
    metricHighlight: '95% energy saved',
    source: 'International Aluminium Institute',
    actionTip: 'Drop off bent casings, power supplies, and old desktop towers so their aluminum frames return to manufacturing.',
    ctaType: 'schedule',
  },
  {
    id: 'fact_smartphone_manufacturing_footprint',
    category: 'Circular Design',
    headline: 'Most of a phone’s carbon footprint happens before day one',
    fact: 'Approximately 80% of a smartphone’s lifetime greenhouse gas emissions occur during raw material extraction and manufacturing—meaning extending device life by just one extra year slashes its annual footprint dramatically.',
    metricHighlight: '~80% upfront emissions',
    source: 'European Environmental Bureau',
    actionTip: 'Salvage working screens, batteries, or chargers to keep community devices running longer.',
    ctaType: 'marketplace',
  },
  {
    id: 'fact_li_ion_cobalt',
    category: 'Battery Recovery',
    headline: 'Hydrometallurgical battery recycling recovers up to 95% of cobalt',
    fact: 'Modern certified battery recycling processes can reclaim over 90–95% of cobalt, nickel, and copper from spent lithium-ion packs, reducing supply-chain pressure on vulnerable mining regions.',
    metricHighlight: 'Up to 95% cobalt recovery',
    source: 'International Energy Agency (IEA)',
    actionTip: 'Never place swollen or spent lithium-ion batteries in household trash—schedule a dedicated battery pickup.',
    ctaType: 'schedule',
  },
  {
    id: 'fact_rare_earth_magnets',
    category: 'Material Conservation',
    headline: 'Hard drives hold prized rare-earth magnets',
    fact: 'Old spinning hard disk drives contain neodymium-iron-boron (NdFeB) magnets essential for wind turbines and electric vehicle motors—yet less than 1% of rare earth elements are currently recycled worldwide.',
    metricHighlight: '<1% currently recycled',
    source: 'UNEP Metal Recycling Report',
    actionTip: 'Wipe and recycle retired HDDs through certified facilities so rare-earth magnets can be reclaimed.',
    ctaType: 'schedule',
  },
  {
    id: 'fact_silver_solar_pv',
    category: 'Urban Mining',
    headline: 'Decommissioned solar panels are rich in silver and silicon',
    fact: 'Over 85% of a crystalline silicon solar panel’s weight consists of recyclable glass, aluminum frames, copper cabling, and silver busbars that can be fed back into new clean-energy hardware.',
    metricHighlight: '85%+ recyclable by mass',
    source: 'IRENA End-of-Life Solar PV Study',
    actionTip: 'Log retired solar inverters and PV panels under Solar & Energy pickups for specialized recovery.',
    ctaType: 'schedule',
  },
  {
    id: 'fact_spare_parts_reuse',
    category: 'Circular Design',
    headline: 'Component reuse beats shredding by up to 25× in carbon value',
    fact: 'Reusing a functional laptop RAM stick, SSD, or power brick avoids far more CO₂e than melting it down for scrap because it preserves the embodied manufacturing energy of complex microchips.',
    metricHighlight: 'Up to 25× higher impact',
    source: 'Ellen MacArthur Foundation',
    actionTip: 'List tested working RAM, SSDs, adapters, and cooling fans on the Circular Marketplace before recycling.',
    ctaType: 'marketplace',
  },
  {
    id: 'fact_toxic_lead_diversion',
    category: 'Material Conservation',
    headline: 'Small weight, huge landfill protection',
    fact: 'Although electronic waste makes up roughly 2% of solid waste in landfills by volume, it can account for up to 70% of heavy-metal toxic leachate such as lead, mercury, and cadmium if dumped improperly.',
    metricHighlight: 'Up to 70% toxic leachate risk',
    source: 'World Economic Forum',
    actionTip: 'Diverting even a few kilograms of old electronics prevents groundwater contamination for decades.',
    ctaType: 'schedule',
  },
  {
    id: 'fact_palladium_mlcc',
    category: 'Urban Mining',
    headline: 'Tiny motherboard capacitors contain precious palladium',
    fact: 'Multi-layer ceramic capacitors (MLCCs) soldered onto telecom routers and server boards contain palladium and silver—two of the most valuable platinum-group and precious metals in urban mining.',
    metricHighlight: 'Au + Ag + Pd in PCBs',
    source: 'StEP Initiative (UN University)',
    actionTip: 'Track live gold-bearing PCB buy-back rates in Buy-Back Price Alerts to maximize recovery value.',
    ctaType: 'schedule',
  },
  {
    id: 'fact_modular_repair_jobs',
    category: 'Circular Design',
    headline: 'Circular electronics create 10× more jobs than landfilling',
    fact: 'Refurbishing, diagnosing, harvesting spare parts, and formally recycling e-waste generates roughly 10 times more skilled local jobs per metric ton than incineration or landfill disposal.',
    metricHighlight: '10× local green jobs',
    source: 'World Resources Institute',
    actionTip: 'Support local circular workflows by donating functional parts and using verified neighborhood hubs.',
    ctaType: 'marketplace',
  },
  {
    id: 'fact_charger_standardization',
    category: 'Circular Design',
    headline: 'Unused chargers create thousands of tons of avoidable waste',
    fact: 'Standardizing on USB-C power delivery and sharing unused compatible adapters can eliminate more than 11,000 metric tons of redundant charger e-waste every single year.',
    metricHighlight: '11,000+ tons saved/yr',
    source: 'European Commission Circular Impact',
    actionTip: 'Got extra 45W–100W USB-C adapters or laptop bricks? Pass them on in the Circular Marketplace.',
    ctaType: 'marketplace',
  },
  {
    id: 'fact_refrigerant_climate_impact',
    category: 'Carbon Impact',
    headline: 'Safe appliance recycling prevents super-pollutant leaks',
    fact: 'Recovering refrigerants from old air conditioners and refrigerators at certified facilities prevents hydrofluorocarbons (HFCs)—which can trap over 1,000 times more heat than CO₂—from escaping into the atmosphere.',
    metricHighlight: '1,000×+ CO₂ warming potential',
    source: 'Project Drawdown',
    actionTip: 'Always book certified Large Appliance pickups so refrigerants are evacuated safely before dismantling.',
    ctaType: 'schedule',
  },
  {
    id: 'fact_plastics_closed_loop',
    category: 'Material Conservation',
    headline: 'Closed-loop ABS plastics cut device plastic emissions by 75%',
    fact: 'Sorted post-consumer ABS and polycarbonate plastics from printer housings and monitors can be re-compounded into new electronics enclosures with up to 75% lower carbon intensity than petroleum-based resin.',
    metricHighlight: '75% lower plastic CO₂e',
    source: 'Circular Electronics Partnership',
    actionTip: 'Keep casings intact when scheduling pickups—clean sorting boosts closed-loop polymer recovery.',
    ctaType: 'schedule',
  },
];

export function getDateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function getDailyEwasteFact(date = new Date()): EwasteFact {
  const dateKey = getDateKey(date);
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) {
    hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0;
  }
  return EWASTE_FACTS[hash % EWASTE_FACTS.length];
}

export function getRandomEwasteFact(excludeId?: string): EwasteFact {
  const candidates = excludeId
    ? EWASTE_FACTS.filter((f) => f.id !== excludeId)
    : EWASTE_FACTS;
  const pool = candidates.length > 0 ? candidates : EWASTE_FACTS;
  return pool[Math.floor(Math.random() * pool.length)];
}
