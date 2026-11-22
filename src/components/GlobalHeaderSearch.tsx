import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Cpu,
  Factory,
  Globe,
  HardDrive,
  HeartPulse,
  MapPin,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import type { Facility } from '../types';

export interface EwasteCategorySearchItem {
  id: string;
  name: string;
  filterValue: string;
  examples: string;
  handlingNote: string;
  keywords: string[];
}

export interface KnowledgeTopicSearchItem {
  id: string;
  title: string;
  subtitle: string;
  query: string;
  keywords: string[];
}

export type GlobalSearchSelection =
  | { type: 'facility'; facility: Facility }
  | { type: 'category'; category: EwasteCategorySearchItem }
  | { type: 'knowledge'; topic: KnowledgeTopicSearchItem }
  | { type: 'centres-query'; query: string }
  | { type: 'knowledge-query'; query: string };

const EWASTE_CATEGORIES: EwasteCategorySearchItem[] = [
  {
    id: 'cat-it',
    name: 'IT & Telecom',
    filterValue: 'IT & Telecom',
    examples: 'Laptops, servers, routers, switches, enterprise racks, monitors',
    handlingNote: 'Wipe storage drives before pickup; recoverable gold & copper',
    keywords: ['laptop', 'computer', 'desktop', 'server', 'router', 'monitor', 'keyboard', 'network', 'office', 'it', 'telecom'],
  },
  {
    id: 'cat-consumer',
    name: 'Consumer Electronics',
    filterValue: 'Consumer Electronics',
    examples: 'Smartphones, tablets, cameras, audio consoles, smart displays, printers',
    handlingNote: 'Sign out of cloud locks (FRP / Find My) and remove SIM/SD cards',
    keywords: ['phone', 'smartphone', 'mobile', 'tablet', 'ipad', 'camera', 'tv', 'television', 'printer', 'scanner', 'speaker', 'headphones'],
  },
  {
    id: 'cat-batteries',
    name: 'Batteries & Power',
    filterValue: 'Batteries & Power',
    examples: 'Li-ion packs, UPS inverters, sealed lead-acid, EV auxiliary cells',
    handlingNote: 'Insulate terminals with non-conductive tape; never puncture swollen cells',
    keywords: ['battery', 'batteries', 'lithium', 'li-ion', 'ups', 'inverter', 'powerbank', 'lead-acid', 'swollen', 'cell', 'charger'],
  },
  {
    id: 'cat-large-appliances',
    name: 'Large Appliances',
    filterValue: 'Large Appliances',
    examples: 'Refrigerators, split ACs, washing machines, microwaves',
    handlingNote: 'Evacuate CFC/HFC refrigerants safely prior to transport',
    keywords: ['ac', 'air conditioner', 'fridge', 'refrigerator', 'washing machine', 'microwave', 'dishwasher', 'cooler', 'appliance'],
  },
  {
    id: 'cat-small-appliances',
    name: 'Small Appliances',
    filterValue: 'Small Appliances',
    examples: 'Induction cooktops, kettles, toasters, irons, vacuum cleaners',
    handlingNote: 'Bundle power cords neatly; recyclable copper coils & steel housings',
    keywords: ['kettle', 'toaster', 'iron', 'mixer', 'blender', 'induction', 'vacuum', 'hair dryer', 'fan', 'small appliance'],
  },
  {
    id: 'cat-pcb',
    name: 'PCB & Components',
    filterValue: 'PCB & Components',
    examples: 'Motherboards, GPUs, SSDs/HDDs, RAM modules, industrial control boards',
    handlingNote: 'Requires NIST-aligned sanitization or physical shredding',
    keywords: ['pcb', 'motherboard', 'gpu', 'graphics card', 'ssd', 'hdd', 'hard drive', 'ram', 'chip', 'circuit', 'board', 'cpu'],
  },
  {
    id: 'cat-medical',
    name: 'Medical & Lab',
    filterValue: 'Medical & Lab',
    examples: 'Diagnostic monitors, analyzers, lab centrifuges, clinical sensors',
    handlingNote: 'Decontaminate non-biohazard electronics before authorized transfer',
    keywords: ['medical', 'lab', 'hospital', 'diagnostic', 'analyzer', 'clinical', 'thermometer', 'oximeter'],
  },
  {
    id: 'cat-solar',
    name: 'Solar & Energy',
    filterValue: 'Solar & Energy',
    examples: 'End-of-life PV panels, micro-inverters, solar charge controllers',
    handlingNote: 'Recoverable silicon wafers, silver busbars, tempered glass & aluminum',
    keywords: ['solar', 'pv', 'photovoltaic', 'panel', 'inverter', 'renewable', 'clean energy'],
  },
];

