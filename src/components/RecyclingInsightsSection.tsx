import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  BookOpen,
  Check,
  Clock,
  Share2,
  Search,
  Wrench,
  Leaf,
  X,
} from 'lucide-react';
import {
  RECYCLING_INSIGHTS_POSTS,
  type InsightCategory,
  type RecyclingInsightPost,
} from '../data/recyclingInsights';

type FilterTab = 'All' | InsightCategory | 'Saved';

const SAVED_INSIGHTS_STORAGE_KEY = 'reboot_earth_saved_insights_v1';

interface ResilientEditorialImageProps {
  src?: string;
  alt: string;
  title: string;
  category: InsightCategory;
  className?: string;
}

const ResilientEditorialImage: React.FC<ResilientEditorialImageProps> = ({
  src,
  alt,
  title,
  category,
  className = '',
}) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center p-6 text-center bg-gradient-to-br from-slate-100 via-sky-50 to-emerald-50 dark:from-[#061526] dark:via-[#0B223B] dark:to-[#072625] ${className}`}
      >
        {category === 'DIY E-Waste Repurposing' ? (
          <Wrench className="w-8 h-8 text-sky-600 dark:text-sky-400 mb-2" />
        ) : (
          <Leaf className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mb-2" />
        )}
        <p className="text-xs font-medium text-slate-600 dark:text-sky-200/80 max-w-[200px] line-clamp-2">
          {title}
        </p>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};

