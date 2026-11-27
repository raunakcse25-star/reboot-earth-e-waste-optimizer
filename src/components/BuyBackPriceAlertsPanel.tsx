import React, { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  BellOff,
  BellRing,
  CalendarClock,
  Check,
  CheckCircle2,
  Cpu,
  Edit3,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  doesQuoteMeetAlert,
  formatInrPerKg,
  type BrowserPushPermissionState,
} from '../lib/buybackMarket';
import type {
  BuyBackAlertCondition,
  BuyBackCategoryId,
  BuyBackMarketQuote,
  FirestoreNotification,
  MarketPriceAlert,
} from '../types';

interface BuyBackPriceAlertsPanelProps {
  quotes: BuyBackMarketQuote[];
  alerts: MarketPriceAlert[];
  marketNotifications: FirestoreNotification[];
  pushPermission: BrowserPushPermissionState;
  autoRefreshEnabled: boolean;
  onToggleAutoRefresh: () => void;
  onRequestPushPermission: () => Promise<void>;
  onRefreshQuotes: () => void;
  onCreateAlert: (payload: {
    categoryId: BuyBackCategoryId;
    categoryName: string;
    condition: BuyBackAlertCondition;
    targetPriceInr: number;
    browserPushEnabled: boolean;
    note: string;
  }) => Promise<void>;
  onUpdateAlert: (
    alertId: string,
    patch: {
      targetPriceInr?: number;
      condition?: BuyBackAlertCondition;
      active?: boolean;
      browserPushEnabled?: boolean;
      note?: string;
    }
  ) => Promise<void>;
  onDeleteAlert: (alertId: string) => Promise<void>;
  onSimulateAlertTrigger: (alert: MarketPriceAlert) => void;
  onSchedulePickupForCategory: (quote: BuyBackMarketQuote) => void;
}