const KNOWLEDGE_TOPICS: KnowledgeTopicSearchItem[] = [
  {
    id: 'kb-rules-2022',
    title: 'India E-Waste (Management) Rules, 2022',
    subtitle: 'CPCB compliance framework, notified EEE schedules, and channelization rules',
    query: 'India E-Waste Management Rules 2022 CPCB compliance and channelization guidelines',
    keywords: ['rules', '2022', 'india', 'cpcb', 'policy', 'law', 'regulation', 'compliance', 'statute'],
  },
  {
    id: 'kb-epr',
    title: 'Extended Producer Responsibility (EPR) Targets',
    subtitle: 'Annual recycling obligations, EPR certificates, and producer portal filings',
    query: 'India E-Waste Management Rules 2022 CPCB EPR targets for electronics producers',
    keywords: ['epr', 'producer', 'manufacturer', 'importer', 'target', 'certificate', 'quota', 'brand'],
  },
  {
    id: 'kb-bulk-consumer',
    title: 'Bulk Consumer Obligations',
    subtitle: 'Rules for enterprises, universities, hospitals, and public IT decommissioning',
    query: 'Bulk consumer obligations under India E-Waste Management Rules 2022',
    keywords: ['bulk', 'enterprise', 'corporate', 'office', 'hospital', 'university', 'company', 'decommissioning'],
  },
  {
    id: 'kb-battery-safety',
    title: 'Lithium-Ion Battery & Hazardous Waste Safety',
    subtitle: 'Thermal runaway prevention, terminal taping, CRT and mercury lamp handling',
    query: 'Safe storage, terminal taping, and transport rules for damaged lithium-ion batteries in e-waste',
    keywords: ['battery', 'lithium', 'hazard', 'swollen', 'fire', 'crt', 'mercury', 'safety', 'toxic', 'safe'],
  },
  {
    id: 'kb-data-wipe',
    title: 'Data Sanitization & Pre-Pickup Checklist',
    subtitle: 'Cloud lock removal, factory reset, and NIST-aligned drive wiping before handover',
    query: 'Best practices for NIST data wiping and device sanitization before e-waste recycling',
    keywords: ['data', 'wipe', 'privacy', 'nist', 'shred', 'delete', 'reset', 'checklist', 'hard drive', 'security'],
  },
  {
    id: 'kb-refurbish',
    title: 'Refurbishment vs Material Recovery',
    subtitle: 'Extending device life vs extracting copper, aluminum, and precious metals',
    query: 'Refurbishment vs recycling hierarchy and material recovery yields under India E-Waste Rules',
    keywords: ['refurbish', 'reuse', 'copper', 'gold', 'aluminum', 'recovery', 'circular', 'lifecycle'],
  },
];

function getCategoryIcon(id: string) {
  switch (id) {
    case 'cat-it':
      return Cpu;
    case 'cat-consumer':
      return Smartphone;
    case 'cat-batteries':
      return Zap;
    case 'cat-large-appliances':
      return Factory;
    case 'cat-small-appliances':
      return Wrench;
    case 'cat-pcb':
      return HardDrive;
    case 'cat-medical':
      return HeartPulse;
    default:
      return Globe;
  }
}

interface GlobalHeaderSearchProps {
  facilities: Facility[];
  onSelect: (selection: GlobalSearchSelection) => void;
}

