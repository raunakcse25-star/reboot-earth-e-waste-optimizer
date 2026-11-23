import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  BellRing,
  CheckCircle2,
  Leaf,
  PackageCheck,
  Plus,
  Save,
  Sparkles,
  Target,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  deleteMonthlyRecyclingTarget,
  saveMonthlyRecyclingTarget,
  subscribeUserRecyclingTargets,
} from '../lib/firebase';
import type { MonthlyRecyclingTarget, PickupRequest } from '../types';

interface MonthlyTargetsPanelProps {
  pickups: PickupRequest[];
  compact?: boolean;
  onOpenFullTab?: () => void;
}

const CO2_PER_KG = 1.85;

function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthTitle(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) return monthKey;
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

function clampPct(actual: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((actual / target) * 100));
}

export const MonthlyTargetsPanel: React.FC<MonthlyTargetsPanelProps> = ({
  pickups,
  compact = false,
  onOpenFullTab,
}) => {
  const { firebaseUser, dbUser, pushNotification } = useAuth();
  const uid = firebaseUser?.uid || dbUser?.uid || '';
  const canPersistFirestore = Boolean(firebaseUser && firebaseUser.emailVerified);

  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonthKey);
  const [targets, setTargets] = useState<MonthlyRecyclingTarget[]>([]);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [celebrationBanner, setCelebrationBanner] = useState<string | null>(null);

  // Editable target form state
  const [targetWeightKg, setTargetWeightKg] = useState<number>(50);
  const [targetCo2Kg, setTargetCo2Kg] = useState<number>(95);
  const [targetPickups, setTargetPickups] = useState<number>(3);
  const [loggedBonusWeightKg, setLoggedBonusWeightKg] = useState<number>(0);
  const [quickAddKg, setQuickAddKg] = useState<string>('5');
  const [notes, setNotes] = useState<string>('');

  const notifiedSessionRef = useRef<Set<string>>(new Set());

  // Subscribe to user's Firestore monthly targets
  useEffect(() => {
    if (!canPersistFirestore || !firebaseUser) return;
    let unsub: (() => void) | undefined;
    try {
      unsub = subscribeUserRecyclingTargets(firebaseUser.uid, (items) => {
        setTargets(items);
      });
    } catch (err) {
      console.error('Failed to subscribe monthly targets:', err);
    }
    return () => unsub?.();
  }, [canPersistFirestore, firebaseUser]);

  const activeTarget = useMemo(
    () => targets.find((t) => t.monthKey === selectedMonth) || null,
    [targets, selectedMonth]
  );

  // Sync form fields when switching month or when Firestore updates
  useEffect(() => {
    if (activeTarget) {
      setTargetWeightKg(activeTarget.targetWeightKg);
      setTargetCo2Kg(activeTarget.targetCo2Kg);
      setTargetPickups(activeTarget.targetPickups);
      setLoggedBonusWeightKg(activeTarget.loggedBonusWeightKg);
      setNotes(activeTarget.notes || '');
    } else {
      setTargetWeightKg(50);
      setTargetCo2Kg(95);
      setTargetPickups(3);
      setLoggedBonusWeightKg(0);
      setNotes('');
    }
  }, [activeTarget, selectedMonth]);

  // Compute live user recycling progress for the selected month
  const progress = useMemo(() => {
    const monthlyPickups = pickups.filter((p) => {
      if (p.status === 'Cancelled') return false;
      const dateStr = (p.preferredDate || p.createdAt || '').slice(0, 7);
      return dateStr === selectedMonth;
    });

    const pickupWeightKg = monthlyPickups.reduce(
      (sum, p) => sum + (Number(p.estimatedWeightKg) || 0),
      0
    );
    const totalWeightKg = Number((pickupWeightKg + (activeTarget?.loggedBonusWeightKg ?? loggedBonusWeightKg)).toFixed(1));
    const totalCo2Kg = Number((totalWeightKg * CO2_PER_KG).toFixed(1));
    const pickupCount =
      monthlyPickups.length + ((activeTarget?.loggedBonusWeightKg ?? loggedBonusWeightKg) > 0 ? 1 : 0);

    const effWeightTarget = activeTarget?.targetWeightKg ?? targetWeightKg;
    const effCo2Target = activeTarget?.targetCo2Kg ?? targetCo2Kg;
    const effPickupsTarget = activeTarget?.targetPickups ?? targetPickups;

    return {
      totalWeightKg,
      totalCo2Kg,
      pickupCount,
      weightPct: clampPct(totalWeightKg, effWeightTarget),
      co2Pct: clampPct(totalCo2Kg, effCo2Target),
      pickupsPct: clampPct(pickupCount, effPickupsTarget),
      effWeightTarget,
      effCo2Target,
      effPickupsTarget,
    };
  }, [
    pickups,
    selectedMonth,
    activeTarget,
    loggedBonusWeightKg,
    targetWeightKg,
    targetCo2Kg,
    targetPickups,
  ]);

  const checkAndTriggerMilestoneNotifications = async (
    targetRecord: MonthlyRecyclingTarget,
    actualWeight: number,
    actualCo2: number,
    actualPickups: number
  ) => {
    const already = new Set(targetRecord.notifiedMilestones || []);
    const newlyReached: { id: string; title: string; message: string }[] = [];

    const weightPct = clampPct(actualWeight, targetRecord.targetWeightKg);
    const co2Pct = clampPct(actualCo2, targetRecord.targetCo2Kg);
    const pickupsPct = clampPct(actualPickups, targetRecord.targetPickups);
    const monthTitle = formatMonthTitle(targetRecord.monthKey);

    const checks = [
      {
        id: 'weight_50',
        reached: weightPct >= 50 && weightPct < 100,
        title: `Halfway to ${monthTitle} Recycling Goal`,
        message: `You have recycled ${actualWeight.toFixed(1)} kg of your ${targetRecord.targetWeightKg} kg e-waste target (${weightPct}%).`,
      },
      {
        id: 'weight_75',
        reached: weightPct >= 75 && weightPct < 100,
        title: `75% Milestone Reached (${monthTitle})`,
        message: `Strong momentum! ${actualWeight.toFixed(1)} kg recycled toward your ${targetRecord.targetWeightKg} kg monthly goal.`,
      },
      {
        id: 'weight_100',
        reached: weightPct >= 100,
        title: `Monthly E-Waste Target Achieved!`,
        message: `Congratulations! You reached ${actualWeight.toFixed(1)} kg / ${targetRecord.targetWeightKg} kg for ${monthTitle}.`,
      },
      {
        id: 'co2_100',
        reached: co2Pct >= 100,
        title: `CO₂ Savings Target Achieved (${monthTitle})`,
        message: `Your recycling avoided ${actualCo2.toFixed(1)} kg CO₂e, meeting your ${targetRecord.targetCo2Kg} kg climate target.`,
      },
      {
        id: 'pickups_100',
        reached: pickupsPct >= 100,
        title: `Monthly Collection Frequency Goal Met!`,
        message: `You completed ${actualPickups} / ${targetRecord.targetPickups} scheduled recycling drops for ${monthTitle}.`,
      },
    ];

    for (const item of checks) {
      const sessionKey = `${targetRecord.monthKey}:${item.id}`;
      if (item.reached && !already.has(item.id) && !notifiedSessionRef.current.has(sessionKey)) {
        notifiedSessionRef.current.add(sessionKey);
        newlyReached.push(item);
      }
    }

    if (newlyReached.length === 0) return;

    const mergedMilestones = Array.from(new Set([...already, ...newlyReached.map((m) => m.id)])).slice(0, 12);

    for (const m of newlyReached) {
      await pushNotification({
        title: m.title,
        message: m.message,
        category: 'goal',
      }).catch(() => {});
    }

    const headline = newlyReached[newlyReached.length - 1];
    setCelebrationBanner(`${headline.title} — ${headline.message}`);

    if (canPersistFirestore && firebaseUser) {
      await saveMonthlyRecyclingTarget(firebaseUser.uid, {
        monthKey: targetRecord.monthKey,
        targetWeightKg: targetRecord.targetWeightKg,
        targetCo2Kg: targetRecord.targetCo2Kg,
        targetPickups: targetRecord.targetPickups,
        loggedBonusWeightKg: targetRecord.loggedBonusWeightKg,
        notifiedMilestones: mergedMilestones,
        notes: targetRecord.notes,
      }).catch(() => {});
    } else {
      setTargets((prev) =>
        prev.map((t) =>
          t.monthKey === targetRecord.monthKey ? { ...t, notifiedMilestones: mergedMilestones } : t
        )
      );
    }
  };

  // Automatically check milestones whenever activeTarget or monthly pickup totals advance
  useEffect(() => {
    if (!activeTarget) return;
    void checkAndTriggerMilestoneNotifications(
      activeTarget,
      progress.totalWeightKg,
      progress.totalCo2Kg,
      progress.pickupCount
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTarget?.id, activeTarget?.targetWeightKg, activeTarget?.targetCo2Kg, activeTarget?.targetPickups, progress.totalWeightKg, progress.pickupCount]);

  const persistTarget = async (overrideBonus?: number) => {
    setSaving(true);
    setStatusMsg(null);
    const bonusVal = overrideBonus !== undefined ? overrideBonus : loggedBonusWeightKg;
    const cleanWeight = Math.max(1, Math.min(50000, Number(targetWeightKg) || 50));
    const cleanCo2 = Math.max(1, Math.min(100000, Number(targetCo2Kg) || 95));
    const cleanPickups = Math.max(1, Math.min(500, Math.round(Number(targetPickups) || 3)));
    const existingMilestones = activeTarget?.notifiedMilestones || [];

    const nextRecord: MonthlyRecyclingTarget = {
      id: activeTarget?.id || `tgt_${uid || 'local'}_${selectedMonth.replace('-', '_')}`,
      userId: uid || 'local',
      monthKey: selectedMonth,
      targetWeightKg: cleanWeight,
      targetCo2Kg: cleanCo2,
      targetPickups: cleanPickups,
      loggedBonusWeightKg: bonusVal,
      notifiedMilestones: existingMilestones,
      notes: notes.trim().slice(0, 300),
    };

    try {
      if (canPersistFirestore && firebaseUser) {
        await saveMonthlyRecyclingTarget(firebaseUser.uid, {
          monthKey: selectedMonth,
          targetWeightKg: cleanWeight,
          targetCo2Kg: cleanCo2,
          targetPickups: cleanPickups,
          loggedBonusWeightKg: bonusVal,
          notifiedMilestones: existingMilestones,
          notes: notes.trim().slice(0, 300),
        });
      } else {
        setTargets((prev) => [
          nextRecord,
          ...prev.filter((t) => t.monthKey !== selectedMonth),
        ]);
      }

      const monthlyPickups = pickups.filter(
        (p) => p.status !== 'Cancelled' && (p.preferredDate || p.createdAt || '').slice(0, 7) === selectedMonth
      );
      const pickupWeightKg = monthlyPickups.reduce((s, p) => s + (Number(p.estimatedWeightKg) || 0), 0);
      const newTotalWeight = Number((pickupWeightKg + bonusVal).toFixed(1));
      const newTotalCo2 = Number((newTotalWeight * CO2_PER_KG).toFixed(1));
      const newTotalPickups = monthlyPickups.length + (bonusVal > 0 ? 1 : 0);

      await checkAndTriggerMilestoneNotifications(
        nextRecord,
        newTotalWeight,
        newTotalCo2,
        newTotalPickups
      );

      setStatusMsg(
        overrideBonus !== undefined
          ? `Logged drop-off progress for ${formatMonthTitle(selectedMonth)} and updated milestones.`
          : `Saved ${formatMonthTitle(selectedMonth)} recycling targets.`
      );
    } catch (err: any) {
      setStatusMsg(err?.message || 'Unable to save monthly target right now.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void persistTarget();
  };

  const handleQuickLogDropoff = () => {
    const add = Number(quickAddKg);
    if (!Number.isFinite(add) || add <= 0) return;
    const nextBonus = Number((loggedBonusWeightKg + add).toFixed(1));
    setLoggedBonusWeightKg(nextBonus);
    void persistTarget(nextBonus);
  };

  const handleDeleteTarget = async (target: MonthlyRecyclingTarget) => {
    try {
      if (canPersistFirestore && firebaseUser) {
        await deleteMonthlyRecyclingTarget(target.id);
      } else {
        setTargets((prev) => prev.filter((t) => t.id !== target.id));
      }
      setStatusMsg(`Removed target for ${formatMonthTitle(target.monthKey)}.`);
    } catch (err: any) {
      setStatusMsg(err?.message || 'Unable to delete target.');
    }
  };

  // Compact Overview Widget mode
  if (compact) {
    return (
      <div className="p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-sky-500" />
            <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50">
              {formatMonthTitle(selectedMonth)} Recycling Targets
            </h4>
          </div>
          {onOpenFullTab && (
            <button
              type="button"
              onClick={onOpenFullTab}
              className="text-xs font-medium text-sky-700 dark:text-sky-400 hover:underline cursor-pointer"
            >
              Manage Goals
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600 dark:text-sky-200/75">E-Waste Mass</span>
              <span className="font-mono font-semibold text-slate-900 dark:text-sky-50">
                {progress.totalWeightKg} / {progress.effWeightTarget} kg ({progress.weightPct}%)
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-sky-950 overflow-hidden">
              <div
                style={{ width: `${progress.weightPct}%` }}
                className="h-full rounded-full bg-sky-500 transition-all duration-300"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600 dark:text-sky-200/75">CO₂e Avoided</span>
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                {progress.totalCo2Kg} / {progress.effCo2Target} kg ({progress.co2Pct}%)
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-sky-950 overflow-hidden">
              <div
                style={{ width: `${progress.co2Pct}%` }}
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600 dark:text-sky-200/75">Collections</span>
              <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">
                {progress.pickupCount} / {progress.effPickupsTarget} ({progress.pickupsPct}%)
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-sky-950 overflow-hidden">
              <div
                style={{ width: `${progress.pickupsPct}%` }}
                className="h-full rounded-full bg-amber-500 transition-all duration-300"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Live Celebration Banner when a milestone triggers */}
      {celebrationBanner && (
        <div className="p-4 rounded-xl border border-emerald-400/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Award className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                Goal Milestone Notification Sent
              </p>
              <p className="text-sm font-medium">{celebrationBanner}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCelebrationBanner(null)}
            className="text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top Live Goal Progress Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            label: 'Monthly E-Waste Target',
            icon: Target,
            actual: `${progress.totalWeightKg} kg`,
            goal: `${progress.effWeightTarget} kg`,
            pct: progress.weightPct,
            barClass: 'bg-sky-500',
            textClass: 'text-sky-700 dark:text-sky-400',
          },
          {
            label: 'CO₂e Savings Target',
            icon: Leaf,
            actual: `${progress.totalCo2Kg} kg`,
            goal: `${progress.effCo2Target} kg`,
            pct: progress.co2Pct,
            barClass: 'bg-emerald-500',
            textClass: 'text-emerald-600 dark:text-emerald-400',
          },
          {
            label: 'Pickups & Drop-offs Target',
            icon: PackageCheck,
            actual: `${progress.pickupCount}`,
            goal: `${progress.effPickupsTarget}`,
            pct: progress.pickupsPct,
            barClass: 'bg-amber-500',
            textClass: 'text-amber-600 dark:text-amber-400',
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600 dark:text-sky-200/75">
                  {card.label}
                </span>
                <Icon className="w-4 h-4 text-sky-500" />
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <p className={`text-2xl font-bold font-mono tabular-nums ${card.textClass}`}>
                  {card.pct}%
                </p>
                <p className="text-xs font-mono text-slate-500 dark:text-sky-200/70">
                  {card.actual} / {card.goal}
                </p>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100 dark:bg-sky-950 overflow-hidden">
                <div
                  style={{ width: `${card.pct}%` }}
                  className={`h-full rounded-full ${card.barClass} transition-all duration-300`}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 dark:text-sky-300/60">
                <span className={card.pct >= 50 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : ''}>
                  50%
                </span>
                <span className={card.pct >= 75 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : ''}>
                  75%
                </span>
                <span className={card.pct >= 100 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : ''}>
                  100% Goal
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Target Configuration + Quick Drop-Off Progress Logger */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleSaveSubmit}
          className="lg:col-span-7 p-6 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-sky-50">
                Configure Monthly Recycling Targets
              </h3>
              <p className="text-xs text-slate-500 dark:text-sky-200/70">
                Automatic notifications trigger at 50%, 75%, and 100% of your goals.
              </p>
            </div>
            <div>
              <label htmlFor="target-month-input" className="sr-only">
                Target Month
              </label>
              <input
                id="target-month-input"
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value || getCurrentMonthKey())}
                className="px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-sky-800 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-slate-600 dark:text-sky-200/75 mb-1">
                E-Waste Target (kg)
              </label>
              <input
                type="number"
                min={1}
                max={50000}
                step="1"
                value={targetWeightKg}
                onChange={(e) => {
                  const val = Math.max(1, Number(e.target.value) || 1);
                  setTargetWeightKg(val);
                  setTargetCo2Kg(Math.round(val * CO2_PER_KG));
                }}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-600 dark:text-sky-200/75 mb-1">
                CO₂e Avoided Target (kg)
              </label>
              <input
                type="number"
                min={1}
                max={100000}
                step="1"
                value={targetCo2Kg}
                onChange={(e) => setTargetCo2Kg(Math.max(1, Number(e.target.value) || 1))}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-600 dark:text-sky-200/75 mb-1">
                Pickups Target (count)
              </label>
              <input
                type="number"
                min={1}
                max={500}
                step="1"
                value={targetPickups}
                onChange={(e) => setTargetPickups(Math.max(1, Math.round(Number(e.target.value) || 1)))}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-600 dark:text-sky-200/75 mb-1">
              Monthly Sustainability Focus Note (Optional)
            </label>
            <input
              type="text"
              maxLength={300}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Clear office laptops, UPS batteries, and cables before month-end audit"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
            />
          </div>

          {statusMsg && (
            <p className="text-xs font-medium text-sky-700 dark:text-sky-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              {statusMsg}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 hover:bg-sky-700 dark:hover:bg-sky-400 inline-flex items-center gap-2 disabled:opacity-60 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : `Save ${formatMonthTitle(selectedMonth)} Target`}
            </button>
          </div>
        </form>

        {/* Log Drop-off Progress & Notification Triggers */}
        <div className="lg:col-span-5 p-6 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <BellRing className="w-4 h-4 text-sky-500" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-sky-50">
                Log Centre Drop-Off &amp; Milestones
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-sky-200/70">
              Scheduled pickups count automatically. Dropped off electronics directly at a collection centre? Log weight here to update your progress and trigger milestone alerts.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#061526] border border-slate-200/80 dark:border-sky-900/50 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600 dark:text-sky-200/75">Self-Logged Drop-offs ({formatMonthTitle(selectedMonth)})</span>
              <span className="font-mono font-semibold text-sky-700 dark:text-sky-400">
                {loggedBonusWeightKg.toFixed(1)} kg
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                min={0.5}
                max={5000}
                step="0.5"
                value={quickAddKg}
                onChange={(e) => setQuickAddKg(e.target.value)}
                className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-sky-800 bg-white dark:bg-[#0B223B] text-slate-900 dark:text-sky-50"
                placeholder="kg dropped off"
              />
              <button
                type="button"
                disabled={saving}
                onClick={handleQuickLogDropoff}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Weight
              </button>
            </div>
          </div>

          {/* Active Milestone Badges */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700 dark:text-sky-100">
              Notified Milestones for {formatMonthTitle(selectedMonth)}
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'weight_50', label: '50% Mass' },
                { id: 'weight_75', label: '75% Mass' },
                { id: 'weight_100', label: '100% Mass Goal' },
                { id: 'co2_100', label: 'CO₂ Goal' },
                { id: 'pickups_100', label: 'Pickups Goal' },
              ].map((m) => {
                const earned = (activeTarget?.notifiedMilestones || []).includes(m.id);
                return (
                  <span
                    key={m.id}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium inline-flex items-center gap-1 border ${
                      earned
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                        : 'bg-slate-50 dark:bg-[#061526] border-slate-200 dark:border-sky-900/60 text-slate-400 dark:text-sky-300/50'
                    }`}
                  >
                    <Sparkles className="w-3 h-3" />
                    {m.label}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Saved Monthly Targets History */}
      {targets.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] overflow-x-auto">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-sky-900/60">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50">
              Saved Monthly Recycling Targets
            </h4>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-[#061526] text-slate-500 dark:text-sky-200/70">
              <tr>
                <th className="px-4 py-2.5 font-medium">Month</th>
                <th className="px-4 py-2.5 font-medium">E-Waste Goal</th>
                <th className="px-4 py-2.5 font-medium">CO₂e Goal</th>
                <th className="px-4 py-2.5 font-medium">Pickups Goal</th>
                <th className="px-4 py-2.5 font-medium">Milestones Hit</th>
                <th className="px-4 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-sky-900/50">
              {targets.map((t) => (
                <tr key={t.id} className="text-slate-700 dark:text-sky-100/90">
                  <td className="px-4 py-2.5 font-mono font-semibold text-sky-700 dark:text-sky-400">
                    {formatMonthTitle(t.monthKey)}
                  </td>
                  <td className="px-4 py-2.5 font-mono">{t.targetWeightKg} kg</td>
                  <td className="px-4 py-2.5 font-mono">{t.targetCo2Kg} kg</td>
                  <td className="px-4 py-2.5 font-mono">{t.targetPickups}</td>
                  <td className="px-4 py-2.5 font-mono">{t.notifiedMilestones?.length || 0} / 5</td>
                  <td className="px-4 py-2.5 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => setSelectedMonth(t.monthKey)}
                      className="text-sky-700 dark:text-sky-400 hover:underline font-medium cursor-pointer"
                    >
                      Select
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteTarget(t)}
                      aria-label={`Delete ${t.monthKey} target`}
                      className="text-red-500 hover:text-red-600 inline-flex items-center cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
