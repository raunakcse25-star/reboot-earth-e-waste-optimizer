import type { PickupRequest } from '../types';
import { COLLECTED_HISTORY_STATUSES } from '../components/CarbonSavedWidget';

export interface EcoLevelTier {
  level: number;
  title: string;
  minKg: number;
  tagline: string;
  accentClass: string;
  badgeBgClass: string;
}

export const ECO_LEVEL_TIERS: EcoLevelTier[] = [
  {
    level: 1,
    title: 'Eco Starter',
    minKg: 0,
    tagline: 'Beginning your responsible e-waste recycling journey.',
    accentClass: 'text-slate-700 dark:text-sky-300',
    badgeBgClass: 'bg-slate-100 dark:bg-sky-900/50 border-slate-300 dark:border-sky-800',
  },
  {
    level: 2,
    title: 'Circuit Collector',
    minKg: 10,
    tagline: 'Consistently diverting personal electronics from landfill.',
    accentClass: 'text-sky-700 dark:text-sky-300',
    badgeBgClass: 'bg-sky-100 dark:bg-sky-900/60 border-sky-300 dark:border-sky-700',
  },
  {
    level: 3,
    title: 'Metal Guardian',
    minKg: 25,
    tagline: 'Protecting groundwater and recovering copper & precious alloys.',
    accentClass: 'text-cyan-700 dark:text-cyan-300',
    badgeBgClass: 'bg-cyan-100 dark:bg-cyan-900/50 border-cyan-300 dark:border-cyan-700',
  },
  {
    level: 4,
    title: 'Circular Steward',
    minKg: 60,
    tagline: 'Driving measurable material recovery across device categories.',
    accentClass: 'text-teal-700 dark:text-teal-300',
    badgeBgClass: 'bg-teal-100 dark:bg-teal-900/50 border-teal-300 dark:border-teal-700',
  },
  {
    level: 5,
    title: 'Urban Miner',
    minKg: 150,
    tagline: 'High-impact circular economy contributor offsetting virgin mining.',
    accentClass: 'text-emerald-700 dark:text-emerald-300',
    badgeBgClass: 'bg-emerald-100 dark:bg-emerald-900/50 border-emerald-300 dark:border-emerald-700',
  },
  {
    level: 6,
    title: 'Zero-Landfill Vanguard',
    minKg: 350,
    tagline: 'Leading sustained bulk electronics recovery and carbon abatement.',
    accentClass: 'text-amber-700 dark:text-amber-300',
    badgeBgClass: 'bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700',
  },
  {
    level: 7,
    title: 'Planet Reboot Legend',
    minKg: 750,
    tagline: 'Top-tier circularity champion setting the benchmark for zero e-waste.',
    accentClass: 'text-indigo-700 dark:text-indigo-300',
    badgeBgClass: 'bg-indigo-100 dark:bg-indigo-900/50 border-indigo-300 dark:border-indigo-700',
  },
];

export type EcoBadgeIconKey =
  | 'sparkles'
  | 'scale'
  | 'shield'
  | 'trophy'
  | 'crown'
  | 'battery'
  | 'layers'
  | 'cpu';

export interface EcoBadge {
  id: string;
  name: string;
  description: string;
  criteriaLabel: string;
  iconKey: EcoBadgeIconKey;
  unlocked: boolean;
  progressPct: number;
  currentLabel: string;
  tier: 'bronze' | 'silver' | 'gold' | 'emerald';
}

export interface EcoMilestone {
  id: string;
  targetKg: number;
  title: string;
  perk: string;
  unlocked: boolean;
  progressPct: number;
  remainingKg: number;
}

export interface EcoExperienceSummary {
  totalRecycledKg: number;
  verifiedRecycledKg: number;
  pipelineKg: number;
  verifiedPickupsCount: number;
  activePickupsCount: number;
  xp: number;
  currentTier: EcoLevelTier;
  nextTier: EcoLevelTier | null;
  levelProgressPct: number;
  kgToNextLevel: number;
  badges: EcoBadge[];
  unlockedBadgesCount: number;
  milestones: EcoMilestone[];
  unlockedMilestonesCount: number;
}