export const GlobalHeaderSearch: React.FC<GlobalHeaderSearchProps> = ({
  facilities,
  onSelect,
}) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const desktopInputRef = useRef<HTMLInputElement | null>(null);
  const mobileInputRef = useRef<HTMLInputElement | null>(null);

  const trimmed = query.trim();
  const qLower = trimmed.toLowerCase();

  const matchedFacilities = useMemo(() => {
    if (!qLower) return facilities.slice(0, 3);
    return facilities
      .filter((f) => {
        const haystack = `${f.name} ${f.city} ${f.state} ${f.address} ${f.facilityType} ${f.acceptedCategories}`.toLowerCase();
        return haystack.includes(qLower);
      })
      .slice(0, 4);
  }, [facilities, qLower]);

  const matchedCategories = useMemo(() => {
    if (!qLower) return EWASTE_CATEGORIES.slice(0, 4);
    return EWASTE_CATEGORIES.filter((cat) => {
      const haystack = `${cat.name} ${cat.examples} ${cat.handlingNote} ${cat.keywords.join(' ')}`.toLowerCase();
      return haystack.includes(qLower);
    }).slice(0, 4);
  }, [qLower]);

  const matchedTopics = useMemo(() => {
    if (!qLower) return KNOWLEDGE_TOPICS.slice(0, 3);
    return KNOWLEDGE_TOPICS.filter((topic) => {
      const haystack = `${topic.title} ${topic.subtitle} ${topic.keywords.join(' ')}`.toLowerCase();
      return haystack.includes(qLower);
    }).slice(0, 4);
  }, [qLower]);

  // Flat navigable list for keyboard ArrowUp/ArrowDown/Enter support
  const flatItems = useMemo<GlobalSearchSelection[]>(() => {
    const list: GlobalSearchSelection[] = [];
    matchedFacilities.forEach((facility) => list.push({ type: 'facility', facility }));
    matchedCategories.forEach((category) => list.push({ type: 'category', category }));
    matchedTopics.forEach((topic) => list.push({ type: 'knowledge', topic }));
    if (trimmed) {
      list.push({ type: 'centres-query', query: trimmed });
      list.push({ type: 'knowledge-query', query: trimmed });
    }
    return list;
  }, [matchedFacilities, matchedCategories, matchedTopics, trimmed]);

  useEffect(() => {
    setActiveIndex(0);
  }, [qLower, open, mobileOpen]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setMobileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Global keyboard shortcuts: Cmd/Ctrl + K or "/" to focus search
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (window.innerWidth < 768) {
          setMobileOpen(true);
          setTimeout(() => mobileInputRef.current?.focus(), 20);
        } else {
          setOpen(true);
          desktopInputRef.current?.focus();
        }
      } else if (!isTyping && e.key === '/') {
        e.preventDefault();
        if (window.innerWidth < 768) {
          setMobileOpen(true);
          setTimeout(() => mobileInputRef.current?.focus(), 20);
        } else {
          setOpen(true);
          desktopInputRef.current?.focus();
        }
      } else if (e.key === 'Escape' && (open || mobileOpen)) {
        setOpen(false);
        setMobileOpen(false);
        desktopInputRef.current?.blur();
        mobileInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [open, mobileOpen]);

  const handleChoose = (selection: GlobalSearchSelection) => {
    onSelect(selection);
    setOpen(false);
    setMobileOpen(false);
    setQuery('');
    desktopInputRef.current?.blur();
    mobileInputRef.current?.blur();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open && !mobileOpen) setOpen(true);
      setActiveIndex((prev) => (flatItems.length > 0 ? (prev + 1) % flatItems.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) =>
        flatItems.length > 0 ? (prev - 1 + flatItems.length) % flatItems.length : 0
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = flatItems[activeIndex] ?? flatItems[0];
      if (chosen) handleChoose(chosen);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setMobileOpen(false);
      e.currentTarget.blur();
    }
  };

  const renderResultsPanel = () => {
    let cursor = 0;
    const hasLocalMatches =
      matchedFacilities.length > 0 || matchedCategories.length > 0 || matchedTopics.length > 0;

    return (
      <div
        role="listbox"
        aria-label="Global search results"
        className="w-full max-h-[72vh] overflow-y-auto rounded-xl border border-sky-200/90 dark:border-sky-800/80 bg-white/95 dark:bg-[#081C32]/95 backdrop-blur-xl shadow-2xl shadow-sky-950/15 dark:shadow-black/50 divide-y divide-slate-100 dark:divide-sky-900/50"
      >
        {!qLower && (
          <div className="px-3.5 py-2 bg-sky-50/70 dark:bg-sky-950/40 text-[11px] font-medium text-sky-800 dark:text-sky-300 flex items-center justify-between">
            <span>Quick Search — Centres, E-Waste &amp; Rules</span>
            <span className="font-mono text-[10px] opacity-75">↑↓ Navigate · ↵ Open</span>
          </div>
        )}

        {/* 1. Collection Centres */}
        {matchedFacilities.length > 0 && (
          <div className="p-2">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-sky-300/70">
              Collection Centres ({matchedFacilities.length})
            </p>
            <div className="space-y-0.5">
              {matchedFacilities.map((facility) => {
                const idx = cursor++;
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={`fac-${facility.id}`}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => handleChoose({ type: 'facility', facility })}
                    className={`w-full text-left px-2.5 py-2 rounded-lg flex items-start justify-between gap-3 transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-sky-50 dark:bg-sky-900/50 text-sky-950 dark:text-white'
                        : 'text-slate-700 dark:text-sky-100 hover:bg-slate-50 dark:hover:bg-sky-900/30'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <MapPin className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">{facility.name}</p>
                        <p className="text-[11px] text-slate-500 dark:text-sky-200/70 truncate">
                          {facility.city} · {facility.facilityType.replace('_', ' ')} ·{' '}
                          {facility.acceptedCategories}
                        </p>
                      </div>
                    </div>
                    {facility.verified && (
                      <ShieldCheck className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 2. E-Waste Categories */}
        {matchedCategories.length > 0 && (
          <div className="p-2">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-sky-300/70">
              E-Waste Categories ({matchedCategories.length})
            </p>
            <div className="space-y-0.5">
              {matchedCategories.map((category) => {
                const idx = cursor++;
                const isActive = idx === activeIndex;
                const Icon = getCategoryIcon(category.id);
                return (
                  <button
                    key={category.id}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => handleChoose({ type: 'category', category })}
                    className={`w-full text-left px-2.5 py-2 rounded-lg flex items-start justify-between gap-3 transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-sky-50 dark:bg-sky-900/50 text-sky-950 dark:text-white'
                        : 'text-slate-700 dark:text-sky-100 hover:bg-slate-50 dark:hover:bg-sky-900/30'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <Icon className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">{category.name}</p>
                        <p className="text-[11px] text-slate-500 dark:text-sky-200/70 truncate">
                          {category.examples}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-medium text-sky-700 dark:text-sky-300 whitespace-nowrap shrink-0 mt-0.5">
                      Filter Centres
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. Knowledge Hub Topics */}
        {matchedTopics.length > 0 && (
          <div className="p-2">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-sky-300/70">
              Knowledge Hub Topics ({matchedTopics.length})
            </p>
            <div className="space-y-0.5">
              {matchedTopics.map((topic) => {
                const idx = cursor++;
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={topic.id}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => handleChoose({ type: 'knowledge', topic })}
                    className={`w-full text-left px-2.5 py-2 rounded-lg flex items-start justify-between gap-3 transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-sky-50 dark:bg-sky-900/50 text-sky-950 dark:text-white'
                        : 'text-slate-700 dark:text-sky-100 hover:bg-slate-50 dark:hover:bg-sky-900/30'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <BookOpen className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">{topic.title}</p>
                        <p className="text-[11px] text-slate-500 dark:text-sky-200/70 truncate">
                          {topic.subtitle}
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-sky-500 shrink-0 mt-0.5" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Direct freeform actions whenever user types a query */}
        {trimmed && (
          <div className="p-2 bg-slate-50/70 dark:bg-[#061526]/70">
            {!hasLocalMatches && (
              <p className="px-2 pb-1.5 text-[11px] text-slate-500 dark:text-sky-200/70">
                No exact local directory match for &ldquo;{trimmed}&rdquo;. Search directly:
              </p>
            )}
            <div className="space-y-0.5">
              {(() => {
                const idx = cursor++;
                const isActive = idx === activeIndex;
                return (
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => handleChoose({ type: 'centres-query', query: trimmed })}
                    className={`w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-sky-100/80 dark:bg-sky-900/60 text-sky-950 dark:text-white'
                        : 'text-slate-700 dark:text-sky-100 hover:bg-white dark:hover:bg-sky-900/30'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2 truncate">
                      <MapPin className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                      <span className="truncate">
                        Search Collection Centres for <strong className="font-semibold">&ldquo;{trimmed}&rdquo;</strong>
                      </span>
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                  </button>
                );
              })()}

              {(() => {
                const idx = cursor++;
                const isActive = idx === activeIndex;
                return (
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => handleChoose({ type: 'knowledge-query', query: trimmed })}
                    className={`w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-sky-100/80 dark:bg-sky-900/60 text-sky-950 dark:text-white'
                        : 'text-slate-700 dark:text-sky-100 hover:bg-white dark:hover:bg-sky-900/30'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2 truncate">
                      <Sparkles className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                      <span className="truncate">
                        Research <strong className="font-semibold">&ldquo;{trimmed}&rdquo;</strong> in Knowledge Hub
                      </span>
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                  </button>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div ref={wrapperRef} className="relative flex items-center">
      {/* Desktop Compact Search Bar */}
      <div className="hidden md:block relative w-48 lg:w-64 xl:w-72">
        <Search className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={desktopInputRef}
          type="text"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onKeyDown={handleInputKeyDown}
          placeholder="Search centres, topics, e-waste..."
          aria-label="Global search for collection centres, knowledge hub topics, or e-waste categories"
          aria-expanded={open}
          role="combobox"
          aria-autocomplete="list"
          className="w-full pl-8 pr-12 py-1.5 text-xs rounded-lg border border-sky-200/90 dark:border-sky-800/80 bg-white/85 dark:bg-[#081C32]/85 text-slate-900 dark:text-sky-50 placeholder:text-slate-400 dark:placeholder:text-sky-200/50 transition-all duration-150 hover:border-sky-400 dark:hover:border-sky-600 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:bg-white dark:focus:bg-[#0B223B]"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              desktopInputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-sky-200 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <kbd className="hidden lg:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-slate-400 dark:text-sky-300/60 border border-slate-200 dark:border-sky-800/80 rounded bg-slate-50/80 dark:bg-[#061526]/80 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
            ⌘K
          </kbd>
        )}

        {open && (
          <div className="absolute right-0 top-full mt-2 w-[26rem] max-w-[90vw] z-50">
            {renderResultsPanel()}
          </div>
        )}
      </div>

      {/* Mobile Search Trigger Button */}
      <button
        type="button"
        onClick={() => {
          setMobileOpen((prev) => {
            const next = !prev;
            if (next) setTimeout(() => mobileInputRef.current?.focus(), 20);
            return next;
          });
        }}
        aria-label="Open global search"
        className="md:hidden p-2 rounded-lg text-slate-600 dark:text-sky-200/80 hover:bg-slate-100 dark:hover:bg-sky-900/40 transition-colors cursor-pointer"
      >
        <Search className="w-4 h-4" />
      </button>

      {/* Mobile Full-Width Dropdown Search Drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-x-0 top-16 z-50 px-3 pt-2.5 pb-3 bg-sky-50/95 dark:bg-[#040E1A]/95 backdrop-blur-md border-b border-sky-200 dark:border-sky-900/70 shadow-xl space-y-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-sky-600 dark:text-sky-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={mobileInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Search centres, topics, or e-waste..."
              aria-label="Global search"
              className="w-full pl-9 pr-9 py-2 text-sm rounded-lg border border-sky-300 dark:border-sky-800 bg-white dark:bg-[#0B223B] text-slate-900 dark:text-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
            />
            <button
              type="button"
              onClick={() => {
                if (query) {
                  setQuery('');
                  mobileInputRef.current?.focus();
                } else {
                  setMobileOpen(false);
                }
              }}
              aria-label={query ? 'Clear search' : 'Close search'}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-sky-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {renderResultsPanel()}
        </div>
      )}
    </div>
  );
};
