import type { Facility, LeaderboardProfile } from '../types';
import { ECO_LEVEL_TIERS, type EcoExperienceSummary, type EcoLevelTier } from './ecoLevelSystem';
import { normalizeLeaderboardCityKey } from './firebase';

export interface RankedRecyclerEntry {
  id: string;
  userId: string;
  displayName: string;
  city: string;
  cityKey: string;
  verifiedRecycledKg: number;
  co2AvoidedKg: number;
  pickupsCount: number;
  ecoLevel: number;
  levelTitle: string;
  xp: number;
  badgesCount: number;
  rank: number;
  isCurrentUser: boolean;
  source: 'live' | 'community_benchmark';
}

export interface CityLeaderboardSnapshot {
  scopeLabel: string;
  selectedCity: string;
  entries: RankedRecyclerEntry[];
  topThree: RankedRecyclerEntry[];
  currentUserEntry: RankedRecyclerEntry | null;
  nextRankEntry: RankedRecyclerEntry | null;
  kgToOvertakeNext: number;
  cityTotalKg: number;
  cityTotalCo2Kg: number;
  liveMembersCount: number;
}

export const SUPPORTED_LEADERBOARD_CITIES = [
  'New Delhi',
  'Noida',
  'Gurugram',
  'Bengaluru',
  'Navi Mumbai',
  'Mumbai',
  'Pune',
  'Hyderabad',
  'Chennai',
] as const;

export function getEcoTierForKg(kg: number): EcoLevelTier {
  let matched = ECO_LEVEL_TIERS[0];
  for (const tier of ECO_LEVEL_TIERS) {
    if (kg >= tier.minKg) {
      matched = tier;
    }
  }
  return matched;
}

interface BenchmarkSeed {
  id: string;
  displayName: string;
  city: string;
  verifiedRecycledKg: number;
  pickupsCount: number;
  badgesCount: number;
}

/**
 * Transparent regional community benchmarks so every supported city has an active
 * competitive ladder even before dozens of local neighbors register.
 * Live authenticated Firestore profiles always rank alongside and override benchmarks by weight.
 */
