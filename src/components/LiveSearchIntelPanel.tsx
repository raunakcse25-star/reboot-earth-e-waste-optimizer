import React, { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  Coins,
  ExternalLink,
  Globe,
  Loader2,
  Newspaper,
  Scale,
  Search,
  Sparkles,
} from 'lucide-react';
import { apiFetch } from '../lib/api';

export type IntelTopic = 'metals' | 'regulations' | 'news' | 'programs' | 'custom';

interface SearchSource {
  title: string;
  uri: string;
  domain?: string;
}

interface LiveIntelResult {
  answer: string;
  sources: SearchSource[];
  webSearchQueries: string[];
  grounded: boolean;
  model?: string;
  fetchedAt?: string;
}

interface LiveSearchIntelPanelProps {
  initialQuery?: string;
  searchNonce?: number;
  title?: string;
  subtitle?: string;
}

const PRESET_TOPICS: {
  id: Exclude<IntelTopic, 'custom'>;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  query: string;
}[] = [
  {
    id: 'metals',
    label: 'Live Metal Rates',
    icon: Coins,
    query: 'Current scrap copper, aluminum, and gold recovery prices per kg in India today',
  },
  {
    id: 'regulations',
    label: 'CPCB & EPR Updates',
    icon: Scale,
    query: 'Latest India CPCB E-Waste Management Rules amendments, EPR portal updates, and recycling targets',
  },
  {
    id: 'news',
    label: 'E-Waste News',
    icon: Newspaper,
    query: 'Latest global and India e-waste recycling news, UN Global E-Waste Monitor stats, and urban mining breakthroughs',
  },
  {
    id: 'programs',
    label: 'OEM Take-Back',
    icon: Building2,
    query: 'Current Apple, Dell, HP, Samsung, and Lenovo official e-waste take-back and recycling programs in India',
  },
];

function renderInlineBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i} className="font-semibold text-slate-900 dark:text-sky-50">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}

function renderGroundedAnswer(text: string): React.ReactNode {
  const lines = text.split('\n');
  return (
    <div className="space-y-2">
      {lines.map((raw, idx) => {
        const line = raw.trim();
        if (!line) return <div key={idx} className="h-1" />;
        const heading = line.match(/^#{1,4}\s+(.*)$/);
        if (heading) {
          return (
            <h4
              key={idx}
              className="text-sm font-semibold text-slate-900 dark:text-sky-50 pt-1.5"
            >
              {renderInlineBold(heading[1])}
            </h4>
          );
        }
        const bullet = line.match(/^[-*•]\s+(.*)$/);
        if (bullet) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="mt-2 w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" />
              <span>{renderInlineBold(bullet[1])}</span>
            </div>
          );
        }
        return <p key={idx}>{renderInlineBold(line)}</p>;
      })}
    </div>
  );
}

