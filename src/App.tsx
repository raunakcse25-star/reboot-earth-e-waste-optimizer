import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Menu, Moon, Recycle, Sun, X } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './lib/api';
import type { AnalyticsSummary, Facility } from './types';
import { AboutAndLegalPage, HomePage, KnowledgeHubPage, type PublicRoute } from './components/PublicPages';
import { FacilityMap } from './components/FacilityMap';
import { OptimizerStudio } from './components/OptimizerStudio';
import { DashboardShell } from './components/DashboardShell';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { EcoBotWidget } from './components/EcoBotWidget';

const QUOTA_DOC_URL =
  'https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors';

export default function App() {
  const { firebaseUser, signingIn, authError, theme, setTheme, signInWithGoogle } = useAuth();
  const [route, setRoute] = useState<PublicRoute>('home');
  const [inDashboard, setInDashboard] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);

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

  const handleOpenDashboard = () => {
    if (firebaseUser) {
      setInDashboard(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setAuthModalOpen(true);
    }
  };

  const handleNavigate = (target: PublicRoute) => {
    setInDashboard(false);
    setRoute(target);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithGoogle();
      setAuthModalOpen(false);
      setInDashboard(true);
    } catch {
      // Error surfaced via authError
    }
  };

  const toggleQuickTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const navLinks: { id: PublicRoute; label: string }[] = [
    { id: 'home', label: 'Home' },
    { id: 'centres', label: 'Find Centres' },
    { id: 'optimizer', label: 'Optimizer' },
    { id: 'knowledge', label: 'Knowledge Hub' },
    { id: 'about', label: 'About' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#04100C] text-slate-900 dark:text-emerald-50 transition-colors">
      {/* Mandatory Google Maps Demo Key Quota Exceeded Sticky Banner */}
      {mapsQuotaExceeded && (
        <div
          role="alert"
          className="sticky top-0 z-50 bg-amber-500 text-slate-950 px-4 py-2.5 text-xs font-medium flex flex-wrap items-center justify-center gap-x-3 gap-y-1 shadow-md"
        >
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Google Maps API quota exceeded for the demo key.
          </span>
          <a
            href={QUOTA_DOC_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-bold"
          >
            Learn how to configure your own Maps API key →
          </a>
        </div>
      )}

      {/* Strict 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-40 h-16 border-b border-slate-200/80 dark:border-emerald-900/60 bg-white/90 dark:bg-[#04100C]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          {/* Zone 1: Single-Element Brand Wordmark */}
          <button
            type="button"
            onClick={() => handleNavigate('home')}
            className="inline-flex items-center gap-2 text-slate-900 dark:text-emerald-50 font-display text-lg font-bold tracking-tight whitespace-nowrap shrink-0"
          >
            <Recycle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>Reboot Earth</span>
          </button>

          {/* Zone 2: Clean Single-Line Nav Links */}
          <nav className="hidden md:flex items-center gap-7">
            {navLinks.map((item) => {
              const active = !inDashboard && route === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavigate(item.id)}
                  className={`text-sm font-medium whitespace-nowrap transition-colors ${
                    active
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-slate-600 dark:text-emerald-100/75 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Theme Toggle + Primary CTA */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={toggleQuickTheme}
              aria-label="Toggle dark or light theme"
              className="p-2 rounded-lg text-slate-600 dark:text-emerald-200/80 hover:bg-slate-100 dark:hover:bg-emerald-900/40 transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={handleOpenDashboard}
              className="px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950 hover:bg-emerald-700 dark:hover:bg-emerald-400 transition-colors whitespace-nowrap"
            >
              {firebaseUser ? (inDashboard ? 'Dashboard Active' : 'Open Dashboard') : 'Sign In'}
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle menu"
              className="md:hidden p-2 rounded-lg text-slate-700 dark:text-emerald-100"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Nav Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#061812] px-4 py-3 space-y-1">
            {navLinks.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                className="block w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-emerald-100 hover:bg-slate-100 dark:hover:bg-emerald-900/40"
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Main Content Switch */}
      <div className="flex-1">
        {inDashboard && firebaseUser ? (
          <DashboardShell
            analytics={analytics}
            facilities={facilities}
            onRefreshGlobal={() => void loadPublicData()}
            onExitDashboard={() => setInDashboard(false)}
          />
        ) : (
          <>
            {route === 'home' && (
              <HomePage
                analytics={analytics}
                onNavigate={handleNavigate}
                onOpenDashboard={handleOpenDashboard}
              />
            )}

            {route === 'centres' && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-6">
                <div className="space-y-2 max-w-3xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">
                    Geospatial Facility Network
                  </p>
                  <h1 className="font-display text-3xl sm:text-4xl font-bold text-slate-900 dark:text-emerald-50">
                    Find Verified E-Waste Collection Centres
                  </h1>
                  <p className="text-sm text-slate-600 dark:text-emerald-100/80">
                    Explore registered partner centres, calculate road routes, search live Google Maps places, or query Gemini with real-time Google Maps grounding.
                  </p>
                </div>
                <FacilityMap facilities={facilities} />
              </div>
            )}

            {route === 'optimizer' && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-6">
                <div className="space-y-2 max-w-3xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">
                    Intelligent Reverse Logistics
                  </p>
                  <h1 className="font-display text-3xl sm:text-4xl font-bold text-slate-900 dark:text-emerald-50">
                    Smart E-Waste Route &amp; Emission Optimizer
                  </h1>
                  <p className="text-sm text-slate-600 dark:text-emerald-100/80">
                    Test real-time multi-objective vehicle routing against active pickup requests. Sign in to save optimization runs, approve dispatch plans, and export to Google Drive.
                  </p>
                </div>
                <OptimizerStudio compact={!firebaseUser} />
              </div>
            )}

            {route === 'knowledge' && <KnowledgeHubPage />}

            {(route === 'about' || route === 'legal') && (
              <AboutAndLegalPage section={route} />
            )}
          </>
        )}
      </div>

      {/* Professional Footer */}
      {!inDashboard && (
        <footer className="border-t border-slate-200 dark:border-emerald-900/60 bg-slate-50 dark:bg-[#05140F]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid grid-cols-1 md:grid-cols-12 gap-8">
            <div className="md:col-span-5 space-y-3">
              <div className="inline-flex items-center gap-2 font-display text-lg font-bold text-slate-900 dark:text-emerald-50">
                <Recycle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                Reboot Earth
              </div>
              <p className="text-xs text-slate-600 dark:text-emerald-200/70 max-w-sm leading-relaxed">
                Recycle Technology. Restart Tomorrow. Intelligent e-waste collection, multi-objective route optimization, and verified material recovery analytics.
              </p>
            </div>
            <div className="md:col-span-3 space-y-2 text-xs">
              <p className="font-semibold text-slate-900 dark:text-emerald-50">Platform</p>
              <ul className="space-y-1.5 text-slate-600 dark:text-emerald-200/70">
                <li>
                  <button type="button" onClick={() => handleNavigate('centres')} className="hover:underline">
                    Find Collection Centres
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => handleNavigate('optimizer')} className="hover:underline">
                    Smart Logistics Optimizer
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => handleNavigate('knowledge')} className="hover:underline">
                    India E-Waste Rules 2022
                  </button>
                </li>
              </ul>
            </div>
            <div className="md:col-span-4 space-y-2 text-xs">
              <p className="font-semibold text-slate-900 dark:text-emerald-50">Governance &amp; Legal</p>
              <ul className="space-y-1.5 text-slate-600 dark:text-emerald-200/70">
                <li>
                  <button type="button" onClick={() => handleNavigate('about')} className="hover:underline">
                    About Reboot Earth
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => handleNavigate('legal')} className="hover:underline">
                    Privacy Policy &amp; Terms of Service
                  </button>
                </li>
                <li>
                  <a
                    href="https://www.google.com/intl/en_us/help/terms_maps/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    Google Maps Additional Terms
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-200 dark:border-emerald-900/50 py-4 text-center text-[11px] text-slate-500 dark:text-emerald-200/55">
            © {new Date().getFullYear()} Reboot Earth · Operational recycling records do not replace statutory CPCB EPR certificates.
          </div>
        </footer>
      )}

      {/* Sign-In Modal */}
      {authModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-emerald-800 bg-white dark:bg-[#081D16] p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-xl font-bold text-slate-900 dark:text-emerald-50">
                  Sign in to Reboot Earth
                </h3>
                <p className="text-xs text-slate-600 dark:text-emerald-200/75 mt-1">
                  Access your role-based dashboard, schedule pickups, run route optimizations, and connect Google Workspace tools.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAuthModalOpen(false)}
                className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex justify-center py-2">
              <GoogleSignInButton
                onClick={() => void handleGoogleLogin()}
                loading={signingIn}
                label="Continue with Google"
              />
            </div>

            {authError && (
              <p className="text-xs text-red-600 dark:text-red-400 text-center">{authError}</p>
            )}

            <p className="text-[11px] text-slate-500 dark:text-emerald-200/60 text-center leading-relaxed">
              New accounts start as Citizen / Individual. Organizations, Recyclers, Refurbishers, Transporters, and Producers can request verified role upgrades inside Profile Settings.
            </p>
          </div>
        </div>
      )}

      {/* Floating EcoBot AI Assistant */}
      <EcoBotWidget />
    </div>
  );
}
