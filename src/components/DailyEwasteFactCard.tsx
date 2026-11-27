import React, { useCallback, useEffect, useState } from 'react';
import {
  CalendarClock,
  Check,
  Copy,
  Lightbulb,
  RefreshCw,
  Repeat,
  Sparkles,
} from 'lucide-react';
import {
  getDailyEwasteFact,
  getDateKey,
  getRandomEwasteFact,
  type EwasteFact,
} from '../lib/ewasteFacts';

interface DailyEwasteFactResponse {
  fact: EwasteFact;
  mode: 'daily' | 'random';
  dateKey: string;
  totalFacts: number;
}

interface DailyEwasteFactCardProps {
  onSchedulePickup?: () => void;
  onOpenMarketplace?: () => void;
}

const CATEGORY_STYLES: Record<EwasteFact['category'], string> = {
  'Urban Mining':
    'bg-amber-100/90 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/70',
  'Carbon Impact':
    'bg-emerald-100/90 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70',
  'Circular Design':
    'bg-sky-100/90 dark:bg-sky-950/70 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-800/70',
  'Battery Recovery':
    'bg-indigo-100/90 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/70',
  'Material Conservation':
    'bg-teal-100/90 dark:bg-teal-950/70 text-teal-800 dark:text-teal-300 border-teal-200 dark:border-teal-800/70',
};

export const DailyEwasteFactCard: React.FC<DailyEwasteFactCardProps> = ({
  onSchedulePickup,
  onOpenMarketplace,
}) => {
  const [fact, setFact] = useState<EwasteFact>(() => getDailyEwasteFact());
  const [mode, setMode] = useState<'daily' | 'random'>('daily');
  const [dateKey, setDateKey] = useState<string>(() => getDateKey());
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchFact = useCallback(async (fetchMode: 'daily' | 'random', excludeId?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ mode: fetchMode });
      if (excludeId) params.set('exclude', excludeId);
      const res = await fetch(`/api/ewaste-fact?${params.toString()}`);
      if (!res.ok) throw new Error('Fact endpoint unavailable');
      const data = (await res.json()) as DailyEwasteFactResponse;
      if (data?.fact?.id) {
        setFact(data.fact);
        setMode(data.mode || fetchMode);
        if (data.dateKey) setDateKey(data.dateKey);
        return;
      }
      throw new Error('Invalid fact payload');
    } catch {
      const fallback =
        fetchMode === 'random' ? getRandomEwasteFact(excludeId) : getDailyEwasteFact();
      setFact(fallback);
      setMode(fetchMode);
      setDateKey(getDateKey());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchFact('daily');
  }, [fetchFact]);

  const handleCopyFact = async () => {
    const snippet = `Daily E-Waste Fact (${fact.metricHighlight}): ${fact.fact} — Source: ${fact.source}`;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard unavailable in restricted context
    }
  };

  const formattedDate = (() => {
    const parsed = new Date(`${dateKey}T12:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return dateKey;
    return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  })();

  return (
    <section
      aria-label="Daily E-Waste Fact"
      className="rounded-xl border border-slate-200 dark:border-sky-900/60 bg-gradient-to-br from-white via-sky-50/40 to-emerald-50/40 dark:from-[#0B223B] dark:via-[#081C32] dark:to-[#07202B] p-5 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2.5 rounded-xl bg-amber-100/90 dark:bg-amber-950/60 border border-amber-200/80 dark:border-amber-800/60 text-amber-700 dark:text-amber-300 shrink-0">
            <Lightbulb className="w-5 h-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400">
                {mode === 'daily' ? `Daily E-Waste Fact · ${formattedDate}` : 'Circular Economy Spotlight'}
              </span>
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                  CATEGORY_STYLES[fact.category]
                }`}
              >
                {fact.category}
              </span>
            </div>
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-sky-50 leading-snug">
              {fact.headline}
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void handleCopyFact()}
            title="Copy fact to clipboard"
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-sky-800/80 bg-white/90 dark:bg-[#061526] text-xs font-semibold text-slate-700 dark:text-sky-200 hover:border-sky-500 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-500 dark:text-sky-300" />
                <span>Copy</span>
              </>
            )}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void fetchFact('random', fact.id)}
            className="px-3 py-1.5 rounded-lg bg-sky-600 dark:bg-sky-500 hover:bg-sky-700 dark:hover:bg-sky-400 text-white dark:text-sky-950 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Another Fact</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
        <div className="lg:col-span-8 space-y-2">
          <p className="text-sm text-slate-700 dark:text-sky-100/90 leading-relaxed">
            {fact.fact}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-sky-300/70">
            Source: <span className="font-medium text-slate-700 dark:text-sky-200">{fact.source}</span>
          </p>
        </div>

        <div className="lg:col-span-4 p-3.5 rounded-xl border border-emerald-200/80 dark:border-emerald-900/60 bg-white/80 dark:bg-[#061526]/90 space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            Key Impact Stat
          </div>
          <p className="font-mono text-base font-bold text-slate-900 dark:text-sky-50">
            {fact.metricHighlight}
          </p>
          <p className="text-[11px] text-slate-600 dark:text-sky-200/75 leading-relaxed">
            {fact.actionTip}
          </p>
          {fact.ctaType === 'marketplace' && onOpenMarketplace ? (
            <button
              type="button"
              onClick={onOpenMarketplace}
              className="pt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Repeat className="w-3.5 h-3.5" />
              Explore Circular Marketplace →
            </button>
          ) : onSchedulePickup ? (
            <button
              type="button"
              onClick={onSchedulePickup}
              className="pt-1 text-xs font-semibold text-sky-700 dark:text-sky-400 hover:underline inline-flex items-center gap-1.5 cursor-pointer"
            >
              <CalendarClock className="w-3.5 h-3.5" />
              Schedule an E-Waste Pickup →
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
};