function MiniSparkline({ values, positive }: { values: number[]; positive: boolean }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const width = 92;
  const height = 28;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - 3 - ((v - min) / span) * (height - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0 overflow-visible"
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke={positive ? '#10b981' : '#f59e0b'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

export const BuyBackPriceAlertsPanel: React.FC<BuyBackPriceAlertsPanelProps> = ({
  quotes,
  alerts,
  marketNotifications,
  pushPermission,
  autoRefreshEnabled,
  onToggleAutoRefresh,
  onRequestPushPermission,
  onRefreshQuotes,
  onCreateAlert,
  onUpdateAlert,
  onDeleteAlert,
  onSimulateAlertTrigger,
  onSchedulePickupForCategory,
}) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<BuyBackCategoryId>('gold_pcb');
  const [condition, setCondition] = useState<BuyBackAlertCondition>('above');
  const [targetInput, setTargetInput] = useState<string>(() => {
    const initial = quotes.find((q) => q.id === 'gold_pcb');
    return String(initial?.defaultTargetInr ?? 3600);
  });
  const [noteInput, setNoteInput] = useState('');
  const [browserPushEnabled, setBrowserPushEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formFeedback, setFormFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );
  const [editingAlertId, setEditingAlertId] = useState<string | null>(null);
  const [editTargetValue, setEditTargetValue] = useState<string>('');
  const [busyAlertId, setBusyAlertId] = useState<string | null>(null);

  const quoteById = useMemo(() => new Map(quotes.map((q) => [q.id, q])), [quotes]);
  const selectedQuote = quoteById.get(selectedCategoryId) || quotes[0];

  const activeAlertsCount = useMemo(() => alerts.filter((a) => a.active).length, [alerts]);
  const currentlyMetAlertsCount = useMemo(
    () =>
      alerts.filter((a) => {
        const q = quoteById.get(a.categoryId);
        return q ? doesQuoteMeetAlert(q, a) : false;
      }).length,
    [alerts, quoteById]
  );

  const topGainer = useMemo(() => {
    if (quotes.length === 0) return null;
    return [...quotes].sort((a, b) => b.changePct - a.changePct)[0];
  }, [quotes]);

  const handleSelectCategoryForAlert = (quote: BuyBackMarketQuote) => {
    setSelectedCategoryId(quote.id);
    setCondition('above');
    const suggested = Math.round((quote.currentPriceInr * 1.04) / 5) * 5;
    setTargetInput(String(suggested));
    setFormFeedback(null);
  };

  const applyPresetOffset = (multiplier: number) => {
    if (!selectedQuote) return;
    const computed = Math.max(10, Math.round((selectedQuote.currentPriceInr * multiplier) / 5) * 5);
    setTargetInput(String(computed));
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQuote) return;
    const numericTarget = Number(targetInput);
    if (!Number.isFinite(numericTarget) || numericTarget < 10 || numericTarget > 100000) {
      setFormFeedback({
        type: 'err',
        text: 'Enter a valid target buy-back rate between ₹10/kg and ₹100,000/kg.',
      });
      return;
    }

    setSubmitting(true);
    setFormFeedback(null);
    try {
      await onCreateAlert({
        categoryId: selectedQuote.id,
        categoryName: selectedQuote.name,
        condition,
        targetPriceInr: numericTarget,
        browserPushEnabled,
        note: noteInput.trim(),
      });
      setNoteInput('');
      setFormFeedback({
        type: 'ok',
        text: `Alert armed for ${selectedQuote.name} (${condition === 'above' ? '≥' : '≤'} ${formatInrPerKg(numericTarget)}).`,
      });
    } catch (err: any) {
      setFormFeedback({
        type: 'err',
        text: err?.message || 'Unable to save price threshold alert.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveInlineTarget = async (alert: MarketPriceAlert) => {
    const val = Number(editTargetValue);
    if (!Number.isFinite(val) || val < 10 || val > 100000) return;
    setBusyAlertId(alert.id);
    try {
      await onUpdateAlert(alert.id, { targetPriceInr: val });
      setEditingAlertId(null);
    } finally {
      setBusyAlertId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Push Notification Engine Status Bar */}
      <div className="p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/70">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {autoRefreshEnabled ? 'Live Buy-Back Ticker Active' : 'Ticker Paused'}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-sky-100 dark:bg-sky-950/70 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800/70">
              <BellRing className="w-3 h-3" />
              In-App Push Toasts Ready
            </span>
            {pushPermission === 'granted' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                <CheckCircle2 className="w-3 h-3" />
                Browser Desktop Push Enabled
              </span>
            )}
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-sky-50">
            E-Waste Market Buy-Back Price Alerts
          </h3>
          <p className="text-xs text-slate-600 dark:text-sky-200/75 max-w-2xl">
            Monitor live recycler buy-back rates for gold-bearing circuit boards, RAM/CPUs, copper harnesses, and lithium cells. Get instant dashboard push notifications and browser alerts the moment a category hits your target price.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {pushPermission === 'default' && (
            <button
              type="button"
              onClick={() => void onRequestPushPermission()}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <BellRing className="w-3.5 h-3.5" />
              Enable Browser Push
            </button>
          )}
          {pushPermission === 'denied' && (
            <span className="px-3 py-2 rounded-lg text-[11px] font-medium bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 inline-flex items-center gap-1.5">
              <BellOff className="w-3.5 h-3.5" />
              Browser Push Blocked (In-App Active)
            </span>
          )}
          <button
            type="button"
            onClick={onToggleAutoRefresh}
            className="px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-sky-800 bg-slate-50 dark:bg-[#061526] text-slate-700 dark:text-sky-100 hover:border-sky-500 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            {autoRefreshEnabled ? (
              <>
                <Pause className="w-3.5 h-3.5 text-amber-500" />
                Pause Feed
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 text-emerald-500" />
                Resume Feed
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onRefreshQuotes}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 hover:bg-sky-700 dark:hover:bg-sky-400 text-white dark:text-sky-950 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh Spot Rates
          </button>
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B]">
          <p className="text-xs text-slate-500 dark:text-sky-200/70">Active Price Watches</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-sky-700 dark:text-sky-400 mt-1">
            {activeAlertsCount}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-sky-200/65 mt-0.5">
            {alerts.length} total threshold{alerts.length === 1 ? '' : 's'} saved
          </p>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B]">
          <p className="text-xs text-slate-500 dark:text-sky-200/70">Targets Reached Now</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-1">
            {currentlyMetAlertsCount}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-sky-200/65 mt-0.5">
            Ready to book buy-back pickup
          </p>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B]">
          <p className="text-xs text-slate-500 dark:text-sky-200/70">Top Momentum Stream</p>
          <p className="text-lg font-bold text-slate-900 dark:text-sky-50 mt-1 truncate">
            {topGainer?.shortName || 'Gold PCBs'}
          </p>
          <p className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
            {topGainer
              ? `${formatInrPerKg(topGainer.currentPriceInr)} (${topGainer.changePct >= 0 ? '+' : ''}${topGainer.changePct}%)`
              : 'Live'}
          </p>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B]">
          <p className="text-xs text-slate-500 dark:text-sky-200/70">Market Push History</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50 mt-1">
            {marketNotifications.length}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-sky-200/65 mt-0.5">
            Synced to Notification Center
          </p>
        </div>
      </div>

      {/* Main Split: Live Buy-Back Market Board + Alert Creator / Watchlist */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Live Market Buy-Back Board */}
        <div className="xl:col-span-7 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-sky-900/60 flex items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-sky-50 inline-flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                Live Recycler Buy-Back Spot Rates (INR / kg)
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-sky-200/65 mt-0.5">
                Click any category to pre-fill a target threshold push alert.
              </p>
            </div>
            <span className="text-[11px] font-mono text-slate-400 dark:text-sky-300/60">
              {quotes.length} streams
            </span>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-sky-900/50">
            {quotes.map((q) => {
              const positive = q.changePct >= 0;
              const matchingAlerts = alerts.filter((a) => a.categoryId === q.id && a.active);
              const hitAlert = matchingAlerts.find((a) => doesQuoteMeetAlert(q, a));
              const isSelected = selectedCategoryId === q.id;

              return (
                <div
                  key={q.id}
                  className={`p-4 transition-colors ${
                    isSelected
                      ? 'bg-sky-50/70 dark:bg-sky-950/35'
                      : 'hover:bg-slate-50/80 dark:hover:bg-[#081C31]'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900 dark:text-sky-50">
                          {q.name}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-100/80 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60">
                          {q.metalHighlights}
                        </span>
                        {hitAlert && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white inline-flex items-center gap-1">
                            <Zap className="w-2.5 h-2.5" />
                            TARGET HIT
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-sky-200/70 leading-snug">
                        {q.description}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-sky-300/65">
                        <span>
                          Day Range:{' '}
                          <span className="font-mono text-slate-700 dark:text-sky-200">
                            ₹{q.dayLowInr.toLocaleString('en-IN')} – ₹
                            {q.dayHighInr.toLocaleString('en-IN')}
                          </span>
                        </span>
                        <span>
                          Demand:{' '}
                          <span
                            className={`font-semibold ${
                              q.demandLevel === 'Surging'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : q.demandLevel === 'High'
                                  ? 'text-sky-600 dark:text-sky-400'
                                  : 'text-slate-600 dark:text-sky-200'
                            }`}
                          >
                            {q.demandLevel}
                          </span>
                        </span>
                        {matchingAlerts.length > 0 && (
                          <span className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-300 font-medium">
                            <Bell className="w-3 h-3" />
                            {matchingAlerts.length} alert{matchingAlerts.length === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                      <MiniSparkline values={q.history} positive={positive} />
                      <div className="text-right min-w-[92px]">
                        <p className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50">
                          {formatInrPerKg(q.currentPriceInr)}
                        </p>
                        <p
                          className={`text-[11px] font-mono font-semibold inline-flex items-center justify-end gap-0.5 ${
                            positive
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {positive ? (
                            <ArrowUpRight className="w-3 h-3" />
                          ) : (
                            <ArrowDownRight className="w-3 h-3" />
                          )}
                          {positive ? '+' : ''}
                          {q.changePct.toFixed(2)}%
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSelectCategoryForAlert(q)}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 hover:bg-sky-600 hover:text-white dark:hover:bg-sky-500 dark:hover:text-sky-950 transition-colors cursor-pointer"
                      >
                        Set Alert
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Rail: Create Threshold Alert + Active Watchlist */}
        <div className="xl:col-span-5 space-y-5">
          {/* Create Target Price Alert Form */}
          <form
            onSubmit={handleCreateSubmit}
            className="p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-slate-900 dark:text-sky-50 inline-flex items-center gap-2">
                <Target className="w-4 h-4 text-sky-500" />
                Create Target Price Push Alert
              </h4>
              {selectedQuote && (
                <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400">
                  Spot: {formatInrPerKg(selectedQuote.currentPriceInr)}
                </span>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-sky-200/80 mb-1">
                  E-Waste Buy-Back Category
                </label>
                <select
                  value={selectedCategoryId}
                  onChange={(e) => {
                    const nextId = e.target.value as BuyBackCategoryId;
                    const q = quoteById.get(nextId);
                    if (q) {
                      handleSelectCategoryForAlert(q);
                    } else {
                      setSelectedCategoryId(nextId);
                    }
                  }}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  {quotes.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.name} ({formatInrPerKg(q.currentPriceInr)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-sky-200/80 mb-1">
                    Trigger Condition
                  </label>
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value as BuyBackAlertCondition)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="above">Reaches or exceeds (≥)</option>
                    <option value="below">Drops to or below (≤)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-sky-200/80 mb-1">
                    Target Threshold (₹ / kg)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={100000}
                    step={5}
                    required
                    value={targetInput}
                    onChange={(e) => setTargetInput(e.target.value)}
                    placeholder="3600"
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              {/* Quick Offset Buttons */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-slate-500 dark:text-sky-300/65 mr-1">
                  Quick target:
                </span>
                <button
                  type="button"
                  onClick={() => applyPresetOffset(1.0)}
                  className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-sky-950/60 text-slate-700 dark:text-sky-200 hover:bg-sky-100 dark:hover:bg-sky-900/70 cursor-pointer"
                >
                  Match Spot
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetOffset(1.03)}
                  className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-sky-950/60 text-slate-700 dark:text-sky-200 hover:bg-sky-100 dark:hover:bg-sky-900/70 cursor-pointer"
                >
                  +3%
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetOffset(1.06)}
                  className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-sky-950/60 text-slate-700 dark:text-sky-200 hover:bg-sky-100 dark:hover:bg-sky-900/70 cursor-pointer"
                >
                  +6%
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetOffset(1.1)}
                  className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-sky-950/60 text-slate-700 dark:text-sky-200 hover:bg-sky-100 dark:hover:bg-sky-900/70 cursor-pointer"
                >
                  +10%
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-sky-200/80 mb-1">
                  Batch Note (optional)
                </label>
                <input
                  type="text"
                  maxLength={160}
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder="e.g. Sell 12 kg gold-finger server motherboards"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-sky-200/85 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={browserPushEnabled}
                  onChange={(e) => setBrowserPushEnabled(e.target.checked)}
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span>Also send OS/browser desktop push notification (when permitted)</span>
              </label>
            </div>

            {formFeedback && (
              <p
                className={`text-xs px-3 py-2 rounded-lg border ${
                  formFeedback.type === 'ok'
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/70 text-emerald-800 dark:text-emerald-300'
                    : 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800/70 text-red-700 dark:text-red-300'
                }`}
              >
                {formFeedback.text}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 hover:bg-sky-700 dark:hover:bg-sky-400 text-white dark:text-sky-950 inline-flex items-center justify-center gap-1.5 disabled:opacity-60 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {submitting ? 'Saving Threshold Alert...' : 'Arm Buy-Back Price Push Alert'}
            </button>
          </form>

          {/* Armed Alerts Watchlist */}
          <div className="p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-slate-900 dark:text-sky-50 inline-flex items-center gap-2">
                <BellRing className="w-4 h-4 text-emerald-500" />
                Your Armed Price Alerts
              </h4>
              <span className="text-[11px] font-mono text-slate-400 dark:text-sky-300/65">
                {activeAlertsCount}/{alerts.length} active
              </span>
            </div>

            {alerts.length === 0 ? (
              <div className="p-5 rounded-lg border border-dashed border-slate-200 dark:border-sky-900/70 text-center space-y-2">
                <Cpu className="w-7 h-7 text-slate-300 dark:text-sky-800 mx-auto" />
                <p className="text-xs font-semibold text-slate-700 dark:text-sky-100">
                  No price thresholds armed yet
                </p>
                <p className="text-[11px] text-slate-500 dark:text-sky-200/65">
                  Set a target price above (e.g., Gold-Bearing Circuit Boards ≥ ₹3,600/kg) to receive instant push notifications when market buy-back rates hit your mark.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[520px] overflow-y-auto pr-0.5">
                {alerts.map((alert) => {
                  const quote = quoteById.get(alert.categoryId);
                  const spot = quote?.currentPriceInr ?? 0;
                  const isHit = quote ? doesQuoteMeetAlert(quote, alert) : false;
                  const diff =
                    alert.condition === 'above'
                      ? alert.targetPriceInr - spot
                      : spot - alert.targetPriceInr;
                  const pct =
                    alert.condition === 'above'
                      ? Math.min(100, Math.max(4, Math.round((spot / Math.max(1, alert.targetPriceInr)) * 100)))
                      : Math.min(
                          100,
                          Math.max(4, Math.round((alert.targetPriceInr / Math.max(1, spot)) * 100))
                        );

                  const isEditing = editingAlertId === alert.id;
                  const isBusy = busyAlertId === alert.id;

                  return (
                    <div
                      key={alert.id}
                      className={`p-3.5 rounded-lg border space-y-2.5 transition-colors ${
                        isHit && alert.active
                          ? 'border-emerald-400 dark:border-emerald-700 bg-emerald-50/70 dark:bg-emerald-950/30'
                          : alert.active
                            ? 'border-slate-200 dark:border-sky-900/60 bg-slate-50/60 dark:bg-[#061526]'
                            : 'border-slate-200/70 dark:border-sky-900/40 bg-slate-50/30 dark:bg-[#051120] opacity-70'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-900 dark:text-sky-50 truncate">
                              {alert.categoryName}
                            </span>
                            {isHit && alert.active ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white">
                                TARGET REACHED
                              </span>
                            ) : !alert.active ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-200 dark:bg-sky-900/70 text-slate-600 dark:text-sky-300">
                                PAUSED
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300">
                                WATCHING
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-sky-200/80 mt-0.5">
                            Alert when{' '}
                            <span className="font-semibold">
                              {alert.condition === 'above' ? '≥' : '≤'}{' '}
                              {formatInrPerKg(alert.targetPriceInr)}
                            </span>{' '}
                            · Current:{' '}
                            <span className="font-mono font-semibold text-slate-900 dark:text-sky-50">
                              {formatInrPerKg(spot)}
                            </span>
                          </p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => {
                              setEditingAlertId(isEditing ? null : alert.id);
                              setEditTargetValue(String(alert.targetPriceInr));
                            }}
                            title="Edit target price"
                            className="p-1.5 rounded text-slate-500 hover:text-sky-600 dark:text-sky-300/75 dark:hover:text-sky-200 hover:bg-slate-200/60 dark:hover:bg-sky-900/50 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={async () => {
                              setBusyAlertId(alert.id);
                              try {
                                await onUpdateAlert(alert.id, { active: !alert.active });
                              } finally {
                                setBusyAlertId(null);
                              }
                            }}
                            title={alert.active ? 'Pause alert' : 'Resume alert'}
                            className="p-1.5 rounded text-slate-500 hover:text-amber-600 dark:text-sky-300/75 dark:hover:text-amber-300 hover:bg-slate-200/60 dark:hover:bg-sky-900/50 cursor-pointer"
                          >
                            {alert.active ? (
                              <Pause className="w-3.5 h-3.5" />
                            ) : (
                              <Play className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={async () => {
                              setBusyAlertId(alert.id);
                              try {
                                await onDeleteAlert(alert.id);
                              } finally {
                                setBusyAlertId(null);
                              }
                            }}
                            title="Delete alert"
                            className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {isEditing && (
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="number"
                            min={10}
                            max={100000}
                            step={5}
                            value={editTargetValue}
                            onChange={(e) => setEditTargetValue(e.target.value)}
                            className="w-28 px-2.5 py-1 text-xs font-mono rounded border border-sky-400 bg-white dark:bg-[#0B223B] text-slate-900 dark:text-sky-50"
                          />
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleSaveInlineTarget(alert)}
                            className="px-2.5 py-1 rounded text-[11px] font-semibold bg-sky-600 text-white hover:bg-sky-700 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                            Save
                          </button>
                        </div>
                      )}

                      {/* Progress to threshold */}
                      <div className="space-y-1">
                        <div className="h-1.5 rounded-full bg-slate-200 dark:bg-sky-950 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isHit
                                ? 'bg-emerald-500'
                                : 'bg-gradient-to-r from-sky-500 to-emerald-500'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-sky-300/70">
                          <span>
                            {isHit
                              ? `Threshold exceeded by ₹${Math.abs(Math.round(diff)).toLocaleString('en-IN')}/kg`
                              : `₹${Math.max(0, Math.round(diff)).toLocaleString('en-IN')}/kg away (${pct}%)`}
                          </span>
                          <span>
                            {alert.triggeredCount > 0
                              ? `Triggered ${alert.triggeredCount}×`
                              : 'Not triggered yet'}
                          </span>
                        </div>
                      </div>

                      {alert.note && (
                        <p className="text-[11px] italic text-slate-500 dark:text-sky-200/70">
                          “{alert.note}”
                        </p>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => onSimulateAlertTrigger(alert)}
                          className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 hover:underline inline-flex items-center gap-1 cursor-pointer"
                          title="Simulate market price crossing this threshold to test push notification"
                        >
                          <Sparkles className="w-3 h-3" />
                          Test Market Spike
                        </button>
                        {quote && (
                          <button
                            type="button"
                            onClick={() => onSchedulePickupForCategory(quote)}
                            className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                          >
                            <CalendarClock className="w-3 h-3" />
                            Lock Rate &amp; Schedule Pickup →
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Market Buy-Back Push Log */}
      {marketNotifications.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-sky-900/60 flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-900 dark:text-sky-50 inline-flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              Recent Buy-Back Push Alerts Triggered
            </h4>
            <span className="text-[11px] text-slate-500 dark:text-sky-300/65">
              Latest {Math.min(5, marketNotifications.length)}
            </span>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-sky-900/50">
            {marketNotifications.slice(0, 5).map((n) => (
              <div key={n.id} className="px-5 py-3 flex items-start justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-sky-50">{n.title}</p>
                  <p className="text-[11px] text-slate-600 dark:text-sky-200/75">{n.message}</p>
                </div>
                <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 shrink-0">
                  {n.read ? 'Read' : 'New'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
