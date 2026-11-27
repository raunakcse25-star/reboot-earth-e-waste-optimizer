import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Award,
  CalendarClock,
  Check,
  Crown,
  Eye,
  EyeOff,
  MapPin,
  Medal,
  RefreshCw,
  Search,
  Trophy,
} from 'lucide-react';
import type { Facility, LeaderboardProfile } from '../types';
import { ECO_LEVEL_TIERS, type EcoExperienceSummary } from '../lib/ecoLevelSystem';
import {
  buildCityLeaderboard,
  collectAvailableCities,
  type RankedRecyclerEntry,
} from '../lib/leaderboardData';

interface CommunityLeaderboardWidgetProps {
  compact?: boolean;
  facilities: Facility[];
  liveProfiles: LeaderboardProfile[];
  currentUserId: string;
  currentUserName: string;
  currentUserCity: string;
  ecoExperience: EcoExperienceSummary;
  isListedOnLeaderboard: boolean;
  canSyncCloud: boolean;
  syncingRank: boolean;
  syncNotice: string | null;
  onSyncMyRank: (cityOverride: string) => Promise<void>;
  onToggleVisibility: (nextVisible: boolean, cityOverride: string) => Promise<void>;
  onOpenFullTab?: () => void;
  onSchedulePickup: () => void;
}

function getRankIcon(rank: number) {
  if (rank === 1) return <Crown className="w-4 h-4 text-amber-500 shrink-0" />;
  if (rank === 2) return <Medal className="w-4 h-4 text-slate-400 dark:text-slate-300 shrink-0" />;
  if (rank === 3) return <Medal className="w-4 h-4 text-amber-700 dark:text-amber-500 shrink-0" />;
  return null;
}

