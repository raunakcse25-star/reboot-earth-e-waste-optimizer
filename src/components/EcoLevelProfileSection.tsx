import React, { useMemo, useState } from 'react';
import {
  Award,
  BatteryCharging,
  CheckCircle2,
  Cpu,
  Crown,
  Flag,
  Layers,
  Lock,
  Scale,
  ShieldCheck,
  Sparkles,
  Trophy,
} from 'lucide-react';
import type { PickupRequest } from '../types';
import {
  computeEcoExperience,
  ECO_LEVEL_TIERS,
  type EcoBadge,
  type EcoBadgeIconKey,
} from '../lib/ecoLevelSystem';

function BadgeIcon({ iconKey, className }: { iconKey: EcoBadgeIconKey; className?: string }) {
  switch (iconKey) {
    case 'sparkles':
      return <Sparkles className={className} />;
    case 'scale':
      return <Scale className={className} />;
    case 'shield':
      return <ShieldCheck className={className} />;
    case 'trophy':
      return <Trophy className={className} />;
    case 'crown':
      return <Crown className={className} />;
    case 'battery':
      return <BatteryCharging className={className} />;
    case 'layers':
      return <Layers className={className} />;
    case 'cpu':
      return <Cpu className={className} />;
    default:
      return <Award className={className} />;
  }
}

function getTierStyles(tier: EcoBadge['tier'], unlocked: boolean): string {
  if (!unlocked) {
    return 'bg-slate-100 dark:bg-[#061526] text-slate-400 dark:text-sky-300/40 border-slate-200 dark:border-sky-900/60';
  }
  switch (tier) {
    case 'gold':
      return 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700/70';
    case 'emerald':
      return 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700/70';
    case 'silver':
      return 'bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-700/70';
    default:
      return 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 border-cyan-300 dark:border-cyan-700/70';
  }
}

interface EcoLevelProfileSectionProps {
  pickups: PickupRequest[];
  onSchedulePickup?: () => void;
}