export const LiveSearchIntelPanel: React.FC<LiveSearchIntelPanelProps> = ({
  initialQuery,
  searchNonce = 0,
  title = 'Real-Time Google Search Grounded Intelligence',
  subtitle = 'Query live scrap metal rates, latest CPCB EPR circulars, OEM take-back policies, and circular economy news powered by gemini-4-hydrogen with Google Search grounding.',
}) => {
  const [topic, setTopic] = useState<IntelTopic>('regulations');
  const [query, setQuery] = useState(
    initialQuery ||
      'Latest India CPCB E-Waste Management Rules amendments, EPR portal updates, and recycling targets'
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LiveIntelResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(async (searchText: string, activeTopic: IntelTopic) => {
    const cleaned = searchText.trim();
    if (!cleaned) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<LiveIntelResult>(
        '/api/ai/live-intel',
        {
          method: 'POST',
          body: JSON.stringify({
            query: cleaned,
            topic: activeTopic,
            region: 'India',
          }),
        },
        false
      );
      if (!res?.answer?.trim()) {
        throw new Error('No grounded answer was returned. Please retry.');
      }
      setResult({
        answer: res.answer.trim(),
        sources: Array.isArray(res.sources) ? res.sources : [],
        webSearchQueries: Array.isArray(res.webSearchQueries) ? res.webSearchQueries : [],
        grounded: Boolean(res.grounded),
        model: res.model,
        fetchedAt: res.fetchedAt,
      });
    } catch (err: any) {
      setError(err?.message || 'Unable to fetch live Google Search-grounded data right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (searchNonce > 0 && initialQuery && initialQuery.trim()) {
      setTopic('regulations');
      setQuery(initialQuery);
      void runSearch(initialQuery, 'regulations');
    }
  }, [searchNonce, initialQuery, runSearch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runSearch(query, topic);
  };

  const handlePresetClick = (preset: (typeof PRESET_TOPICS)[number]) => {
    setTopic(preset.id);
    setQuery(preset.query);
    void runSearch(preset.query, preset.id);
  };

  return (
    <div className="p-6 rounded-2xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 max-w-3xl">
          <h2 className="text-base font-bold text-slate-900 dark:text-sky-50 inline-flex items-center gap-2">
            <Globe className="w-4 h-4 text-sky-500" />
            {title}
          </h2>
          <p className="text-xs text-slate-600 dark:text-sky-200/70 leading-relaxed">
            {subtitle}
          </p>
        </div>
        <span className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium bg-sky-50 dark:bg-sky-950/70 border border-sky-200 dark:border-sky-800/80 text-sky-700 dark:text-sky-300 inline-flex items-center gap-1.5 shrink-0">
          <Sparkles className="w-3 h-3 text-sky-500" />
          Google Search Grounding
        </span>
      </div>

      {/* One-Click Real-Time Topic Presets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {PRESET_TOPICS.map((preset) => {
          const Icon = preset.icon;
          const active = topic === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              disabled={loading}
              onClick={() => handlePresetClick(preset)}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-60 ${
                active
                  ? 'border-sky-500 bg-sky-50/90 dark:bg-sky-950/60 text-sky-900 dark:text-sky-50 shadow-sm'
                  : 'border-slate-200 dark:border-sky-900/60 bg-slate-50/70 dark:bg-[#061526] text-slate-700 dark:text-sky-200/85 hover:border-sky-400 dark:hover:border-sky-700'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-semibold">
                <Icon className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                <span>{preset.label}</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-sky-300/65 mt-1 line-clamp-2">
                {preset.query}
              </p>
            </button>
          );
        })}
      </div>

      {/* Live Search Input */}
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-sky-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setTopic('custom');
            }}
            placeholder="Ask for real-time scrap rates, latest CPCB notices, OEM recycling links, or news..."
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50 transition-all duration-150 hover:border-sky-400/80 dark:hover:border-sky-700 hover:bg-white dark:hover:bg-[#091F38] focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:bg-white dark:focus:bg-[#091F38]"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 transition-all duration-200 hover:bg-sky-700 dark:hover:bg-sky-400 disabled:opacity-60 inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {loading ? 'Searching Google...' : 'Search Live Web'}
        </button>
      </form>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {result && (
        <div className="pt-4 border-t border-slate-200 dark:border-sky-900/50 space-y-4">
          {/* Grounding Verification Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-sky-300/75">
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
              <Globe className="w-3.5 h-3.5" />
              {result.grounded
                ? `Grounded with live Google Search (${result.sources.length} cited source${result.sources.length === 1 ? '' : 's'})`
                : 'Answered with gemini-4-hydrogen'}
            </span>
            {result.fetchedAt && (
              <span className="font-mono">
                Updated {new Date(result.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>

          {/* Grounded Answer */}
          <div className="text-sm text-slate-700 dark:text-sky-100/90 leading-relaxed">
            {renderGroundedAnswer(result.answer)}
          </div>

          {/* Executed Google Search Queries */}
          {result.webSearchQueries.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-sky-300/70">
                Google Search Queries Used
              </p>
              <div className="flex flex-wrap gap-1.5">
                {result.webSearchQueries.map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setQuery(q);
                      setTopic('custom');
                      void runSearch(q, 'custom');
                    }}
                    className="px-2.5 py-1 rounded-md text-[11px] bg-slate-100 dark:bg-[#061526] border border-slate-200 dark:border-sky-900/70 text-slate-700 dark:text-sky-200 hover:border-sky-500 transition-colors cursor-pointer"
                  >
                    “{q}”
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Cited Web Sources */}
          {result.sources.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-sky-300/70">
                Cited Web Sources
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {result.sources.map((s, idx) => (
                  <a
                    key={idx}
                    href={s.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] hover:border-sky-500 transition-all flex items-start justify-between gap-2 group"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-sky-700 dark:text-sky-300 group-hover:underline truncate">
                        {s.title}
                      </p>
                      {s.domain && (
                        <p className="text-[10px] font-mono text-slate-500 dark:text-sky-300/60 truncate mt-0.5">
                          {s.domain}
                        </p>
                      )}
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-sky-500 shrink-0 mt-0.5" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