export const RecyclingInsightsSection: React.FC = () => {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(SAVED_INSIGHTS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string');
      }
    } catch {
      // Ignore malformed storage
    }
    return [];
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [readProgressPct, setReadProgressPct] = useState(0);
  const readerScrollRef = useRef<HTMLDivElement | null>(null);

  const toggleSave = (postId: string) => {
    setSavedIds((prev) => {
      const next = prev.includes(postId) ? prev.filter((id) => id !== postId) : [...prev, postId];
      try {
        localStorage.setItem(SAVED_INSIGHTS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  const handleCopyShare = async (post: RecyclingInsightPost) => {
    const shareText = `${post.title} — ${post.deck} (${post.weekLabel}, Reboot Earth Recycling Insights)`;
    try {
      await navigator.clipboard.writeText(shareText);
      setCopiedId(post.id);
      window.setTimeout(() => setCopiedId(null), 2200);
    } catch {
      // Clipboard may be unavailable in restricted contexts
    }
  };

  const filteredPosts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return RECYCLING_INSIGHTS_POSTS.filter((post) => {
      if (activeFilter === 'Saved' && !savedIds.includes(post.id)) return false;
      if (
        activeFilter !== 'All' &&
        activeFilter !== 'Saved' &&
        post.category !== activeFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        post.title.toLowerCase().includes(q) ||
        post.deck.toLowerCase().includes(q) ||
        post.category.toLowerCase().includes(q) ||
        post.author.toLowerCase().includes(q) ||
        post.impactHighlight.toLowerCase().includes(q)
      );
    });
  }, [activeFilter, searchQuery, savedIds]);

  const activePost = useMemo(
    () => RECYCLING_INSIGHTS_POSTS.find((p) => p.id === activePostId) || null,
    [activePostId]
  );

  const activePostIndex = useMemo(
    () => (activePost ? RECYCLING_INSIGHTS_POSTS.findIndex((p) => p.id === activePost.id) : -1),
    [activePost]
  );

  // Close article reader on Escape key
  useEffect(() => {
    if (!activePost) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActivePostId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activePost]);

  // Reset scroll progress when opening a new article
  useEffect(() => {
    setReadProgressPct(0);
    if (readerScrollRef.current) {
      readerScrollRef.current.scrollTop = 0;
    }
  }, [activePostId]);

  const handleReaderScroll = () => {
    const el = readerScrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 0) {
      setReadProgressPct(100);
      return;
    }
    setReadProgressPct(Math.min(100, Math.round((el.scrollTop / maxScroll) * 100)));
  };

  const isDefaultUnfilteredView = activeFilter === 'All' && searchQuery.trim() === '';
  const leadPost = isDefaultUnfilteredView ? filteredPosts[0] : null;
  const secondaryPosts = isDefaultUnfilteredView ? filteredPosts.slice(1, 4) : filteredPosts;
  const archivePosts = isDefaultUnfilteredView ? filteredPosts.slice(4) : [];

  const filterTabs: { id: FilterTab; label: string }[] = [
    { id: 'All', label: `All Issues (${RECYCLING_INSIGHTS_POSTS.length})` },
    { id: 'DIY E-Waste Repurposing', label: 'DIY Repurposing' },
    { id: 'Sustainable Living', label: 'Sustainable Living' },
    { id: 'Saved', label: `Saved (${savedIds.length})` },
  ];

  return (
    <section
      aria-labelledby="recycling-insights-heading"
      className="space-y-8 pt-6 border-t border-slate-200 dark:border-sky-900/60"
    >
      {/* Editorial Masthead & Filter Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5">
        <div className="space-y-2 max-w-2xl">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-sky-300/75">
            <span className="font-semibold text-sky-700 dark:text-sky-400">
              Recycling Insights
            </span>
            <span aria-hidden="true">·</span>
            <span>Weekly Journal</span>
            <span aria-hidden="true">·</span>
            <span>Updated Every Tuesday</span>
          </div>
          <h2
            id="recycling-insights-heading"
            className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-sky-50"
          >
            Weekly Guides on Sustainable Living &amp; DIY E-Waste Repurposing
          </h2>
          <p className="text-sm text-slate-600 dark:text-sky-100/80 leading-relaxed">
            Practical, bench-tested tutorials for giving aging electronics a useful second life alongside clear reporting on circular living and material recovery.
          </p>
        </div>

        {/* Filter Controls & Live Search */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 shrink-0">
          <div
            role="tablist"
            aria-label="Filter Recycling Insights articles"
            className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#071A2E] border border-slate-200/80 dark:border-sky-900/60 overflow-x-auto"
          >
            {filterTabs.map((tab) => {
              const active = activeFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={active}
                  type="button"
                  onClick={() => setActiveFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    active
                      ? 'bg-white dark:bg-sky-500 text-slate-900 dark:text-sky-950 font-semibold shadow-sm'
                      : 'text-slate-600 dark:text-sky-200/75 hover:text-slate-900 dark:hover:text-sky-50'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search insights..."
              aria-label="Search Recycling Insights posts"
              className="w-full pl-8 pr-3 py-2 rounded-lg text-xs border border-slate-200 dark:border-sky-800 bg-white dark:bg-[#071A2E] text-slate-900 dark:text-sky-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
        </div>
      </div>

      {/* Empty State */}
      {filteredPosts.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] p-10 text-center space-y-3">
          <BookOpen className="w-7 h-7 text-slate-400 dark:text-sky-400/70 mx-auto" />
          <p className="text-sm font-semibold text-slate-900 dark:text-sky-50">
            {activeFilter === 'Saved'
              ? 'No saved articles yet'
              : 'No articles match your current search'}
          </p>
          <p className="text-xs text-slate-500 dark:text-sky-200/70 max-w-md mx-auto">
            {activeFilter === 'Saved'
              ? 'Bookmark any weekly guide or sustainable living essay to build your personal reference reading list.'
              : 'Try clearing your search terms or switching back to all weekly issues.'}
          </p>
          <button
            type="button"
            onClick={() => {
              setActiveFilter('All');
              setSearchQuery('');
            }}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 hover:bg-sky-700 dark:hover:bg-sky-400 transition-colors cursor-pointer"
          >
            View All Weekly Issues
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Tier 1: Featured Lead Weekly Essay */}
          {leadPost && (
            <article className="rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
              <div className="lg:col-span-7 relative bg-slate-100 dark:bg-[#061526] min-h-[240px]">
                <ResilientEditorialImage
                  src={leadPost.coverImage}
                  alt={leadPost.imageAlt || leadPost.title}
                  title={leadPost.title}
                  category={leadPost.category}
                  className="w-full h-full object-cover aspect-[16/9] lg:aspect-auto"
                />
              </div>

              <div className="lg:col-span-5 p-6 sm:p-7 flex flex-col justify-between gap-6">
                <div className="space-y-3.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-sky-200/75">
                    <span className="font-semibold text-sky-700 dark:text-sky-400">
                      Issue #{leadPost.issueNumber}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{leadPost.weekLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span>{leadPost.category}</span>
                  </div>

                  <h3 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-sky-50 leading-snug">
                    <button
                      type="button"
                      onClick={() => setActivePostId(leadPost.id)}
                      className="text-left hover:text-sky-700 dark:hover:text-sky-300 transition-colors cursor-pointer"
                    >
                      {leadPost.title}
                    </button>
                  </h3>

                  <p className="text-sm text-slate-600 dark:text-sky-100/80 leading-relaxed">
                    {leadPost.deck}
                  </p>

                  <div className="pt-2 border-t border-slate-200 dark:border-sky-900/50 space-y-1 text-xs">
                    <p className="font-medium text-emerald-700 dark:text-emerald-400">
                      Impact: {leadPost.impactHighlight}
                    </p>
                    <p className="text-slate-500 dark:text-sky-200/70">
                      By {leadPost.author} ({leadPost.authorRole}) · {leadPost.readTimeMinutes} min read · {leadPost.guideFormat}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setActivePostId(leadPost.id)}
                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 hover:bg-sky-700 dark:hover:bg-sky-400 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                  >
                    <span>Read Full Guide</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleSave(leadPost.id)}
                    aria-label={savedIds.includes(leadPost.id) ? 'Remove bookmark' : 'Save article'}
                    className="px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-sky-800 text-slate-700 dark:text-sky-200 hover:border-sky-500 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                  >
                    {savedIds.includes(leadPost.id) ? (
                      <>
                        <BookmarkCheck className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                        <span>Saved</span>
                      </>
                    ) : (
                      <>
                        <Bookmark className="w-3.5 h-3.5" />
                        <span>Save</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </article>
          )}

          {/* Tier 2: Secondary Editorial Feature Cards */}
          {secondaryPosts.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {secondaryPosts.map((post) => {
                const isSaved = savedIds.includes(post.id);
                return (
                  <article
                    key={post.id}
                    className="rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] overflow-hidden flex flex-col justify-between transition-colors hover:border-sky-400/80 dark:hover:border-sky-600"
                  >
                    <div>
                      <button
                        type="button"
                        onClick={() => setActivePostId(post.id)}
                        className="block w-full text-left overflow-hidden bg-slate-100 dark:bg-[#061526] cursor-pointer"
                      >
                        <ResilientEditorialImage
                          src={post.coverImage}
                          alt={post.imageAlt || post.title}
                          title={post.title}
                          category={post.category}
                          className="w-full aspect-[4/3] object-cover transition-transform duration-300 hover:scale-[1.02]"
                        />
                      </button>

                      <div className="p-5 space-y-2.5">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-sky-300/75">
                          <span className="font-semibold text-sky-700 dark:text-sky-400">
                            {post.category}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{post.weekLabel}</span>
                        </div>

                        <h3 className="font-display text-base font-bold text-slate-900 dark:text-sky-50 leading-snug">
                          <button
                            type="button"
                            onClick={() => setActivePostId(post.id)}
                            className="text-left hover:text-sky-700 dark:hover:text-sky-300 transition-colors cursor-pointer"
                          >
                            {post.title}
                          </button>
                        </h3>

                        <p className="text-xs text-slate-600 dark:text-sky-100/80 leading-relaxed line-clamp-3">
                          {post.deck}
                        </p>
                      </div>
                    </div>

                    <div className="px-5 py-3.5 border-t border-slate-200 dark:border-sky-900/50 flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-500 dark:text-sky-300/70 inline-flex items-center gap-1 font-mono tabular-nums text-[11px]">
                        <Clock className="w-3.5 h-3.5" />
                        {post.readTimeMinutes} min read
                      </span>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleSave(post.id)}
                          aria-label={isSaved ? 'Remove bookmark' : 'Bookmark article'}
                          className="p-1.5 rounded-md text-slate-500 dark:text-sky-300/75 hover:text-sky-600 dark:hover:text-sky-300 transition-colors cursor-pointer"
                        >
                          {isSaved ? (
                            <BookmarkCheck className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                          ) : (
                            <Bookmark className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setActivePostId(post.id)}
                          className="font-semibold text-sky-700 dark:text-sky-400 hover:underline inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                        >
                          <span>Read</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* Tier 3: Weekly Archive Dispatches (Text-Led Editorial Rows) */}
          {archivePosts.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] divide-y divide-slate-200 dark:divide-sky-900/50">
              <div className="px-5 py-3.5 flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-slate-900 dark:text-sky-50">
                  Earlier Weekly Dispatches
                </h3>
                <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-sky-300/70">
                  Archive · Issues #43–#44
                </span>
              </div>

              {archivePosts.map((post) => {
                const isSaved = savedIds.includes(post.id);
                return (
                  <div
                    key={post.id}
                    className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-sky-950/30 transition-colors"
                  >
                    <div className="space-y-1.5 max-w-3xl">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-sky-300/75">
                        <span className="font-mono tabular-nums font-semibold text-slate-700 dark:text-sky-300">
                          Issue #{post.issueNumber}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{post.weekLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-sky-700 dark:text-sky-400">
                          {post.category}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{post.readTimeMinutes} min read</span>
                      </div>
                      <h4 className="font-display text-base font-bold text-slate-900 dark:text-sky-50">
                        <button
                          type="button"
                          onClick={() => setActivePostId(post.id)}
                          className="text-left hover:text-sky-700 dark:hover:text-sky-300 transition-colors cursor-pointer"
                        >
                          {post.title}
                        </button>
                      </h4>
                      <p className="text-xs text-slate-600 dark:text-sky-200/75 leading-relaxed">
                        {post.deck}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleSave(post.id)}
                        aria-label={isSaved ? 'Remove bookmark' : 'Bookmark article'}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-sky-800 text-xs text-slate-600 dark:text-sky-200 hover:border-sky-500 inline-flex items-center gap-1 cursor-pointer"
                      >
                        {isSaved ? (
                          <BookmarkCheck className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                        ) : (
                          <Bookmark className="w-3.5 h-3.5" />
                        )}
                        <span>{isSaved ? 'Saved' : 'Save'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActivePostId(post.id)}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-sky-500 text-white dark:text-sky-950 hover:bg-slate-800 dark:hover:bg-sky-400 inline-flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors"
                      >
                        <span>Read Essay</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Long-Form Editorial Article Reader Modal */}
      {activePost && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="insight-reader-title"
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
          onClick={() => setActivePostId(null)}
        >
          <div
            className="relative w-full max-w-3xl max-h-[90vh] rounded-xl border border-slate-200 dark:border-sky-800 bg-white dark:bg-[#071A2E] shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Reading Progress Hairline Bar */}
            <div className="h-1 w-full bg-slate-100 dark:bg-sky-950 shrink-0">
              <div
                className="h-full bg-sky-600 dark:bg-sky-400 transition-all duration-150"
                style={{ width: `${Math.max(4, readProgressPct)}%` }}
              />
            </div>

            {/* Sticky Reader Top Utility Bar */}
            <div className="px-5 py-3 border-b border-slate-200 dark:border-sky-900/60 flex items-center justify-between gap-3 shrink-0 bg-white dark:bg-[#071A2E]">
              <div className="text-xs text-slate-500 dark:text-sky-300/75 truncate">
                <span className="font-mono tabular-nums font-semibold text-sky-700 dark:text-sky-400">
                  Issue #{activePost.issueNumber}
                </span>
                <span className="mx-1.5" aria-hidden="true">
                  ·
                </span>
                <span>{activePost.category}</span>
                <span className="mx-1.5 hidden sm:inline" aria-hidden="true">
                  ·
                </span>
                <span className="hidden sm:inline">{activePost.readTimeMinutes} min read</span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleCopyShare(activePost)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-sky-800 text-slate-700 dark:text-sky-200 hover:border-sky-500 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedId === activePost.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Share</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => toggleSave(activePost.id)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-sky-800 text-slate-700 dark:text-sky-200 hover:border-sky-500 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {savedIds.includes(activePost.id) ? (
                    <>
                      <BookmarkCheck className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                      <span>Saved</span>
                    </>
                  ) : (
                    <>
                      <Bookmark className="w-3.5 h-3.5" />
                      <span>Save</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActivePostId(null)}
                  aria-label="Close article reader"
                  className="p-1.5 rounded-lg text-slate-500 dark:text-sky-200 hover:bg-slate-100 dark:hover:bg-sky-900/50 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrollable Editorial Body */}
            <div
              ref={readerScrollRef}
              onScroll={handleReaderScroll}
              className="overflow-y-auto px-6 sm:px-10 py-8 space-y-7"
            >
              <header className="max-w-2xl mx-auto space-y-3">
                <p className="text-xs text-slate-500 dark:text-sky-300/75">
                  {activePost.weekLabel} · {activePost.guideFormat}
                </p>
                <h2
                  id="insight-reader-title"
                  className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-sky-50 leading-tight"
                >
                  {activePost.title}
                </h2>
                <p className="text-sm sm:text-base text-slate-600 dark:text-sky-100/80 leading-relaxed">
                  {activePost.deck}
                </p>
                <div className="pt-3 border-t border-slate-200 dark:border-sky-900/60 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-slate-700 dark:text-sky-200 font-medium">
                    {activePost.author}{' '}
                    <span className="text-slate-500 dark:text-sky-300/70 font-normal">
                      — {activePost.authorRole}
                    </span>
                  </span>
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">
                    {activePost.impactHighlight}
                  </span>
                </div>
              </header>

              {/* Hero Figure */}
              {activePost.coverImage && (
                <figure className="max-w-2xl mx-auto space-y-2">
                  <div className="rounded-lg overflow-hidden border border-slate-200 dark:border-sky-900/60 bg-slate-100 dark:bg-[#061526]">
                    <ResilientEditorialImage
                      src={activePost.coverImage}
                      alt={activePost.imageAlt || activePost.title}
                      title={activePost.title}
                      category={activePost.category}
                      className="w-full max-h-[360px] object-cover"
                    />
                  </div>
                  {activePost.imageCaption && (
                    <figcaption className="text-xs italic text-slate-500 dark:text-sky-300/70">
                      {activePost.imageCaption}
                    </figcaption>
                  )}
                </figure>
              )}

              {/* Pull Quote (Top & Bottom Hairlines — No Thick Left Border) */}
              <blockquote className="max-w-2xl mx-auto py-5 border-y border-slate-200 dark:border-sky-900/60 text-base sm:text-lg italic font-medium text-slate-800 dark:text-sky-100 leading-relaxed">
                “{activePost.pullQuote}”
              </blockquote>

              {/* Structured Sections */}
              <div className="max-w-2xl mx-auto space-y-6">
                {activePost.sections.map((section, sIdx) => (
                  <div key={sIdx} className="space-y-3">
                    <h3 className="font-display text-lg font-bold text-slate-900 dark:text-sky-50">
                      {section.heading}
                    </h3>
                    {section.paragraphs.map((para, pIdx) => (
                      <p
                        key={pIdx}
                        className={`text-sm sm:text-[15px] text-slate-700 dark:text-sky-100/85 leading-[1.75] ${
                          sIdx === 0 && pIdx === 0
                            ? 'first-letter:text-4xl first-letter:font-display first-letter:font-bold first-letter:float-left first-letter:mr-2.5 first-letter:leading-none first-letter:text-sky-700 dark:first-letter:text-sky-400'
                            : ''
                        }`}
                      >
                        {para}
                      </p>
                    ))}
                    {section.checklist && section.checklist.length > 0 && (
                      <ul className="pt-2 space-y-2 border-t border-slate-200 dark:border-sky-900/50 text-sm text-slate-700 dark:text-sky-100/85">
                        {section.checklist.map((item, cIdx) => (
                          <li key={cIdx} className="flex items-start gap-2.5 leading-relaxed">
                            <span className="font-mono tabular-nums text-xs text-sky-700 dark:text-sky-400 mt-0.5 shrink-0">
                              0{cIdx + 1}.
                            </span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}

                {/* Key Takeaways Summary */}
                <div className="pt-5 border-t border-slate-200 dark:border-sky-900/60 space-y-2.5">
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-sky-50">
                    Key Takeaways
                  </h4>
                  <ul className="space-y-1.5 text-xs sm:text-sm text-slate-600 dark:text-sky-200/80 leading-relaxed">
                    {activePost.takeaways.map((tip, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span aria-hidden="true" className="text-emerald-600 dark:text-emerald-400">
                          –
                        </span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Previous / Next Weekly Issue Navigation */}
                <div className="pt-6 border-t border-slate-200 dark:border-sky-900/60 flex items-center justify-between gap-4">
                  {activePostIndex > 0 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setActivePostId(RECYCLING_INSIGHTS_POSTS[activePostIndex - 1].id)
                      }
                      className="text-left text-xs text-slate-600 dark:text-sky-200 hover:text-sky-700 dark:hover:text-sky-300 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate max-w-[200px]">
                        Newer: Issue #{RECYCLING_INSIGHTS_POSTS[activePostIndex - 1].issueNumber}
                      </span>
                    </button>
                  ) : (
                    <span />
                  )}

                  {activePostIndex >= 0 && activePostIndex < RECYCLING_INSIGHTS_POSTS.length - 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setActivePostId(RECYCLING_INSIGHTS_POSTS[activePostIndex + 1].id)
                      }
                      className="text-right text-xs text-slate-600 dark:text-sky-200 hover:text-sky-700 dark:hover:text-sky-300 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <span className="truncate max-w-[200px]">
                        Earlier: Issue #{RECYCLING_INSIGHTS_POSTS[activePostIndex + 1].issueNumber}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
