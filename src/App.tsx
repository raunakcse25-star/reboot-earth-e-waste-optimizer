import React, { useCallback, useEffect, useState } from 'react';
import { Menu, Moon, Recycle, Sun, X } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './lib/api';
import type { AnalyticsSummary, Facility } from './types';
import { AboutAndLegalPage, HomePage, KnowledgeHubPage, type PublicRoute } from './components/PublicPages';
import { FacilityMap } from './components/FacilityMap';
import { OptimizerStudio } from './components/OptimizerStudio';
import { DashboardShell } from './components/DashboardShell';
import { AuthPage, type AuthMode } from './components/AuthPage';
import { EcoBotWidget } from './components/EcoBotWidget';
import { GlobalHeaderSearch, type GlobalSearchSelection } from './components/GlobalHeaderSearch';
import { ScenesStudio } from './components/three/ScenesStudio';

const QUOTA_DOC_URL =
  'https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors';

export default function App() {
  const { isAuthenticated, theme, setTheme } = useAuth();
  const [route, setRoute] = useState<PublicRoute>('home');
  const [authInitialMode, setAuthInitialMode] = useState<AuthMode>('signin');
  const [inDashboard, setInDashboard] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);

  // Global header search deep-link state for Find Centres & Knowledge Hub
  const [searchFacilityId, setSearchFacilityId] = useState<number | null>(null);
  const [searchCategoryFilter, setSearchCategoryFilter] = useState<string>('all');
  const [searchCityQuery, setSearchCityQuery] = useState<string>('');
  const [centresFilterVersion, setCentresFilterVersion] = useState<number>(0);
  const [knowledgeQuery, setKnowledgeQuery] = useState<string>('');
  const [knowledgeSearchNonce, setKnowledgeSearchNonce] = useState<number>(0);

  const loadPublicData = useCallback(async () => {
    try {
      const [summary, facs] = await Promise.all([
        apiFetch<AnalyticsSummary>('/api/analytics/summary', {}, false),
        apiFetch<Facility[]>('/api/facilities', {}, false),
      ]);
      setAnalytics(summary);
      setFacilities(facs);
    } catch (err) {
      console.error('Failed to load initial platform data:', err);
    }
  }, []);

  useEffect(() => {
    void loadPublicData();
  }, [loadPublicData]);

  // Tier 1 / Tier 2 Google Maps Demo Key Quota Exceeded listener
  useEffect(() => {
    const handler = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handler);
    return () => window.removeEventListener('gmp-quota-exceeded', handler);
  }, []);

  const handleOpenAuth = (mode: AuthMode = 'signin') => {
    setInDashboard(false);
    setAuthInitialMode(mode);
    setRoute('auth');
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenDashboard = () => {
    if (isAuthenticated) {
      setInDashboard(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      handleOpenAuth('signin');
    }
  };

  const handleNavigate = (target: PublicRoute) => {
    setInDashboard(false);
    setRoute(target);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleGlobalSearchSelect = (selection: GlobalSearchSelection) => {
    setInDashboard(false);
    setMobileMenuOpen(false);

    if (selection.type === 'facility') {
      setSearchFacilityId(selection.facility.id);
      setSearchCategoryFilter('all');
      setSearchCityQuery('');
      setCentresFilterVersion((v) => v + 1);
      setRoute('centres');
    } else if (selection.type === 'category') {
      setSearchFacilityId(null);
      setSearchCategoryFilter(selection.category.filterValue);
      setSearchCityQuery('');
      setCentresFilterVersion((v) => v + 1);
      setRoute('centres');
    } else if (selection.type === 'centres-query') {
      setSearchFacilityId(null);
      setSearchCategoryFilter('all');
      setSearchCityQuery(selection.query);
      setCentresFilterVersion((v) => v + 1);
      setRoute('centres');
    } else if (selection.type === 'knowledge') {
      setKnowledgeQuery(selection.topic.query);
      setKnowledgeSearchNonce((n) => n + 1);
      setRoute('knowledge');
    } else if (selection.type === 'knowledge-query') {
      setKnowledgeQuery(selection.query);
      setKnowledgeSearchNonce((n) => n + 1);
      setRoute('knowledge');
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAuthSuccess = () => {
    setRoute('home');
    setInDashboard(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleQuickTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const navLinks: { id: PublicRoute; label: string }[] = [
    { id: 'home', label: 'Home' },
    { id: 'centres', label: 'Find Centres' },
    { id: 'optimizer', label: 'Optimizer' },
    { id: 'scenes', label: '3D Scenes' },
    { id: 'knowledge', label: 'Knowledge Hub' },
    { id: 'about', label: 'About' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#EFF7FF] dark:bg-[#040E1A] text-slate-900 dark:text-sky-50 transition-colors">
      {/* Mandatory Google Maps Demo Key Quota Exceeded Sticky Banner */}
      {mapsQuotaExceeded && (
        <div
          role="alert"
          className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm"
        >
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href={QUOTA_DOC_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Strict 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-40 h-16 border-b border-sky-200/80 dark:border-sky-900/60 bg-sky-50/88 dark:bg-[#040E1A]/88 backdrop-blur-lg shadow-[0_1px_12px_-4px_rgba(14,165,233,0.14)] dark:shadow-[0_1px_16px_-4px_rgba(2,132,199,0.22)]">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          {/* Zone 1: Brand Wordmark with Subtle Emblem */}
          <button
            type="button"
            onClick={() => handleNavigate('home')}
            className="group inline-flex items-center gap-2.5 text-slate-900 dark:text-sky-50 font-display text-lg font-bold tracking-tight whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-900/60 border border-sky-200/90 dark:border-sky-800/80 flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
              <Recycle className="w-4 h-4 text-sky-600 dark:text-sky-400 transition-transform duration-300 group-hover:rotate-45" />
            </span>
            <span>Reboot Earth</span>
          </button>

          {/* Zone 2: Clean Single-Line Nav Links with Active Indicator */}
          <nav className="hidden md:flex items-center gap-1 lg:gap-2">
            {navLinks.map((item) => {
              const active = !inDashboard && route === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavigate(item.id)}
                  className={`relative px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-150 cursor-pointer ${
                    active
                      ? 'text-sky-700 dark:text-sky-300 bg-sky-100/75 dark:bg-sky-900/45'
                      : 'text-slate-600 dark:text-sky-100/75 hover:text-slate-900 dark:hover:text-white hover:bg-sky-100/45 dark:hover:bg-sky-900/25'
                  }`}
                >
                  {item.label}
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-3 -bottom-[11px] h-0.5 rounded-full bg-gradient-to-r from-sky-500 via-cyan-400 to-sky-500"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Global Search + Theme Toggle + Primary CTA */}
          <div className="flex items-center gap-2 shrink-0">
            <GlobalHeaderSearch
              facilities={facilities}
              onSelect={handleGlobalSearchSelect}
            />

            <button
              type="button"
              onClick={toggleQuickTheme}
              aria-label="Toggle dark or light theme"
              className="p-2 rounded-lg border border-transparent hover:border-sky-200/80 dark:hover:border-sky-800/80 text-slate-600 dark:text-sky-200/80 hover:bg-white/80 dark:hover:bg-sky-900/40 transition-all duration-150 cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={handleOpenDashboard}
              className="px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 hover:bg-sky-700 dark:hover:bg-sky-400 shadow-sm hover:shadow-md hover:shadow-sky-600/25 transition-all duration-150 hover:-translate-y-0.5 active:translate-y-0 whitespace-nowrap cursor-pointer"
            >
              {isAuthenticated
                ? inDashboard
                  ? 'Dashboard Active'
                  : 'Open Dashboard'
                : route === 'auth'
                  ? 'Sign In / Register'
                  : 'Sign In'}
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle menu"
              className="md:hidden p-2 rounded-lg text-slate-700 dark:text-sky-100 hover:bg-sky-100/70 dark:hover:bg-sky-900/40 transition-colors cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Nav Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-sky-200 dark:border-sky-900 bg-sky-50/95 dark:bg-[#071A2E]/95 backdrop-blur-lg px-4 py-3 space-y-1 shadow-lg">
            {navLinks.map((item) => {
              const active = !inDashboard && route === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavigate(item.id)}
                  className={`block w-full text-left px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-sky-100 dark:bg-sky-900/60 text-sky-800 dark:text-sky-200'
                      : 'text-slate-700 dark:text-sky-100 hover:bg-sky-100/70 dark:hover:bg-sky-900/40'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        )}
      </header>

      {/* Main Content Switch */}
      <div className="relative z-10 flex-1">
        {inDashboard && isAuthenticated ? (
          <DashboardShell
            analytics={analytics}
            facilities={facilities}
            onRefreshGlobal={() => void loadPublicData()}
            onExitDashboard={() => setInDashboard(false)}
          />
        ) : (
          <>
            {route === 'auth' && (
              <AuthPage
                initialMode={authInitialMode}
                analytics={analytics}
                onSuccess={handleAuthSuccess}
                onBackHome={() => handleNavigate('home')}
              />
            )}
            {route === 'home' && (
              <HomePage
                analytics={analytics}
                onNavigate={handleNavigate}
                onOpenDashboard={handleOpenDashboard}
              />
            )}

            {route === 'centres' && (
              <div className="relative">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-sky-200/40 via-sky-100/20 to-transparent dark:from-sky-900/25 dark:via-sky-950/10 dark:to-transparent"
                />
                <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-6">
                  <div className="space-y-2.5 max-w-3xl">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700 dark:text-sky-400">
                      Geospatial Facility Network
                    </p>
                    <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-sky-50">
                      Find Verified E-Waste Collection Centres
                    </h1>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-sky-100/80 leading-relaxed">
                      Explore registered partner centres, calculate road routes, search live Google Maps places, or query Gemini with real-time Google Maps grounding.
                    </p>
                  </div>
                  <FacilityMap
                    facilities={facilities}
                    selectedFacilityId={searchFacilityId}
                    initialCategoryFilter={searchCategoryFilter}
                    initialSearchQuery={searchCityQuery}
                    filterVersion={centresFilterVersion}
                  />
                </div>
              </div>
            )}

            {route === 'optimizer' && (
              <div className="relative">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-sky-200/40 via-sky-100/20 to-transparent dark:from-sky-900/25 dark:via-sky-950/10 dark:to-transparent"
                />
                <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-6">
                  <div className="space-y-2.5 max-w-3xl">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700 dark:text-sky-400">
                      Intelligent Reverse Logistics
                    </p>
                    <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-sky-50">
                      Smart E-Waste Route &amp; Emission Optimizer
                    </h1>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-sky-100/80 leading-relaxed">
                      Test real-time multi-objective vehicle routing against active pickup requests. Sign in to save optimization runs, approve dispatch plans, and export to Google Drive.
                    </p>
                  </div>
                  <OptimizerStudio compact={!isAuthenticated} />
                </div>
              </div>
            )}

            {route === 'scenes' && <ScenesStudio />}

            {route === 'knowledge' && (
              <KnowledgeHubPage
                initialQuery={knowledgeQuery || undefined}
                searchNonce={knowledgeSearchNonce}
              />
            )}

            {(route === 'about' || route === 'legal') && (
              <AboutAndLegalPage section={route} />
            )}
          </>
        )}
      </div>

      {/* Professional Footer */}
      {!inDashboard && route !== 'auth' && route !== 'scenes' && (
        <footer className="relative border-t border-sky-200/80 dark:border-sky-900/60 bg-gradient-to-b from-sky-100/65 to-sky-100/35 dark:from-[#061526] dark:to-[#040E1A]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid grid-cols-1 md:grid-cols-12 gap-8">
            <div className="md:col-span-5 space-y-3">
              <div className="inline-flex items-center gap-2.5 font-display text-lg font-bold text-slate-900 dark:text-sky-50">
                <span className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-900/60 border border-sky-200/80 dark:border-sky-800/70 flex items-center justify-center">
                  <Recycle className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                </span>
                Reboot Earth
              </div>
              <p className="text-xs text-slate-600 dark:text-sky-200/75 max-w-sm leading-relaxed">
                Recycle Technology. Restart Tomorrow. Intelligent e-waste collection, multi-objective route optimization, and verified material recovery analytics.
              </p>
            </div>
            <div className="md:col-span-3 space-y-2.5 text-xs">
              <p className="font-semibold uppercase tracking-wider text-[11px] text-slate-900 dark:text-sky-100">
                Platform
              </p>
              <ul className="space-y-2 text-slate-600 dark:text-sky-200/75">
                <li>
                  <button
                    type="button"
                    onClick={() => handleNavigate('centres')}
                    className="hover:text-sky-700 dark:hover:text-sky-300 transition-colors cursor-pointer"
                  >
                    Find Collection Centres
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => handleNavigate('optimizer')}
                    className="hover:text-sky-700 dark:hover:text-sky-300 transition-colors cursor-pointer"
                  >
                    Smart Logistics Optimizer
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => handleNavigate('scenes')}
                    className="hover:text-sky-700 dark:hover:text-sky-300 transition-colors cursor-pointer"
                  >
                    3D Scenes Studio
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => handleNavigate('knowledge')}
                    className="hover:text-sky-700 dark:hover:text-sky-300 transition-colors cursor-pointer"
                  >
                    India E-Waste Rules 2022
                  </button>
                </li>
              </ul>
            </div>
            <div className="md:col-span-4 space-y-2.5 text-xs">
              <p className="font-semibold uppercase tracking-wider text-[11px] text-slate-900 dark:text-sky-100">
                Governance &amp; Legal
              </p>
              <ul className="space-y-2 text-slate-600 dark:text-sky-200/75">
                <li>
                  <button
                    type="button"
                    onClick={() => handleNavigate('about')}
                    className="hover:text-sky-700 dark:hover:text-sky-300 transition-colors cursor-pointer"
                  >
                    About Reboot Earth
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => handleNavigate('legal')}
                    className="hover:text-sky-700 dark:hover:text-sky-300 transition-colors cursor-pointer"
                  >
                    Privacy Policy &amp; Terms of Service
                  </button>
                </li>
                <li>
                  <a
                    href="https://www.google.com/intl/en_us/help/terms_maps/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-sky-700 dark:hover:text-sky-300 transition-colors"
                  >
                    Google Maps Additional Terms
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-sky-200/80 dark:border-sky-900/50 py-4 px-4 text-center text-[11px] text-slate-600 dark:text-sky-200/60">
            © {new Date().getFullYear()} Reboot Earth · Operational recycling records do not replace statutory CPCB EPR certificates.
          </div>
        </footer>
      )}

      {/* Floating EcoBot AI Assistant */}
      {route !== 'scenes' && <EcoBotWidget />}
    </div>
  );
}