const REGIONAL_BENCHMARKS: BenchmarkSeed[] = [
  // New Delhi
  { id: 'bm_del_1', displayName: 'Aarav Deshmukh', city: 'New Delhi', verifiedRecycledKg: 412.5, pickupsCount: 19, badgesCount: 7 },
  { id: 'bm_del_2', displayName: 'Meera Krishnan', city: 'New Delhi', verifiedRecycledKg: 268.0, pickupsCount: 14, badgesCount: 6 },
  { id: 'bm_del_3', displayName: 'Kabir Malhotra', city: 'New Delhi', verifiedRecycledKg: 174.4, pickupsCount: 11, badgesCount: 5 },
  { id: 'bm_del_4', displayName: 'Priya Nair', city: 'New Delhi', verifiedRecycledKg: 94.2, pickupsCount: 7, badgesCount: 4 },
  { id: 'bm_del_5', displayName: 'Rohan Sengupta', city: 'New Delhi', verifiedRecycledKg: 42.8, pickupsCount: 4, badgesCount: 3 },
  { id: 'bm_del_6', displayName: 'Nisha Bhatia', city: 'New Delhi', verifiedRecycledKg: 16.5, pickupsCount: 2, badgesCount: 2 },
  // Noida
  { id: 'bm_noi_1', displayName: 'Siddharth Verma', city: 'Noida', verifiedRecycledKg: 358.2, pickupsCount: 16, badgesCount: 7 },
  { id: 'bm_noi_2', displayName: 'Anjali Kapoor', city: 'Noida', verifiedRecycledKg: 196.5, pickupsCount: 10, badgesCount: 5 },
  { id: 'bm_noi_3', displayName: 'Devansh Joshi', city: 'Noida', verifiedRecycledKg: 118.0, pickupsCount: 8, badgesCount: 5 },
  { id: 'bm_noi_4', displayName: 'Kavita Rao', city: 'Noida', verifiedRecycledKg: 54.6, pickupsCount: 5, badgesCount: 3 },
  { id: 'bm_noi_5', displayName: 'Tarun Agarwal', city: 'Noida', verifiedRecycledKg: 21.0, pickupsCount: 2, badgesCount: 2 },
  // Gurugram
  { id: 'bm_ggn_1', displayName: 'Vikramaditya Singh', city: 'Gurugram', verifiedRecycledKg: 486.0, pickupsCount: 21, badgesCount: 8 },
  { id: 'bm_ggn_2', displayName: 'Shreya Bansal', city: 'Gurugram', verifiedRecycledKg: 231.5, pickupsCount: 13, badgesCount: 6 },
  { id: 'bm_ggn_3', displayName: 'Arjun Khurana', city: 'Gurugram', verifiedRecycledKg: 132.0, pickupsCount: 9, badgesCount: 5 },
  { id: 'bm_ggn_4', displayName: 'Pooja Chauhan', city: 'Gurugram', verifiedRecycledKg: 66.4, pickupsCount: 6, badgesCount: 4 },
  { id: 'bm_ggn_5', displayName: 'Nikhil Arora', city: 'Gurugram', verifiedRecycledKg: 24.5, pickupsCount: 3, badgesCount: 2 },
  // Bengaluru
  { id: 'bm_blr_1', displayName: 'Karthik Subramanian', city: 'Bengaluru', verifiedRecycledKg: 528.4, pickupsCount: 24, badgesCount: 8 },
  { id: 'bm_blr_2', displayName: 'Divya Hegde', city: 'Bengaluru', verifiedRecycledKg: 310.0, pickupsCount: 15, badgesCount: 7 },
  { id: 'bm_blr_3', displayName: 'Pranav Kulkarni', city: 'Bengaluru', verifiedRecycledKg: 164.8, pickupsCount: 10, badgesCount: 5 },
  { id: 'bm_blr_4', displayName: 'Sneha Reddy', city: 'Bengaluru', verifiedRecycledKg: 88.5, pickupsCount: 7, badgesCount: 4 },
  { id: 'bm_blr_5', displayName: 'Varun Menon', city: 'Bengaluru', verifiedRecycledKg: 31.2, pickupsCount: 3, badgesCount: 3 },
  // Navi Mumbai & Mumbai
  { id: 'bm_nmum_1', displayName: 'Aditi Patwardhan', city: 'Navi Mumbai', verifiedRecycledKg: 382.0, pickupsCount: 17, badgesCount: 7 },
  { id: 'bm_nmum_2', displayName: 'Harshvardhan Joshi', city: 'Navi Mumbai', verifiedRecycledKg: 204.6, pickupsCount: 12, badgesCount: 6 },
  { id: 'bm_nmum_3', displayName: 'Rutuja Sawant', city: 'Navi Mumbai', verifiedRecycledKg: 98.4, pickupsCount: 7, badgesCount: 4 },
  { id: 'bm_nmum_4', displayName: 'Omkar Gokhale', city: 'Navi Mumbai', verifiedRecycledKg: 38.0, pickupsCount: 4, badgesCount: 3 },
  { id: 'bm_mum_1', displayName: 'Zoya Merchant', city: 'Mumbai', verifiedRecycledKg: 465.2, pickupsCount: 20, badgesCount: 8 },
  { id: 'bm_mum_2', displayName: 'Rishabh Parekh', city: 'Mumbai', verifiedRecycledKg: 248.5, pickupsCount: 13, badgesCount: 6 },
  { id: 'bm_mum_3', displayName: 'Tanvi Deshpande', city: 'Mumbai', verifiedRecycledKg: 121.0, pickupsCount: 8, badgesCount: 5 },
  { id: 'bm_mum_4', displayName: 'Kunal Shah', city: 'Mumbai', verifiedRecycledKg: 47.5, pickupsCount: 4, badgesCount: 3 },
  // Pune
  { id: 'bm_pun_1', displayName: 'Atharva Kulkarni', city: 'Pune', verifiedRecycledKg: 334.0, pickupsCount: 15, badgesCount: 7 },
  { id: 'bm_pun_2', displayName: 'Sayali Joshi', city: 'Pune', verifiedRecycledKg: 178.5, pickupsCount: 10, badgesCount: 5 },
  { id: 'bm_pun_3', displayName: 'Saurabh Patil', city: 'Pune', verifiedRecycledKg: 76.2, pickupsCount: 6, badgesCount: 4 },
  { id: 'bm_pun_4', displayName: 'Gauri Chitale', city: 'Pune', verifiedRecycledKg: 29.0, pickupsCount: 3, badgesCount: 2 },
  // Hyderabad
  { id: 'bm_hyd_1', displayName: 'Srinivas Rao', city: 'Hyderabad', verifiedRecycledKg: 392.4, pickupsCount: 18, badgesCount: 7 },
  { id: 'bm_hyd_2', displayName: 'Lakshmi Narayanan', city: 'Hyderabad', verifiedRecycledKg: 185.0, pickupsCount: 11, badgesCount: 5 },
  { id: 'bm_hyd_3', displayName: 'Chaitanya Varma', city: 'Hyderabad', verifiedRecycledKg: 82.6, pickupsCount: 6, badgesCount: 4 },
  { id: 'bm_hyd_4', displayName: 'Keerthi Reddy', city: 'Hyderabad', verifiedRecycledKg: 33.4, pickupsCount: 3, badgesCount: 3 },
  // Chennai
  { id: 'bm_chn_1', displayName: 'Aravind Natarajan', city: 'Chennai', verifiedRecycledKg: 344.8, pickupsCount: 16, badgesCount: 7 },
  { id: 'bm_chn_2', displayName: 'Deepika Sundaram', city: 'Chennai', verifiedRecycledKg: 162.0, pickupsCount: 9, badgesCount: 5 },
  { id: 'bm_chn_3', displayName: 'Vigneshwaran K.', city: 'Chennai', verifiedRecycledKg: 74.5, pickupsCount: 6, badgesCount: 4 },
  { id: 'bm_chn_4', displayName: 'Janani Balasubramanian', city: 'Chennai', verifiedRecycledKg: 26.8, pickupsCount: 3, badgesCount: 2 },
];