export const CommunityLeaderboardWidget: React.FC<CommunityLeaderboardWidgetProps> = ({
  compact = false,
  facilities,
  liveProfiles,
  currentUserId,
  currentUserName,
  currentUserCity,
  ecoExperience,
  isListedOnLeaderboard,
  canSyncCloud,
  syncingRank,
  syncNotice,
  onSyncMyRank,
  onToggleVisibility,
  onOpenFullTab,
  onSchedulePickup,
}) => {
  const defaultCity = (currentUserCity || '').trim() || 'New Delhi';
  const [selectedCity, setSelectedCity] = useState<string>(defaultCity);
  const [scope, setScope] = useState<'city' | 'all'>('city');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const clean = (currentUserCity || '').trim();
    if (clean.length >= 2) {
      setSelectedCity(clean);
    }
  }, [currentUserCity]);

  const availableCities = useMemo(
    () => collectAvailableCities(defaultCity, facilities, liveProfiles),
    [defaultCity, facilities, liveProfiles]
  );

  const snapshot = useMemo(
    () =>
      buildCityLeaderboard({
        selectedCity,
        scope: compact ? 'city' : scope,
        liveProfiles,
        currentUserId,
        currentUserName,
        currentUserCity: defaultCity,
        currentUserExperience: ecoExperience,
        includeCurrentUser: isListedOnLeaderboard,
        searchQuery: compact ? '' : searchQuery,
      }),
    [
      selectedCity,
      scope,
      compact,
      liveProfiles,
      currentUserId,
      currentUserName,
      defaultCity,
      ecoExperience,
      isListedOnLeaderboard,
      searchQuery,
    ]
  );

  const visibleCompactRows = useMemo(() => {
    const topFive = snapshot.entries.slice(0, 5);
    const userRow = snapshot.currentUserEntry;
    if (userRow && !topFive.some((r) => r.isCurrentUser)) {
      return { topRows: topFive, trailingUserRow: userRow };
    }
    return { topRows: topFive, trailingUserRow: null as RankedRecyclerEntry | null };
  }, [snapshot.entries, snapshot.currentUserEntry]);

  const maxRowKg = useMemo(
    () => Math.max(1, ...snapshot.entries.map((r) => r.verifiedRecycledKg)),
    [snapshot.entries]
  );

  if (compact) {
    return (
      <section className="rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] overflow-hidden">
        {/* Compact Widget Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-sky-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-sky-200/70">
              <span>Community Leaderboard</span>
              <span aria-hidden="true">·</span>
              <span className="font-medium text-sky-700 dark:text-sky-400">{selectedCity}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {snapshot.cityTotalKg.toLocaleString()} kg city total
              </span>
            </div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Top E-Waste Recyclers in {selectedCity}</span>
            </h4>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <select
              aria-label="Filter leaderboard by city"
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-sky-800 bg-slate-50 dark:bg-[#061526] text-slate-800 dark:text-sky-100 focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
            >
              {availableCities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
            {onOpenFullTab && (
              <button
                type="button"
                onClick={onOpenFullTab}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-700 dark:text-sky-300 border border-slate-200 dark:border-sky-800 hover:border-sky-500 inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                <span>Full Leaderboard</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Current User Competitive Standing Strip */}
        <div className="px-5 py-3 bg-slate-50/70 dark:bg-[#061526]/70 border-b border-slate-200 dark:border-sky-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="text-slate-600 dark:text-sky-200/80">
              Your Standing:{' '}
              <strong className="font-mono tabular-nums text-slate-900 dark:text-sky-50">
                {snapshot.currentUserEntry
                  ? `#${snapshot.currentUserEntry.rank} of ${snapshot.entries.length}`
                  : isListedOnLeaderboard
                    ? `Ranked in ${defaultCity}`
                    : 'Hidden'}
              </strong>
            </span>
            <span aria-hidden="true" className="text-slate-300 dark:text-sky-800 hidden sm:inline">
              |
            </span>
            <span className="text-slate-600 dark:text-sky-200/80">
              Level:{' '}
              <strong className="text-emerald-700 dark:text-emerald-300">
                Lvl {ecoExperience.currentTier.level} · {ecoExperience.currentTier.title}
              </strong>
            </span>
            {snapshot.nextRankEntry && snapshot.currentUserEntry && (
              <>
                <span aria-hidden="true" className="text-slate-300 dark:text-sky-800 hidden sm:inline">
                  |
                </span>
                <span className="text-slate-600 dark:text-sky-200/80">
                  Next Rank:{' '}
                  <strong className="font-mono tabular-nums text-sky-700 dark:text-sky-400">
                    +{snapshot.kgToOvertakeNext} kg
                  </strong>{' '}
                  to pass #{snapshot.nextRankEntry.rank}
                </span>
              </>
            )}
            {snapshot.currentUserEntry && snapshot.currentUserEntry.rank === 1 && (
              <>
                <span aria-hidden="true" className="text-slate-300 dark:text-sky-800 hidden sm:inline">
                  |
                </span>
                <span className="font-semibold text-amber-700 dark:text-amber-300">
                  Holding #1 in {selectedCity}
                </span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={onSchedulePickup}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 hover:bg-sky-700 dark:hover:bg-sky-400 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer self-start sm:self-auto"
          >
            <CalendarClock className="w-3.5 h-3.5" />
            <span>Recycle to Climb</span>
          </button>
        </div>

        {/* Compact Top 5 Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/60 dark:bg-[#061526]/40 text-slate-500 dark:text-sky-200/70 border-b border-slate-200 dark:border-sky-900/50">
              <tr>
                <th className="px-4 py-2.5 font-medium w-16">Rank</th>
                <th className="px-4 py-2.5 font-medium">Recycler</th>
                <th className="px-4 py-2.5 font-medium">Eco Level</th>
                <th className="px-4 py-2.5 font-medium text-right">Recycled</th>
                <th className="px-4 py-2.5 font-medium text-right">CO₂e Avoided</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-sky-900/50">
              {visibleCompactRows.topRows.map((entry) => (
                <tr
                  key={entry.id}
                  className={
                    entry.isCurrentUser
                      ? 'bg-sky-50/80 dark:bg-sky-950/45 text-slate-900 dark:text-sky-50 font-medium'
                      : 'text-slate-700 dark:text-sky-100/90 hover:bg-slate-50/60 dark:hover:bg-sky-950/25 transition-colors'
                  }
                >
                  <td className="px-4 py-2.5 font-mono tabular-nums font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      {getRankIcon(entry.rank)}
                      <span>#{entry.rank}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-semibold text-slate-900 dark:text-sky-50">
                      {entry.displayName}
                    </span>
                    {entry.isCurrentUser && (
                      <span className="ml-2 text-[11px] font-semibold text-sky-700 dark:text-sky-400">
                        · You
                      </span>
                    )}
                    {!entry.isCurrentUser && entry.source === 'live' && (
                      <span className="ml-2 text-[11px] text-emerald-700 dark:text-emerald-400">
                        · Verified Member
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-sky-300/75 mr-1.5">
                      Lvl {entry.ecoLevel}
                    </span>
                    <span>{entry.levelTitle}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono tabular-nums font-semibold text-right text-slate-900 dark:text-sky-50">
                    {entry.verifiedRecycledKg.toFixed(1)} kg
                  </td>
                  <td className="px-4 py-2.5 font-mono tabular-nums text-right text-emerald-700 dark:text-emerald-400">
                    {entry.co2AvoidedKg.toFixed(1)} kg
                  </td>
                </tr>
              ))}
              {visibleCompactRows.trailingUserRow && (
                <tr className="bg-sky-50/80 dark:bg-sky-950/45 text-slate-900 dark:text-sky-50 font-medium border-t-2 border-sky-200 dark:border-sky-800">
                  <td className="px-4 py-2.5 font-mono tabular-nums font-semibold">
                    #{visibleCompactRows.trailingUserRow.rank}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-semibold">{visibleCompactRows.trailingUserRow.displayName}</span>
                    <span className="ml-2 text-[11px] font-semibold text-sky-700 dark:text-sky-400">
                      · You
                    </span>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-sky-300/75 mr-1.5">
                      Lvl {visibleCompactRows.trailingUserRow.ecoLevel}
                    </span>
                    <span>{visibleCompactRows.trailingUserRow.levelTitle}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono tabular-nums font-semibold text-right">
                    {visibleCompactRows.trailingUserRow.verifiedRecycledKg.toFixed(1)} kg
                  </td>
                  <td className="px-4 py-2.5 font-mono tabular-nums text-right text-emerald-700 dark:text-emerald-400">
                    {visibleCompactRows.trailingUserRow.co2AvoidedKg.toFixed(1)} kg
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  // Full Community Leaderboard View
  return (
    <div className="space-y-6">
      {/* Header & Controls Bar */}
      <section className="rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-sky-200/70">
              <span>Eco Experience Competitive Standings</span>
              <span aria-hidden="true">·</span>
              <span>{snapshot.scopeLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {snapshot.liveMembersCount} synced member{snapshot.liveMembersCount === 1 ? '' : 's'}
              </span>
            </div>
            <h3 className="font-display text-lg font-bold text-slate-900 dark:text-sky-50">
              Community Recycling Leaderboard
            </h3>
            <p className="text-xs text-slate-600 dark:text-sky-200/75 max-w-2xl leading-relaxed">
              Rankings are ordered by verified e-waste weight recycled (kg) and linked directly to your Eco Experience tier. Only your public display name, city, level, and recycled mass are shared—never emails or phone numbers.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={syncingRank}
              onClick={() => void onToggleVisibility(!isListedOnLeaderboard, defaultCity)}
              className="px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-sky-800 text-slate-700 dark:text-sky-200 hover:bg-slate-100 dark:hover:bg-sky-900/40 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer disabled:opacity-60"
            >
              {isListedOnLeaderboard ? (
                <>
                  <Eye className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Publicly Listed</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                  <span>Hidden (Private)</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={syncingRank || !isListedOnLeaderboard}
              onClick={() => void onSyncMyRank(defaultCity)}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 hover:bg-sky-700 dark:hover:bg-sky-400 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer disabled:opacity-50"
            >
              {syncNotice ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>{syncNotice}</span>
                </>
              ) : (
                <>
                  <RefreshCw className={`w-3.5 h-3.5 ${syncingRank ? 'animate-spin' : ''}`} />
                  <span>{canSyncCloud ? 'Sync My Rank' : 'Refresh Standing'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Scope, City Selector & Search Toolbar */}
        <div className="pt-3 border-t border-slate-200 dark:border-sky-900/50 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex p-1 rounded-lg bg-slate-100 dark:bg-[#061526]">
              <button
                type="button"
                onClick={() => setScope('city')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  scope === 'city'
                    ? 'bg-white dark:bg-sky-500 text-slate-900 dark:text-sky-950 font-semibold shadow-sm'
                    : 'text-slate-600 dark:text-sky-200/75 hover:text-slate-900 dark:hover:text-sky-50'
                }`}
              >
                City Rankings
              </button>
              <button
                type="button"
                onClick={() => setScope('all')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  scope === 'all'
                    ? 'bg-white dark:bg-sky-500 text-slate-900 dark:text-sky-950 font-semibold shadow-sm'
                    : 'text-slate-600 dark:text-sky-200/75 hover:text-slate-900 dark:hover:text-sky-50'
                }`}
              >
                All Cities
              </button>
            </div>

            {scope === 'city' && (
              <div className="inline-flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                <select
                  aria-label="Select city leaderboard"
                  value={selectedCity}
                  onChange={(e) => setSelectedCity(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-sky-800 bg-white dark:bg-[#061526] text-slate-900 dark:text-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
                >
                  {availableCities.map((city) => (
                    <option key={city} value={city}>
                      {city}
                      {city.toLowerCase() === defaultCity.toLowerCase() ? ' (Your City)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="relative w-full md:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search recycler, city, or tier..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-sky-800 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
        </div>
      </section>

      {/* 4-Column Competitive KPI Strip */}
      <section className="rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] grid grid-cols-2 xl:grid-cols-4 divide-y xl:divide-y-0 sm:divide-x divide-slate-200 dark:divide-sky-900/60">
        <div className="p-4">
          <p className="text-[11px] text-slate-500 dark:text-sky-200/70">
            Your {scope === 'city' ? selectedCity : 'Network'} Rank
          </p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50 mt-1">
            {snapshot.currentUserEntry ? `#${snapshot.currentUserEntry.rank}` : '—'}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-sky-200/65 mt-0.5">
            {snapshot.currentUserEntry
              ? `of ${snapshot.entries.length} recyclers`
              : isListedOnLeaderboard
                ? `Listed under ${defaultCity}`
                : 'Currently hidden from rankings'}
          </p>
        </div>

        <div className="p-4">
          <p className="text-[11px] text-slate-500 dark:text-sky-200/70">Your Verified Weight &amp; Tier</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-sky-700 dark:text-sky-400 mt-1">
            {ecoExperience.verifiedRecycledKg.toFixed(1)} kg
          </p>
          <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5 font-medium">
            Lvl {ecoExperience.currentTier.level} · {ecoExperience.currentTier.title}
          </p>
        </div>

        <div className="p-4">
          <p className="text-[11px] text-slate-500 dark:text-sky-200/70">Gap to Overtake Next Rank</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50 mt-1">
            {snapshot.currentUserEntry?.rank === 1
              ? 'Leader'
              : snapshot.nextRankEntry
                ? `+${snapshot.kgToOvertakeNext} kg`
                : '—'}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-sky-200/65 mt-0.5 truncate">
            {snapshot.currentUserEntry?.rank === 1
              ? `Holding #1 in ${snapshot.scopeLabel}`
              : snapshot.nextRankEntry
                ? `to pass #${snapshot.nextRankEntry.rank} ${snapshot.nextRankEntry.displayName}`
                : 'Switch to your city to track gap'}
          </p>
        </div>

        <div className="p-4">
          <p className="text-[11px] text-slate-500 dark:text-sky-200/70">
            {snapshot.scopeLabel} Total Diverted
          </p>
          <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-1">
            {snapshot.cityTotalKg.toLocaleString()} kg
          </p>
          <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-sky-200/65 mt-0.5">
            {snapshot.cityTotalCo2Kg.toLocaleString()} kg CO₂e avoided
          </p>
        </div>
      </section>

      {/* Top 3 Podium Spotlight */}
      {snapshot.topThree.length > 0 && (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {snapshot.topThree.map((leader) => {
            const isFirst = leader.rank === 1;
            return (
              <div
                key={leader.id}
                className={`p-5 rounded-xl border bg-white dark:bg-[#0B223B] space-y-3 ${
                  leader.isCurrentUser
                    ? 'border-sky-500 dark:border-sky-400'
                    : isFirst
                      ? 'border-amber-300 dark:border-amber-700/80'
                      : 'border-slate-200 dark:border-sky-900/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-sky-100">
                    {getRankIcon(leader.rank)}
                    <span className="font-mono tabular-nums">Rank #{leader.rank}</span>
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-sky-300/70">
                    {leader.city}
                  </span>
                </div>

                <div>
                  <h4 className="text-base font-bold text-slate-900 dark:text-sky-50 truncate">
                    {leader.displayName}
                    {leader.isCurrentUser && (
                      <span className="ml-1.5 text-xs font-semibold text-sky-600 dark:text-sky-400">
                        (You)
                      </span>
                    )}
                  </h4>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium mt-0.5">
                    Lvl {leader.ecoLevel} · {leader.levelTitle}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-sky-900/50 flex items-baseline justify-between gap-2">
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-sky-200/65">Recycled Mass</p>
                    <p className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50">
                      {leader.verifiedRecycledKg.toFixed(1)} kg
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-slate-500 dark:text-sky-200/65">CO₂e Avoided</p>
                    <p className="text-sm font-semibold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                      {leader.co2AvoidedKg.toFixed(1)} kg
                    </p>
                  </div>
                </div>

                <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-sky-300/70 flex items-center justify-between">
                  <span>{leader.pickupsCount} verified pickups</span>
                  <span>{leader.xp.toLocaleString()} Eco XP</span>
                </p>
              </div>
            );
          })}
        </section>
      )}

      {/* Main Split: Ranked Table + Eco Level Tier Ladder */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Full Ranked Community Table */}
        <section className="xl:col-span-8 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-sky-900/60 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50">
                {snapshot.scopeLabel} Rankings
              </h4>
              <p className="text-xs text-slate-500 dark:text-sky-200/70">
                Live synced members rank alongside regional city benchmarks by verified kg diverted.
              </p>
            </div>
            <button
              type="button"
              onClick={onSchedulePickup}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 hover:bg-sky-700 dark:hover:bg-sky-400 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              <CalendarClock className="w-3.5 h-3.5" />
              <span>Schedule Pickup</span>
            </button>
          </div>

          {snapshot.entries.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <Trophy className="w-6 h-6 text-slate-400 mx-auto" />
              <p className="text-xs font-medium text-slate-700 dark:text-sky-100">
                No recyclers match your search filter.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-[#061526] text-slate-500 dark:text-sky-200/70 border-b border-slate-200 dark:border-sky-900/50">
                  <tr>
                    <th className="px-4 py-2.5 font-medium w-16">Rank</th>
                    <th className="px-4 py-2.5 font-medium">Recycler</th>
                    <th className="px-4 py-2.5 font-medium">Eco Experience Level</th>
                    <th className="px-4 py-2.5 font-medium text-right">Pickups</th>
                    <th className="px-4 py-2.5 font-medium text-right">Recycled Mass</th>
                    <th className="px-4 py-2.5 font-medium text-right">CO₂e</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-sky-900/50">
                  {snapshot.entries.map((entry) => {
                    const barPct = Math.max(4, Math.round((entry.verifiedRecycledKg / maxRowKg) * 100));
                    return (
                      <tr
                        key={entry.id}
                        className={
                          entry.isCurrentUser
                            ? 'bg-sky-50/85 dark:bg-sky-950/50 text-slate-900 dark:text-sky-50 font-medium'
                            : 'text-slate-700 dark:text-sky-100/90 hover:bg-slate-50/70 dark:hover:bg-sky-950/30 transition-colors'
                        }
                      >
                        <td className="px-4 py-3 font-mono tabular-nums font-semibold whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            {getRankIcon(entry.rank)}
                            <span>#{entry.rank}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900 dark:text-sky-50">
                            {entry.displayName}
                            {entry.isCurrentUser && (
                              <span className="ml-1.5 text-[11px] font-semibold text-sky-700 dark:text-sky-400">
                                · You
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-sky-300/65">
                            {entry.city} ·{' '}
                            {entry.source === 'live' ? 'Verified Member' : 'City Benchmark'}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-slate-900 dark:text-sky-50">
                            <span className="font-mono tabular-nums text-[11px] text-sky-700 dark:text-sky-400 mr-1.5">
                              Lvl {entry.ecoLevel}
                            </span>
                            {entry.levelTitle}
                          </div>
                          <div className="mt-1 h-1.5 w-28 rounded-full bg-slate-100 dark:bg-[#061526] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-500"
                              style={{ width: `${barPct}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums text-right">
                          {entry.pickupsCount}
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums font-semibold text-right text-slate-900 dark:text-sky-50 whitespace-nowrap">
                          {entry.verifiedRecycledKg.toFixed(1)} kg
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums text-right text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                          {entry.co2AvoidedKg.toFixed(1)} kg
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Right: Eco Experience Level Progression Ladder */}
        <aside className="xl:col-span-4 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] p-5 space-y-4">
          <div className="space-y-1 pb-3 border-b border-slate-200 dark:border-sky-900/50">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50 flex items-center gap-2">
              <Award className="w-4 h-4 text-emerald-500" />
              <span>Eco Experience Level Ladder</span>
            </h4>
            <p className="text-xs text-slate-500 dark:text-sky-200/70">
              Every verified kilogram earns 10 Eco XP and advances your city leaderboard tier.
            </p>
          </div>

          <div className="space-y-2.5">
            {ECO_LEVEL_TIERS.map((tier) => {
              const reached = ecoExperience.verifiedRecycledKg >= tier.minKg;
              const isCurrent = ecoExperience.currentTier.level === tier.level;
              return (
                <div
                  key={tier.level}
                  className={`p-3 rounded-lg border transition-colors ${
                    isCurrent
                      ? 'border-sky-500 dark:border-sky-400 bg-sky-50/75 dark:bg-sky-950/45'
                      : 'border-slate-200 dark:border-sky-900/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-900 dark:text-sky-50">
                      <span className="font-mono tabular-nums text-sky-700 dark:text-sky-400 mr-1.5">
                        Lvl {tier.level}
                      </span>
                      {tier.title}
                    </span>
                    <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-sky-300/75">
                      {tier.minKg}+ kg
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-sky-200/70 mt-1">
                    {tier.tagline}
                  </p>
                  {isCurrent && ecoExperience.nextTier && (
                    <div className="mt-2 space-y-1">
                      <div className="h-1.5 rounded-full bg-slate-200 dark:bg-[#061526] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-500"
                          style={{ width: `${Math.max(4, ecoExperience.levelProgressPct)}%` }}
                        />
                      </div>
                      <p className="text-[10px] font-mono tabular-nums text-sky-700 dark:text-sky-400">
                        Current Tier · {ecoExperience.kgToNextLevel} kg to Lvl {ecoExperience.nextTier.level}
                      </p>
                    </div>
                  )}
                  {!isCurrent && reached && (
                    <p className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400 mt-1">
                      Unlocked
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
};