const MILESTONE_DEFINITIONS = [
  {
    id: 'ms_5kg',
    targetKg: 5,
    title: 'First 5 kg Diverted',
    perk: 'Unlocks Eco Starter digital recycling stamp',
  },
  {
    id: 'ms_15kg',
    targetKg: 15,
    title: '15 kg Clean Stream',
    perk: 'Unlocks Circuit Collector profile flair',
  },
  {
    id: 'ms_50kg',
    targetKg: 50,
    title: '50 kg Half-Quintal Impact',
    perk: 'Eligible for priority doorstep pickup scheduling',
  },
  {
    id: 'ms_100kg',
    targetKg: 100,
    title: '100 kg Century Milestone',
    perk: 'Unlocks verified Circular Impact summary badge',
  },
  {
    id: 'ms_250kg',
    targetKg: 250,
    title: '250 kg Urban Mining Milestone',
    perk: 'Unlocks Urban Miner leaderboard recognition',
  },
  {
    id: 'ms_500kg',
    targetKg: 500,
    title: '500 kg Zero-Landfill Leader',
    perk: 'Unlocks Sustainability Champion partner tier',
  },
];

export function computeEcoExperience(
  pickups: PickupRequest[],
  includePipeline = false
): EcoExperienceSummary {
  const verifiedPickups = pickups.filter((p) => COLLECTED_HISTORY_STATUSES.has(p.status));
  const pendingPickups = pickups.filter(
    (p) => !COLLECTED_HISTORY_STATUSES.has(p.status) && p.status !== 'Cancelled'
  );

  const verifiedRecycledKg = verifiedPickups.reduce(
    (sum, p) => sum + Math.max(0, Number(p.estimatedWeightKg) || 0),
    0
  );
  const pipelineKg = pendingPickups.reduce(
    (sum, p) => sum + Math.max(0, Number(p.estimatedWeightKg) || 0),
    0
  );

  const evaluatedPickups = includePipeline
    ? [...verifiedPickups, ...pendingPickups]
    : verifiedPickups;
  const totalRecycledKg = Number(
    (includePipeline ? verifiedRecycledKg + pipelineKg : verifiedRecycledKg).toFixed(1)
  );

  // 10 Eco XP per recycled kg
  const xp = Math.round(totalRecycledKg * 10);

  // Determine current and next tier
  let tierIdx = 0;
  for (let i = 0; i < ECO_LEVEL_TIERS.length; i++) {
    if (totalRecycledKg >= ECO_LEVEL_TIERS[i].minKg) {
      tierIdx = i;
    }
  }
  const currentTier = ECO_LEVEL_TIERS[tierIdx];
  const nextTier = tierIdx < ECO_LEVEL_TIERS.length - 1 ? ECO_LEVEL_TIERS[tierIdx + 1] : null;

  let levelProgressPct = 100;
  let kgToNextLevel = 0;
  if (nextTier) {
    const span = Math.max(1, nextTier.minKg - currentTier.minKg);
    const gained = Math.max(0, totalRecycledKg - currentTier.minKg);
    levelProgressPct = Math.min(100, Math.round((gained / span) * 100));
    kgToNextLevel = Number(Math.max(0, nextTier.minKg - totalRecycledKg).toFixed(1));
  }

  // Category & pickup counts for badge criteria
  const uniqueCategories = new Set(
    evaluatedPickups.map((p) => (p.category || '').trim()).filter(Boolean)
  );
  const batteryPickups = evaluatedPickups.filter((p) =>
    (p.category || '').toLowerCase().includes('batter')
  ).length;
  const itAndPcbKg = evaluatedPickups
    .filter((p) => {
      const c = (p.category || '').toLowerCase();
      return c.includes('it') || c.includes('telecom') || c.includes('pcb');
    })
    .reduce((sum, p) => sum + Math.max(0, Number(p.estimatedWeightKg) || 0), 0);

  const pct = (current: number, target: number) =>
    Math.min(100, Math.round((Math.max(0, current) / Math.max(0.01, target)) * 100));

  const badges: EcoBadge[] = [
    {
      id: 'first_drop',
      name: 'First Drop Diverted',
      description: 'Completed your first verified e-waste pickup in the history log.',
      criteriaLabel: '1+ pickup',
      iconKey: 'sparkles',
      unlocked: evaluatedPickups.length >= 1,
      progressPct: pct(evaluatedPickups.length, 1),
      currentLabel: `${evaluatedPickups.length} / 1 pickup`,
      tier: 'bronze',
    },
    {
      id: 'weight_10kg',
      name: '10 kg Circuit Saver',
      description: 'Recycled at least 10 kg of discarded electronic devices.',
      criteriaLabel: '10 kg recycled',
      iconKey: 'scale',
      unlocked: totalRecycledKg >= 10,
      progressPct: pct(totalRecycledKg, 10),
      currentLabel: `${totalRecycledKg.toFixed(1)} / 10 kg`,
      tier: 'bronze',
    },
    {
      id: 'weight_50kg',
      name: '50 kg Heavy Lifter',
      description: 'Diverted 50 kg of e-waste away from informal dumping and landfills.',
      criteriaLabel: '50 kg recycled',
      iconKey: 'shield',
      unlocked: totalRecycledKg >= 50,
      progressPct: pct(totalRecycledKg, 50),
      currentLabel: `${totalRecycledKg.toFixed(1)} / 50 kg`,
      tier: 'silver',
    },
    {
      id: 'weight_100kg',
      name: 'Century Recycler',
      description: 'Surpassed 100 kg of cumulative recycled electronics weight.',
      criteriaLabel: '100 kg recycled',
      iconKey: 'trophy',
      unlocked: totalRecycledKg >= 100,
      progressPct: pct(totalRecycledKg, 100),
      currentLabel: `${totalRecycledKg.toFixed(1)} / 100 kg`,
      tier: 'gold',
    },
    {
      id: 'weight_250kg',
      name: 'Circular Champion',
      description: 'Achieved 250 kg of verified e-waste recovery and carbon avoidance.',
      criteriaLabel: '250 kg recycled',
      iconKey: 'crown',
      unlocked: totalRecycledKg >= 250,
      progressPct: pct(totalRecycledKg, 250),
      currentLabel: `${totalRecycledKg.toFixed(1)} / 250 kg`,
      tier: 'gold',
    },
    {
      id: 'battery_guardian',
      name: 'Battery Safe-Keeper',
      description: 'Properly recycled hazardous lithium-ion batteries or power units.',
      criteriaLabel: '1+ Batteries & Power log',
      iconKey: 'battery',
      unlocked: batteryPickups >= 1,
      progressPct: pct(batteryPickups, 1),
      currentLabel: `${batteryPickups} / 1 battery log`,
      tier: 'emerald',
    },
    {
      id: 'multi_stream',
      name: 'Multi-Stream Sorter',
      description: 'Recycled electronics across 3 or more distinct e-waste categories.',
      criteriaLabel: '3+ categories',
      iconKey: 'layers',
      unlocked: uniqueCategories.size >= 3,
      progressPct: pct(uniqueCategories.size, 3),
      currentLabel: `${uniqueCategories.size} / 3 categories`,
      tier: 'silver',
    },
    {
      id: 'it_reviver',
      name: 'IT & PCB Specialist',
      description: 'Recycled 20 kg or more of IT & Telecom or PCB hardware.',
      criteriaLabel: '20 kg IT / PCB',
      iconKey: 'cpu',
      unlocked: itAndPcbKg >= 20,
      progressPct: pct(itAndPcbKg, 20),
      currentLabel: `${itAndPcbKg.toFixed(1)} / 20 kg`,
      tier: 'emerald',
    },
  ];

  const milestones: EcoMilestone[] = MILESTONE_DEFINITIONS.map((m) => ({
    id: m.id,
    targetKg: m.targetKg,
    title: m.title,
    perk: m.perk,
    unlocked: totalRecycledKg >= m.targetKg,
    progressPct: pct(totalRecycledKg, m.targetKg),
    remainingKg: Number(Math.max(0, m.targetKg - totalRecycledKg).toFixed(1)),
  }));

  return {
    totalRecycledKg,
    verifiedRecycledKg: Number(verifiedRecycledKg.toFixed(1)),
    pipelineKg: Number(pipelineKg.toFixed(1)),
    verifiedPickupsCount: verifiedPickups.length,
    activePickupsCount: verifiedPickups.length + pendingPickups.length,
    xp,
    currentTier,
    nextTier,
    levelProgressPct,
    kgToNextLevel,
    badges,
    unlockedBadgesCount: badges.filter((b) => b.unlocked).length,
    milestones,
    unlockedMilestonesCount: milestones.filter((m) => m.unlocked).length,
  };
}