export const EcoLevelProfileSection: React.FC<EcoLevelProfileSectionProps> = ({
  pickups,
  onSchedulePickup,
}) => {
  const [includePipeline, setIncludePipeline] = useState(false);
  const [badgeFilter, setBadgeFilter] = useState<'all' | 'unlocked' | 'locked'>('all');

  const summary = useMemo(
    () => computeEcoExperience(pickups, includePipeline),
    [pickups, includePipeline]
  );

  const visibleBadges = useMemo(() => {
    if (badgeFilter === 'unlocked') return summary.badges.filter((b) => b.unlocked);
    if (badgeFilter === 'locked') return summary.badges.filter((b) => !b.unlocked);
    return summary.badges;
  }, [summary.badges, badgeFilter]);

  return (
    <section
      aria-label="User Recycling Experience Level, Badges, and Milestones"
      className="space-y-6"
    >
      {/* Experience Level Hero Card */}
      <div className="rounded-2xl border border-sky-200/90 dark:border-sky-800/70 bg-white dark:bg-[#0B223B] overflow-hidden">
        <div className="p-6 bg-gradient-to-r from-sky-50 via-emerald-50/50 to-transparent dark:from-sky-950/60 dark:via-emerald-950/25 dark:to-transparent border-b border-slate-200/80 dark:border-sky-900/60 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-start sm:items-center gap-4">
            <div
              className={`w-16 h-16 rounded-2xl border-2 flex flex-col items-center justify-center shrink-0 ${summary.currentTier.badgeBgClass}`}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-sky-200/75 leading-none">
                LVL
              </span>
              <span
                className={`text-2xl font-extrabold font-mono leading-tight ${summary.currentTier.accentClass}`}
              >
                {summary.currentTier.level}
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900 dark:text-sky-50">
                  {summary.currentTier.title}
                </h3>
                <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800">
                  {summary.xp.toLocaleString()} Eco XP
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-sky-200/75 max-w-xl">
                {summary.currentTier.tagline}
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5 text-xs text-slate-600 dark:text-sky-200/80">
                <span>
                  Recycled Weight:{' '}
                  <strong className="font-mono text-slate-900 dark:text-sky-50">
                    {summary.totalRecycledKg.toLocaleString()} kg
                  </strong>
                </span>
                <span>
                  Badges:{' '}
                  <strong className="font-mono text-slate-900 dark:text-sky-50">
                    {summary.unlockedBadgesCount}/{summary.badges.length}
                  </strong>
                </span>
                <span>
                  Milestones:{' '}
                  <strong className="font-mono text-slate-900 dark:text-sky-50">
                    {summary.unlockedMilestonesCount}/{summary.milestones.length}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          {/* Scope Toggle & CTA */}
          <div className="flex flex-wrap items-center gap-2 self-start lg:self-center">
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-sky-900/70 p-0.5 bg-white dark:bg-[#061526] text-[11px]">
              <button
                type="button"
                onClick={() => setIncludePipeline(false)}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  !includePipeline
                    ? 'bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950'
                    : 'text-slate-600 dark:text-sky-200/75 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Verified ({summary.verifiedRecycledKg} kg)
              </button>
              <button
                type="button"
                onClick={() => setIncludePipeline(true)}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  includePipeline
                    ? 'bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950'
                    : 'text-slate-600 dark:text-sky-200/75 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Incl. Scheduled (+{summary.pipelineKg} kg)
              </button>
            </div>

            {onSchedulePickup && (
              <button
                type="button"
                onClick={onSchedulePickup}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 hover:bg-sky-700 dark:hover:bg-sky-400 text-white dark:text-sky-950 transition-colors cursor-pointer"
              >
                + Recycle More
              </button>
            )}
          </div>
        </div>

        {/* Next Level Progress Bar + Tier Ladder */}
        <div className="p-5 space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-800 dark:text-sky-100">
                {summary.nextTier
                  ? `Progress to Level ${summary.nextTier.level}: ${summary.nextTier.title}`
                  : 'Maximum Experience Level Reached!'}
              </span>
              <span className="font-mono tabular-nums text-sky-700 dark:text-sky-300 font-semibold">
                {summary.nextTier
                  ? `${summary.kgToNextLevel} kg to go (${summary.levelProgressPct}%)`
                  : '100% · Legend Tier'}
              </span>
            </div>
            <div className="h-3 rounded-full bg-slate-100 dark:bg-[#061526] border border-slate-200/80 dark:border-sky-900/70 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 via-cyan-400 to-emerald-500 transition-all duration-500"
                style={{ width: `${Math.max(3, summary.levelProgressPct)}%` }}
              />
            </div>
          </div>

          {/* 7-Tier Compact Level Ladder */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 pt-1">
            {ECO_LEVEL_TIERS.map((tier) => {
              const reached = summary.totalRecycledKg >= tier.minKg;
              const isCurrent = tier.level === summary.currentTier.level;
              return (
                <div
                  key={tier.level}
                  className={`p-2 rounded-lg border text-center transition-colors ${
                    isCurrent
                      ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/40 ring-1 ring-sky-500/40'
                      : reached
                        ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20'
                        : 'border-slate-200/80 dark:border-sky-900/50 bg-slate-50/60 dark:bg-[#061526] opacity-70'
                  }`}
                >
                  <p className="text-[10px] font-mono font-bold text-slate-500 dark:text-sky-300/75">
                    LVL {tier.level}
                  </p>
                  <p className="text-[11px] font-semibold text-slate-900 dark:text-sky-50 truncate mt-0.5">
                    {tier.title}
                  </p>
                  <p className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 mt-0.5">
                    {tier.minKg}+ kg
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Badges & Milestones Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Badges Showcase */}
        <div className="lg:col-span-7 p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50 inline-flex items-center gap-2">
                <Award className="w-4 h-4 text-sky-500" />
                Achievement Badges
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-sky-200/70 mt-0.5">
                {summary.unlockedBadgesCount} of {summary.badges.length} badges unlocked from your recycled e-waste weight &amp; categories.
              </p>
            </div>
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-sky-900/70 p-0.5 bg-slate-50 dark:bg-[#061526] text-[11px]">
              {(
                [
                  { id: 'all', label: `All (${summary.badges.length})` },
                  { id: 'unlocked', label: `Unlocked (${summary.unlockedBadgesCount})` },
                  {
                    id: 'locked',
                    label: `Locked (${summary.badges.length - summary.unlockedBadgesCount})`,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setBadgeFilter(tab.id)}
                  className={`px-2 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    badgeFilter === tab.id
                      ? 'bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950'
                      : 'text-slate-600 dark:text-sky-200/75 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {visibleBadges.length === 0 ? (
            <div className="py-8 px-4 rounded-xl border border-dashed border-slate-300 dark:border-sky-900/70 text-center text-xs text-slate-500 dark:text-sky-200/70">
              No badges in this filter yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {visibleBadges.map((badge) => (
                <div
                  key={badge.id}
                  className={`p-3.5 rounded-xl border transition-all space-y-2.5 ${
                    badge.unlocked
                      ? 'border-emerald-200/90 dark:border-emerald-800/60 bg-emerald-50/30 dark:bg-[#061526]'
                      : 'border-slate-200/80 dark:border-sky-900/60 bg-slate-50/60 dark:bg-[#061526]/70'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${getTierStyles(
                        badge.tier,
                        badge.unlocked
                      )}`}
                    >
                      <BadgeIcon iconKey={badge.iconKey} className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1.5">
                        <p className="text-xs font-bold text-slate-900 dark:text-sky-50 truncate">
                          {badge.name}
                        </p>
                        {badge.unlocked ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        ) : (
                          <Lock className="w-3.5 h-3.5 text-slate-400 dark:text-sky-300/40 shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-sky-200/70 leading-snug mt-0.5">
                        {badge.description}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span
                        className={
                          badge.unlocked
                            ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                            : 'text-slate-500 dark:text-sky-300/65'
                        }
                      >
                        {badge.unlocked ? 'UNLOCKED' : badge.criteriaLabel}
                      </span>
                      <span className="text-slate-500 dark:text-sky-200/70">
                        {badge.currentLabel}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-200 dark:bg-sky-950 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          badge.unlocked ? 'bg-emerald-500' : 'bg-sky-500/80'
                        }`}
                        style={{ width: `${Math.max(badge.unlocked ? 100 : 4, badge.progressPct)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Weight Milestones Roadmap */}
        <div className="lg:col-span-5 p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50 inline-flex items-center gap-2">
              <Flag className="w-4 h-4 text-emerald-500" />
              Recycled Weight Milestones
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-sky-200/70 mt-0.5">
              Hit cumulative weight goals to unlock profile perks and circular impact tiers.
            </p>
          </div>

          <div className="space-y-2.5">
            {summary.milestones.map((ms) => (
              <div
                key={ms.id}
                className={`p-3 rounded-xl border space-y-2 ${
                  ms.unlocked
                    ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20'
                    : 'border-slate-200/80 dark:border-sky-900/60 bg-slate-50/60 dark:bg-[#061526]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    {ms.unlocked ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <Lock className="w-4 h-4 text-slate-400 dark:text-sky-300/45 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-sky-50">
                        {ms.title}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-sky-200/70 mt-0.5">
                        {ms.perk}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-[11px] font-mono font-bold shrink-0 px-2 py-0.5 rounded ${
                      ms.unlocked
                        ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200'
                        : 'bg-slate-200/80 dark:bg-sky-900/50 text-slate-700 dark:text-sky-200'
                    }`}
                  >
                    {ms.targetKg} kg
                  </span>
                </div>

                {!ms.unlocked && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-sky-950 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-sky-500 transition-all duration-500"
                        style={{ width: `${Math.max(3, ms.progressPct)}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 dark:text-sky-300/70 shrink-0">
                      {ms.remainingKg} kg left
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