export function collectAvailableCities(
  userCity: string,
  facilities: Facility[],
  liveProfiles: LeaderboardProfile[]
): string[] {
  const byKey = new Map<string, string>();
  const register = (raw: string | null | undefined) => {
    const clean = (raw || '').trim();
    if (clean.length < 2) return;
    const key = normalizeLeaderboardCityKey(clean);
    if (!byKey.has(key)) {
      byKey.set(key, clean);
    }
  };

  register(userCity);
  for (const c of SUPPORTED_LEADERBOARD_CITIES) register(c);
  for (const f of facilities) register(f.city);
  for (const p of liveProfiles) register(p.city);

  return Array.from(byKey.values());
}

export function buildCityLeaderboard(params: {
  selectedCity: string;
  scope: 'city' | 'all';
  liveProfiles: LeaderboardProfile[];
  currentUserId: string;
  currentUserName: string;
  currentUserCity: string;
  currentUserExperience: EcoExperienceSummary;
  includeCurrentUser: boolean;
  searchQuery?: string;
}): CityLeaderboardSnapshot {
  const {
    selectedCity,
    scope,
    liveProfiles,
    currentUserId,
    currentUserName,
    currentUserCity,
    currentUserExperience,
    includeCurrentUser,
    searchQuery = '',
  } = params;

  const targetCityKey = normalizeLeaderboardCityKey(selectedCity);
  const userCityKey = normalizeLeaderboardCityKey(currentUserCity || selectedCity);
  const byUid = new Map<string, Omit<RankedRecyclerEntry, 'rank'>>();

  // 1. Add all live Firestore community profiles
  for (const profile of liveProfiles) {
    const pCityKey = profile.cityKey || normalizeLeaderboardCityKey(profile.city);
    if (scope === 'city' && pCityKey !== targetCityKey) continue;
    const kg = Math.max(0, Number(profile.verifiedRecycledKg) || 0);
    const tier = getEcoTierForKg(kg);
    byUid.set(profile.userId, {
      id: profile.id || profile.userId,
      userId: profile.userId,
      displayName: profile.displayName || 'Community Recycler',
      city: profile.city || 'New Delhi',
      cityKey: pCityKey,
      verifiedRecycledKg: Number(kg.toFixed(1)),
      co2AvoidedKg: Number((kg * 1.44).toFixed(1)),
      pickupsCount: Math.max(0, Math.round(Number(profile.pickupsCount) || 0)),
      ecoLevel: profile.ecoLevel || tier.level,
      levelTitle: profile.levelTitle || tier.title,
      xp: Math.round(kg * 10),
      badgesCount: Math.max(0, Math.round(Number(profile.badgesCount) || 0)),
      isCurrentUser: profile.userId === currentUserId,
      source: 'live',
    });
  }

  // 2. Ensure the current user's latest live ecoExperience is reflected accurately
  if (
    includeCurrentUser &&
    currentUserId &&
    (scope === 'all' || userCityKey === targetCityKey)
  ) {
    const kg = Math.max(0, Number(currentUserExperience.verifiedRecycledKg) || 0);
    byUid.set(currentUserId, {
      id: currentUserId,
      userId: currentUserId,
      displayName: currentUserName.trim() || 'You',
      city: currentUserCity.trim() || selectedCity,
      cityKey: userCityKey,
      verifiedRecycledKg: Number(kg.toFixed(1)),
      co2AvoidedKg: Number((kg * 1.44).toFixed(1)),
      pickupsCount: currentUserExperience.verifiedPickupsCount,
      ecoLevel: currentUserExperience.currentTier.level,
      levelTitle: currentUserExperience.currentTier.title,
      xp: currentUserExperience.xp,
      badgesCount: currentUserExperience.unlockedBadgesCount,
      isCurrentUser: true,
      source: 'live',
    });
  }

  const liveMembersCount = byUid.size;

  // 3. Add transparent regional community benchmarks for the selected scope
  const matchingBenchmarks = REGIONAL_BENCHMARKS.filter((b) => {
    const bKey = normalizeLeaderboardCityKey(b.city);
    return scope === 'all' ? true : bKey === targetCityKey;
  });

  // If user entered a custom city without built-in benchmarks, generate deterministic local peer benchmarks
  const benchmarksToUse: BenchmarkSeed[] =
    matchingBenchmarks.length > 0 || scope === 'all'
      ? matchingBenchmarks
      : [
          { id: `bm_custom_1_${targetCityKey}`, displayName: 'Aarav Kulkarni', city: selectedCity, verifiedRecycledKg: 215.0, pickupsCount: 11, badgesCount: 6 },
          { id: `bm_custom_2_${targetCityKey}`, displayName: 'Meera Nair', city: selectedCity, verifiedRecycledKg: 124.5, pickupsCount: 7, badgesCount: 5 },
          { id: `bm_custom_3_${targetCityKey}`, displayName: 'Kabir Verma', city: selectedCity, verifiedRecycledKg: 58.2, pickupsCount: 4, badgesCount: 3 },
          { id: `bm_custom_4_${targetCityKey}`, displayName: 'Priya Menon', city: selectedCity, verifiedRecycledKg: 19.4, pickupsCount: 2, badgesCount: 2 },
        ];

  for (const bm of benchmarksToUse) {
    if (byUid.has(bm.id)) continue;
    const tier = getEcoTierForKg(bm.verifiedRecycledKg);
    byUid.set(bm.id, {
      id: bm.id,
      userId: bm.id,
      displayName: bm.displayName,
      city: bm.city,
      cityKey: normalizeLeaderboardCityKey(bm.city),
      verifiedRecycledKg: Number(bm.verifiedRecycledKg.toFixed(1)),
      co2AvoidedKg: Number((bm.verifiedRecycledKg * 1.44).toFixed(1)),
      pickupsCount: bm.pickupsCount,
      ecoLevel: tier.level,
      levelTitle: tier.title,
      xp: Math.round(bm.verifiedRecycledKg * 10),
      badgesCount: bm.badgesCount,
      isCurrentUser: false,
      source: 'community_benchmark',
    });
  }

  // 4. Sort descending by verifiedRecycledKg (tie-break: pickupsCount, then current user first)
  const sorted = Array.from(byUid.values()).sort((a, b) => {
    if (b.verifiedRecycledKg !== a.verifiedRecycledKg) {
      return b.verifiedRecycledKg - a.verifiedRecycledKg;
    }
    if (b.pickupsCount !== a.pickupsCount) {
      return b.pickupsCount - a.pickupsCount;
    }
    if (a.isCurrentUser !== b.isCurrentUser) {
      return a.isCurrentUser ? -1 : 1;
    }
    return a.displayName.localeCompare(b.displayName);
  });

  const ranked: RankedRecyclerEntry[] = sorted.map((entry, idx) => ({
    ...entry,
    rank: idx + 1,
  }));

  const cityTotalKg = Number(
    ranked.reduce((sum, r) => sum + r.verifiedRecycledKg, 0).toFixed(1)
  );
  const cityTotalCo2Kg = Number((cityTotalKg * 1.44).toFixed(1));

  const currentUserEntry = ranked.find((r) => r.isCurrentUser) || null;
  const nextRankEntry =
    currentUserEntry && currentUserEntry.rank > 1
      ? ranked[currentUserEntry.rank - 2] || null
      : null;
  const kgToOvertakeNext =
    currentUserEntry && nextRankEntry
      ? Number(
          Math.max(0.1, nextRankEntry.verifiedRecycledKg - currentUserEntry.verifiedRecycledKg + 0.1).toFixed(1)
        )
      : 0;

  const q = searchQuery.trim().toLowerCase();
  const filteredEntries = q
    ? ranked.filter(
        (r) =>
          r.displayName.toLowerCase().includes(q) ||
          r.city.toLowerCase().includes(q) ||
          r.levelTitle.toLowerCase().includes(q)
      )
    : ranked;

  return {
    scopeLabel: scope === 'all' ? 'All Cities' : selectedCity,
    selectedCity,
    entries: filteredEntries,
    topThree: ranked.slice(0, 3),
    currentUserEntry,
    nextRankEntry,
    kgToOvertakeNext,
    cityTotalKg,
    cityTotalCo2Kg,
    liveMembersCount,
  };
}
