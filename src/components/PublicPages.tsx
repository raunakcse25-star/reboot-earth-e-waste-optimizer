import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Cpu,
  ExternalLink,
  Factory,
  Globe,
  HardDrive,
  Leaf,
  Loader2,
  MapPin,
  Recycle,
  Route,
  Scale,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Truck,
  Zap,
} from 'lucide-react';
import { EarthCanvas } from './EarthCanvas';
import FluxLines from './FluxLines';
import ElectricBorder from './ElectricBorder';
import SpecularButton from './SpecularButton';
import AnimatedList, { type AnimatedListItem } from './AnimatedList';
import AnimatedContent from './AnimatedContent';
import { ImpactDashboard } from './ImpactDashboard';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import type { AnalyticsSummary } from '../types';

export type PublicRoute = 'home' | 'centres' | 'optimizer' | 'knowledge' | 'about' | 'legal';

interface HomePageProps {
  analytics: AnalyticsSummary | null;
  onNavigate: (route: PublicRoute) => void;
  onOpenDashboard: () => void;
}

const WORKFLOW_STEPS = [
  { step: '01', title: 'Identify', desc: 'Scan devices with AI vision or log weight and category.' },
  { step: '02', title: 'Collect', desc: 'Doorstep pickup or drop-off at verified partner centres.' },
  { step: '03', title: 'Track', desc: 'Audited 9-stage digital chain of custody with QR receipts.' },
  { step: '04', title: 'Optimize', desc: 'Capacity-aware VRP & 2-opt routing cuts distance and CO₂e.' },
  { step: '05', title: 'Transport', desc: 'EV & CNG fleet dispatch matched to compatible intake bays.' },
  { step: '06', title: 'Process', desc: 'Safe data wipe, battery quarantine, and component grading.' },
  { step: '07', title: 'Recycle', desc: 'Copper, aluminum, plastics, and precious metals recovered.' },
  { step: '08', title: 'Measure', desc: 'Live database ESG analytics and transparent impact reports.' },
];

const CATEGORY_CARDS = [
  {
    icon: Cpu,
    title: 'IT & Telecom Equipment',
    items: 'Laptops, servers, routers, switches, enterprise racks, monitors',
    hazard: 'Lead solder, brominated flame retardants, recoverable gold & copper',
  },
  {
    icon: Smartphone,
    title: 'Consumer Electronics',
    items: 'Smartphones, tablets, cameras, audio consoles, smart displays',
    hazard: 'Lithium-ion cells, cobalt, neodymium magnets, display glass',
  },
  {
    icon: Zap,
    title: 'Batteries & Power Systems',
    items: 'Li-ion packs, UPS inverters, sealed lead-acid, EV auxiliary cells',
    hazard: 'Thermal runaway risk — tape terminals & pack in dry sand/non-conductive wrap',
  },
  {
    icon: Factory,
    title: 'Large & Small Appliances',
    items: 'Refrigerators, ACs, microwaves, induction cooktops, laboratory gear',
    hazard: 'CFC/HFC refrigerants, compressor oils, high-grade steel & aluminum',
  },
  {
    icon: HardDrive,
    title: 'PCBs, Storage & Components',
    items: 'Motherboards, GPUs, SSDs/HDDs, industrial control boards',
    hazard: 'Requires physical shredding or NIST-aligned wiping before dismantling',
  },
  {
    icon: Globe,
    title: 'Solar & Clean Energy Hardware',
    items: 'End-of-life PV panels, micro-inverters, charge controllers',
    hazard: 'Silicon wafers, silver busbars, tempered glass & anodized frames',
  },
];

const FAQS = [
  {
    q: 'How is Reboot Earth connected to India E-Waste (Management) Rules, 2022?',
    a: 'Reboot Earth provides operational tracking, pickup management, inventory recovery logging, and transparent environmental impact estimation aligned with the workflows described in the E-Waste (Management) Rules, 2022. Official statutory EPR registrations, annual returns, and government EPR certificates must still be filed and issued solely through the Central Pollution Control Board (CPCB) EPR portal.',
  },
  {
    q: 'How does the Smart Logistics Optimizer calculate distance, cost, and emissions?',
    a: 'Our server-side optimizer groups compatible pickup requests by nearest verified facility with available weight capacity, assigns EV/CNG/diesel vehicles according to your chosen objective (Cost, Distance, or CO₂e Emissions), and runs 2-opt tour tightening. Distances use WGS-84 Haversine geodesic distance multiplied by a 1.28x urban road circuity factor, transparently disclosed on every optimization report.',
  },
  {
    q: 'What should I do before handing over a laptop, phone, or server?',
    a: 'Back up essential files, sign out of cloud locks (Apple Find My / Google FRP), and perform a factory reset or cryptographic wipe. Remove SIM and SD cards. If a battery is visibly swollen, never puncture or compress it—store it separately in a cool, dry non-metallic container and mention it in your pickup instructions.',
  },
  {
    q: 'How do organizations, recyclers, or transporters get privileged access?',
    a: 'Sign in with Google, open Profile & Role Settings in your Dashboard, and request an upgrade to Organization, Collection Centre, Recycler, Refurbisher, Transporter, or Producer. Platform administrators verify facility details and approve role upgrades through the audited governance panel.',
  },
];

export const HomePage: React.FC<HomePageProps> = ({
  analytics,
  onNavigate,
  onOpenDashboard,
}) => {
  const { theme } = useAuth();
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [selectedActivity, setSelectedActivity] = useState<string | null>(null);
  const [supportName, setSupportName] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [supportCategory, setSupportCategory] = useState('Bulk Pickup / Corporate');
  const [supportSubject, setSupportSubject] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [supportBusy, setSupportBusy] = useState(false);
  const [supportStatus, setSupportStatus] = useState<string | null>(null);

  const liveActivityItems: AnimatedListItem[] = [
    {
      title: 'Verified Collection Network',
      description: `${analytics?.verifiedFacilities ?? 4} CPCB-aligned partner centres active with community reviews`,
      meta: 'Explore Map',
    },
    {
      title: 'Smart Route & Emission Optimizer',
      description: 'Capacity-constrained EV/CNG fleet batching with 2-opt tour improvement',
      meta: 'Run VRP',
    },
    {
      title: 'Material Recovery Accounting',
      description: `${analytics?.recoveredCopperKg ?? 98.3} kg copper · ${analytics?.recoveredPreciousGrams ?? 56.3} g precious metals recovered`,
      meta: 'View Rules',
    },
    {
      title: 'Doorstep AI Pickup & QR Receipts',
      description: `${analytics?.totalCollectedKg.toLocaleString() ?? '599'} kg tracked across audited chain-of-custody stages`,
      meta: 'Schedule',
    },
  ];

  const handleActivitySelect = (item: AnimatedListItem, index: number) => {
    setSelectedActivity(`Selected: ${item.title}`);
    if (index === 0) onNavigate('centres');
    else if (index === 1) onNavigate('optimizer');
    else if (index === 2) onNavigate('knowledge');
    else onOpenDashboard();
  };

  const handleSupportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSupportBusy(true);
    setSupportStatus(null);
    try {
      await apiFetch(
        '/api/support',
        {
          method: 'POST',
          body: JSON.stringify({
            name: supportName,
            email: supportEmail,
            category: supportCategory,
            subject: supportSubject,
            message: supportMessage,
          }),
        },
        false
      );
      setSupportStatus('Thank you. Your inquiry has been logged in our support queue.');
      setSupportName('');
      setSupportEmail('');
      setSupportSubject('');
      setSupportMessage('');
    } catch (err: any) {
      setSupportStatus(err?.message || 'Unable to send inquiry right now.');
    } finally {
      setSupportBusy(false);
    }
  };

  return (
    <div className="space-y-24 pb-20">
      {/* 1. Asymmetric Hero Section with 3D Earth over Global DotGrid */}
      <section className="relative overflow-hidden min-h-[600px] flex items-center pt-8 lg:pt-12 pb-8">
        <div className="relative z-10 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55 }}
              className="lg:col-span-6 flex flex-col justify-center space-y-6 py-4"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700 dark:text-sky-400">
                Intelligent E-Waste Logistics &amp; Recovery Network
              </p>

              <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-tight leading-[1.08] text-slate-900 dark:text-sky-50">
                Recycle Technology. Restart Tomorrow.
              </h1>

              <p className="text-base sm:text-lg text-slate-700 dark:text-sky-100/85 leading-relaxed max-w-xl">
                Reboot Earth connects households, enterprises, verified recyclers, and low-emission fleets on one auditable platform—from AI-assisted pickup scheduling to 2-opt route optimization and material recovery analytics.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={onOpenDashboard}
                  className="px-6 py-3.5 rounded-lg text-sm font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 hover:bg-sky-700 dark:hover:bg-sky-400 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-sky-600/25 inline-flex items-center gap-2 cursor-pointer"
                >
                  Schedule E-Waste Pickup
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('centres')}
                  className="px-5 py-3.5 rounded-lg text-sm font-semibold border border-sky-300/90 dark:border-sky-800 bg-white/80 dark:bg-[#0B223B]/80 backdrop-blur-sm text-slate-800 dark:text-sky-100 hover:bg-white dark:hover:bg-sky-900/50 transition-all duration-200 hover:-translate-y-0.5 inline-flex items-center gap-2 cursor-pointer"
                >
                  <MapPin className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  Find Collection Centres
                </button>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.65, delay: 0.1 }}
              className="lg:col-span-6 min-h-[400px] lg:min-h-[470px]"
            >
              <EarthCanvas className="w-full h-full min-h-[400px] lg:min-h-[470px]" />
            </motion.div>
          </div>
        </div>
      </section>

      {/* 2. Live Environmental Impact Dashboard (Recycled, CO2 Saved, Energy Recovered) */}
      <ImpactDashboard
        analytics={analytics}
        onExploreOptimizer={() => onNavigate('optimizer')}
        onSchedulePickup={onOpenDashboard}
      />

      {/* 2.5. Interactive FluxLines + ElectricBorder + SpecularButton + AnimatedList Showcase */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <div
          style={{ width: '100%', height: '600px', position: 'relative' }}
          className="rounded-3xl overflow-hidden border border-slate-200 dark:border-sky-900/70"
        >
          <FluxLines
            colors={['#bae6fd', '#38bdf8', '#e0f2fe']}
            glow={2}
            rimWidth={0.2}
            lineWidth={1}
            flowDirection="down"
            mouseInteraction
            clickSwirl
          />

          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-6 sm:p-10 bg-gradient-to-t from-[#040E1A]/90 via-[#040E1A]/35 to-transparent">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-mono uppercase tracking-[0.22em] text-sky-300/90">
                Interactive Circular Flow Field
              </span>
              <span className="text-[11px] font-mono text-white/75 hidden sm:inline">
                Move cursor to bend streams · Click to trigger swirl
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
              <div className="lg:col-span-7 space-y-4">
                <AnimatedContent
                  distance={100}
                  direction="vertical"
                  duration={0.8}
                  ease="power3.out"
                  blur={0}
                  stagger={0.08}
                  threshold={0.1}
                >
                  <h2 className="font-display text-3xl sm:text-4xl font-bold text-white leading-tight">
                    Real-Time Reverse Logistics Built for Zero-Landfill Electronics
                  </h2>
                  <p className="text-sm sm:text-base text-sky-100/85 max-w-xl leading-relaxed mt-3">
                    Every pickup, route optimization run, and verified community review strengthens India&apos;s formal e-waste recovery ecosystem.
                  </p>
                </AnimatedContent>

                <div className="pointer-events-auto pt-2 flex flex-wrap items-center gap-4">
                  <SpecularButton
                    size="md"
                    radius={18}
                    tint="#0EA5E9"
                    tintOpacity={0.2}
                    blur={10}
                    textColor="#f5f5f5"
                    lineColor="#7df9ff"
                    baseColor="#1E4D7B"
                    onClick={onOpenDashboard}
                  >
                    Launch Operations Portal
                    <ArrowRight className="w-4 h-4" />
                  </SpecularButton>
                </div>
              </div>

              <div className="lg:col-span-5 flex justify-start lg:justify-end pointer-events-auto">
                <ElectricBorder
                  color="#7df9ff"
                  speed={1}
                  chaos={0.5}
                  spread={0.6}
                  strands={3}
                  thickness={1.5}
                  borderRadius={24}
                >
                  <div
                    style={{ width: 300, height: 360, borderRadius: 24 }}
                    className="bg-[#071A2E]/90 backdrop-blur-md p-6 flex flex-col justify-between text-sky-50"
                  >
                    <div className="space-y-2">
                      <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300">
                        Live Recovery Core
                      </p>
                      <h3 className="font-display text-2xl font-bold leading-snug">
                        {analytics ? `${analytics.landfillDiversionPct}%` : '95.1%'} Diverted
                      </h3>
                      <p className="text-xs text-sky-100/75 leading-relaxed">
                        High-purity copper, aluminum, and precious metals recovered across verified facilities with transparent CO₂e accounting.
                      </p>
                    </div>

                    <div className="space-y-2.5 pt-4 border-t border-sky-800/70 text-xs font-mono tabular-nums">
                      <div className="flex justify-between">
                        <span className="text-sky-200/70">CO₂e Avoided</span>
                        <span className="text-cyan-300 font-semibold">
                          {analytics ? `${analytics.estimatedCo2AvoidedKg.toLocaleString()} kg` : '1,826.6 kg'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sky-200/70">Refurbished</span>
                        <span className="text-sky-300 font-semibold">
                          {analytics?.reusableDevices ?? 43} units
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sky-200/70">Verified Hubs</span>
                        <span className="text-white font-semibold">
                          {analytics?.verifiedFacilities ?? 4} active
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onNavigate('centres')}
                      className="w-full py-2.5 rounded-xl bg-cyan-400/15 hover:bg-cyan-400/25 border border-cyan-300/35 text-xs font-semibold text-cyan-200 transition-colors"
                    >
                      Rate Verified Centres →
                    </button>
                  </div>
                </ElectricBorder>
              </div>
            </div>
          </div>
        </div>

        {/* Interactive AnimatedList Command Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-5 space-y-3">
            <AnimatedContent
              distance={60}
              direction="vertical"
              duration={0.8}
              ease="power3.out"
              blur={0}
              stagger={0.08}
              threshold={0.1}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-400">
                Quick Ecosystem Navigator
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-sky-50 mt-2">
                Jump Straight Into Live Operations
              </h2>
              <p className="text-sm text-slate-600 dark:text-sky-100/80 leading-relaxed mt-2">
                Use arrow keys or click any module below to explore verified collection centres, run route optimizations, review CPCB standards, or schedule a pickup.
              </p>
            </AnimatedContent>
            {selectedActivity && (
              <p className="text-xs font-mono text-sky-700 dark:text-sky-400">
                {selectedActivity}
              </p>
            )}
          </div>
          <div className="lg:col-span-7">
            <AnimatedList
              items={liveActivityItems}
              onItemSelect={handleActivitySelect}
              animation="pop"
              theme={theme === 'light' ? 'light' : 'dark'}
            />
          </div>
        </div>
      </section>

      {/* 3. Editorial Platform Overview + Generated Visual */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-6">
            <img
              src="/src/assets/images/facility_recycling_hub_1795259315861.jpg"
              alt="Clean modern electronic waste dismantling and sorting facility"
              referrerPolicy="no-referrer"
              className="w-full aspect-video object-cover rounded-2xl border border-slate-200 dark:border-sky-900/60"
            />
          </div>
          <div className="lg:col-span-6 space-y-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-400">
              Built for Circular Infrastructure
            </p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-sky-50">
              Give Every Circuit Board a Traceable Second Life.
            </h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-sky-100/80 leading-relaxed">
              Informal burning and landfill dumping destroy critical metals while releasing toxic heavy metals into urban soil and groundwater. Reboot Earth digitizes the entire reverse-logistics chain—uniting citizens, bulk IT consumers, collection centres, recyclers, refurbishers, transporters, producers, and administrators in one role-secured workspace.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-sky-50 inline-flex items-center gap-2">
                  <Route className="w-4 h-4 text-sky-500" />
                  Multi-Objective VRP Optimizer
                </h3>
                <p className="text-xs text-slate-600 dark:text-sky-200/70 leading-relaxed">
                  Balance INR dispatch cost, road kilometers, and fleet CO₂e emissions with real capacity constraints.
                </p>
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-sky-50 inline-flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-sky-500" />
                  Role-Gated Auditability
                </h3>
                <p className="text-xs text-slate-600 dark:text-sky-200/70 leading-relaxed">
                  Every facility approval, pickup transition, and recovery batch is recorded with actor attribution.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Asymmetric Services Bento Showcase */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-400">
              Platform Capabilities
            </p>
            <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-sky-50">
              End-to-End Tools for Every Role in the E-Waste Ecosystem
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('optimizer')}
            className="text-sm font-semibold text-sky-700 dark:text-sky-400 hover:underline inline-flex items-center gap-1.5 self-start md:self-auto"
          >
            Try Live Smart Optimizer
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] overflow-hidden flex flex-col">
            <img
              src="/src/assets/images/refurbishment_lab_1795259340405.jpg"
              alt="Certified electronics refurbishment and diagnostics laboratory"
              referrerPolicy="no-referrer"
              className="w-full h-64 object-cover"
            />
            <div className="p-6 space-y-2.5 flex-1 flex flex-col justify-between">
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-slate-900 dark:text-sky-50">
                  AI Device Scanning &amp; Doorstep Pickup Workflows
                </h3>
                <p className="text-sm text-slate-600 dark:text-sky-100/80 leading-relaxed">
                  Photograph discarded laptops, routers, or appliances to auto-classify e-waste category, estimate weight, flag lithium battery hazards, and schedule verified doorstep pickups with printable QR tracking receipts.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenDashboard}
                className="text-xs font-semibold text-sky-700 dark:text-sky-400 inline-flex items-center gap-1 pt-2 hover:underline"
              >
                Open Pickup Manager <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] overflow-hidden flex flex-col">
            <img
              src="/src/assets/images/material_recovery_macro_1795259341769.jpg"
              alt="Recovered copper, aluminum, and circuit board materials"
              referrerPolicy="no-referrer"
              className="w-full h-64 object-cover"
            />
            <div className="p-6 space-y-2.5 flex-1 flex flex-col justify-between">
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-slate-900 dark:text-sky-50">
                  Precision Material Recovery Accounting
                </h3>
                <p className="text-sm text-slate-600 dark:text-sky-100/80 leading-relaxed">
                  Recyclers and refurbishers log batch-level outputs for copper, aluminum, industrial plastics, precious metals, and refurbished devices—feeding transparent ESG analytics and Google Drive exports.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('knowledge')}
                className="text-xs font-semibold text-sky-700 dark:text-sky-400 inline-flex items-center gap-1 pt-2 hover:underline"
              >
                Explore Recovery Guides &amp; Rules <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 5. 8-Step Circular Workflow */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="space-y-2 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-400">
            Core Workflow
          </p>
          <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-sky-50">
            Identify to Impact in Eight Audited Stages
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {WORKFLOW_STEPS.map((w) => (
            <div
              key={w.step}
              className="group relative overflow-hidden p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-2 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:border-sky-400/80 dark:hover:border-sky-500/70 hover:bg-sky-50/30 dark:hover:bg-[#102D4F] hover:shadow-[0_14px_30px_-14px_rgba(14,165,233,0.24)] dark:hover:shadow-[0_14px_30px_-14px_rgba(14,165,233,0.28)] cursor-default"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/80 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              />
              <span className="inline-block font-mono text-xs font-semibold text-sky-700 dark:text-sky-400 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-sky-600 dark:group-hover:text-sky-300">
                {w.step}
              </span>
              <h3 className="text-base font-bold text-slate-900 dark:text-sky-50 transition-colors duration-200 group-hover:text-sky-700 dark:group-hover:text-sky-300">
                {w.title}
              </h3>
              <p className="text-xs text-slate-600 dark:text-sky-200/75 leading-relaxed">{w.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 6. E-Waste Categories Accepted */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="space-y-2 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-400">
            E-Waste Streams
          </p>
          <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-sky-50">
            Supported Electronic Waste Categories
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {CATEGORY_CARDS.map((c) => {
            const Icon = c.icon;
            return (
              <div
                key={c.title}
                className="group relative overflow-hidden p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-2.5 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:border-sky-400/80 dark:hover:border-sky-500/70 hover:bg-sky-50/30 dark:hover:bg-[#102D4F] hover:shadow-[0_14px_30px_-14px_rgba(14,165,233,0.24)] dark:hover:shadow-[0_14px_30px_-14px_rgba(14,165,233,0.28)] cursor-default"
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/80 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                />
                <Icon className="w-5 h-5 text-sky-600 dark:text-sky-400 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110 group-hover:-rotate-3 group-hover:text-sky-500 dark:group-hover:text-sky-300" />
                <h3 className="text-base font-semibold text-slate-900 dark:text-sky-50 transition-colors duration-200 group-hover:text-sky-700 dark:group-hover:text-sky-300">
                  {c.title}
                </h3>
                <p className="text-xs text-slate-600 dark:text-sky-100/80">{c.items}</p>
                <p className="text-[11px] text-slate-500 dark:text-sky-200/65 pt-2 border-t border-slate-100 dark:border-sky-900/50 transition-colors duration-200 group-hover:border-sky-200/80 dark:group-hover:border-sky-800/70">
                  Handling note: {c.hazard}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* 7. FAQ & Direct Contact Support Split */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* FAQs */}
          <div className="lg:col-span-7 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-400">
              Frequently Asked Questions
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-sky-50">
              Clarity on Compliance, Routing &amp; Data Safety
            </h2>
            <div className="divide-y divide-slate-200 dark:divide-sky-900/60 border-y border-slate-200 dark:border-sky-900/60">
              {FAQS.map((item, idx) => {
                const isOpen = openFaq === idx;
                return (
                  <div key={idx} className="py-4">
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : idx)}
                      className="w-full flex items-center justify-between gap-4 text-left"
                    >
                      <span className="text-sm font-semibold text-slate-900 dark:text-sky-50">
                        {item.q}
                      </span>
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4 text-sky-500 shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                    </button>
                    {isOpen && (
                      <p className="mt-2.5 text-xs sm:text-sm text-slate-600 dark:text-sky-100/80 leading-relaxed">
                        {item.a}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Support / Contact Form */}
          <div className="lg:col-span-5">
            <form
              onSubmit={handleSupportSubmit}
              className="p-6 rounded-2xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-4 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:border-sky-400/75 dark:hover:border-sky-600/70 hover:shadow-[0_18px_38px_-18px_rgba(14,165,233,0.22)] dark:hover:shadow-[0_18px_38px_-18px_rgba(14,165,233,0.26)] focus-within:border-sky-500/80 dark:focus-within:border-sky-500/70 focus-within:shadow-[0_18px_38px_-18px_rgba(14,165,233,0.26)]"
            >
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-sky-50">
                  Contact &amp; Bulk Pickup Desk
                </h3>
                <p className="text-xs text-slate-600 dark:text-sky-200/70 mt-0.5">
                  Need corporate IT decommissioning, facility onboarding, or platform support?
                </p>
              </div>
              <input
                type="text"
                required
                value={supportName}
                onChange={(e) => setSupportName(e.target.value)}
                placeholder="Your Full Name"
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50 transition-all duration-150 hover:border-sky-400/80 dark:hover:border-sky-700 hover:bg-white dark:hover:bg-[#091F38] focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:bg-white dark:focus:bg-[#091F38]"
              />
              <input
                type="email"
                required
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
                placeholder="Work or Personal Email"
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50 transition-all duration-150 hover:border-sky-400/80 dark:hover:border-sky-700 hover:bg-white dark:hover:bg-[#091F38] focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:bg-white dark:focus:bg-[#091F38]"
              />
              <select
                value={supportCategory}
                onChange={(e) => setSupportCategory(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50 transition-all duration-150 hover:border-sky-400/80 dark:hover:border-sky-700 hover:bg-white dark:hover:bg-[#091F38] focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:bg-white dark:focus:bg-[#091F38] cursor-pointer"
              >
                <option>Bulk Pickup / Corporate</option>
                <option>Facility Onboarding</option>
                <option>Transporter Partnership</option>
                <option>General Support</option>
              </select>
              <input
                type="text"
                required
                value={supportSubject}
                onChange={(e) => setSupportSubject(e.target.value)}
                placeholder="Subject"
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50 transition-all duration-150 hover:border-sky-400/80 dark:hover:border-sky-700 hover:bg-white dark:hover:bg-[#091F38] focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:bg-white dark:focus:bg-[#091F38]"
              />
              <textarea
                rows={3}
                required
                value={supportMessage}
                onChange={(e) => setSupportMessage(e.target.value)}
                placeholder="Share your location, estimated weight, or inquiry..."
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50 transition-all duration-150 hover:border-sky-400/80 dark:hover:border-sky-700 hover:bg-white dark:hover:bg-[#091F38] focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:bg-white dark:focus:bg-[#091F38]"
              />
              {supportStatus && (
                <p className="text-xs font-medium text-sky-700 dark:text-sky-400">
                  {supportStatus}
                </p>
              )}
              <button
                type="submit"
                disabled={supportBusy}
                className="group w-full py-2.5 rounded-lg text-sm font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-sky-700 dark:hover:bg-sky-400 hover:shadow-lg hover:shadow-sky-600/25 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0 inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                {supportBusy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                )}
                Submit Support Request
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
};

/* -------------------- Knowledge Hub & India Regulations Page -------------------- */
export const KnowledgeHubPage: React.FC<{
  initialQuery?: string;
  searchNonce?: number;
}> = ({ initialQuery, searchNonce = 0 }) => {
  const [query, setQuery] = useState(
    initialQuery || 'India E-Waste Management Rules 2022 CPCB EPR targets for electronics producers'
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    answer: string;
    sources: { title: string; uri: string }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runLookup = useCallback(async (searchText: string) => {
    const cleaned = searchText.trim();
    if (!cleaned) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{
        answer?: string;
        summary?: string;
        sources?: { title: string; uri: string }[];
      }>(
        '/api/ai/regulations-search',
        { method: 'POST', body: JSON.stringify({ query: cleaned }) },
        false
      );
      const answerText = (res?.answer ?? res?.summary ?? '').trim();
      if (!answerText) {
        throw new Error('No regulatory summary was returned. Please try again.');
      }
      setResult({
        answer: answerText,
        sources: Array.isArray(res?.sources) ? res.sources : [],
      });
    } catch (err: any) {
      setError(err?.message || 'Unable to run Search-grounded regulation lookup.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (searchNonce > 0 && initialQuery && initialQuery.trim()) {
      setQuery(initialQuery);
      void runLookup(initialQuery);
    }
  }, [searchNonce, initialQuery, runLookup]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await runLookup(query);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
      <div className="space-y-3 max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-400">
          E-Waste Knowledge Centre &amp; Policy Reference
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-sky-50">
          India E-Waste (Management) Rules, 2022 &amp; Safe Handling
        </h1>
        <p className="text-sm sm:text-base text-slate-600 dark:text-sky-100/80 leading-relaxed">
          Understand Extended Producer Responsibility (EPR), safe storage of lithium batteries, and mandatory channelization through CPCB-registered recyclers.
        </p>
      </div>

      {/* Statutory Distinction Notice */}
      <div className="p-5 rounded-xl border border-sky-200/80 dark:border-sky-800/70 bg-sky-50/80 dark:bg-[#0B223B] space-y-2">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-sky-50 inline-flex items-center gap-2">
          <Scale className="w-4 h-4 text-sky-500" />
          Important Statutory Compliance Notice
        </h2>
        <p className="text-xs text-slate-600 dark:text-sky-200/75 leading-relaxed">
          Reboot Earth provides digital collection records, logistics optimization, and material recovery tracking to support responsible e-waste workflows. Reboot Earth is an independent software platform—not a government agency. Official EPR registrations, quarterly/annual returns, and statutory EPR certificates under India&apos;s E-Waste (Management) Rules, 2022 must be obtained directly from the Central Pollution Control Board (CPCB) portal.
        </p>
      </div>

      {/* Live Gemini Search-Grounded Regulatory Research */}
      <div className="p-6 rounded-2xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-sky-50 inline-flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-sky-500" />
            Live Regulatory &amp; Standards Lookup (Google Search Grounded)
          </h2>
          <p className="text-xs text-slate-600 dark:text-sky-200/70 mt-1">
            Query up-to-date CPCB notifications, EPR recycling percentage schedules, or battery safety guidelines with linked public web sources.
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2.5">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-sky-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50 transition-all duration-150 hover:border-sky-400/80 dark:hover:border-sky-700 hover:bg-white dark:hover:bg-[#091F38] focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:bg-white dark:focus:bg-[#091F38]"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-sky-700 dark:hover:bg-sky-400 hover:shadow-lg hover:shadow-sky-600/25 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0 inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Research Rules
          </button>
        </form>

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

        {result && (
          <div className="pt-4 border-t border-slate-200 dark:border-sky-900/50 space-y-4">
            <div className="text-sm text-slate-700 dark:text-sky-100/90 whitespace-pre-line leading-relaxed">
              {result.answer}
            </div>
            {Array.isArray(result.sources) && result.sources.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 dark:text-sky-300/80">
                  Cited Web Sources
                </p>
                <div className="flex flex-wrap gap-2">
                  {result.sources.map((s, idx) => (
                    <a
                      key={idx}
                      href={s.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-xs text-sky-700 dark:text-sky-300 transition-all duration-150 hover:-translate-y-0.5 hover:border-sky-500 hover:shadow-sm inline-flex items-center gap-1.5"
                    >
                      <span className="truncate max-w-[260px]">{s.title}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Key Regulatory Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="group relative overflow-hidden p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-2 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:border-sky-400/80 dark:hover:border-sky-500/70 hover:bg-sky-50/30 dark:hover:bg-[#102D4F] hover:shadow-[0_14px_30px_-14px_rgba(14,165,233,0.24)] dark:hover:shadow-[0_14px_30px_-14px_rgba(14,165,233,0.28)] cursor-default">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/80 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          />
          <Recycle className="w-5 h-5 text-sky-500 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110 group-hover:rotate-12" />
          <h3 className="text-base font-bold text-slate-900 dark:text-sky-50 transition-colors duration-200 group-hover:text-sky-700 dark:group-hover:text-sky-300">
            Extended Producer Responsibility
          </h3>
          <p className="text-xs text-slate-600 dark:text-sky-100/80 leading-relaxed">
            Manufacturers, producers, importers, and brand owners placing notified electrical and electronic equipment on the market must meet progressive annual recycling targets through registered recyclers.
          </p>
        </div>
        <div className="group relative overflow-hidden p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-2 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:border-sky-400/80 dark:hover:border-sky-500/70 hover:bg-sky-50/30 dark:hover:bg-[#102D4F] hover:shadow-[0_14px_30px_-14px_rgba(14,165,233,0.24)] dark:hover:shadow-[0_14px_30px_-14px_rgba(14,165,233,0.28)] cursor-default">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/80 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          />
          <ShieldCheck className="w-5 h-5 text-sky-500 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110 group-hover:-rotate-3" />
          <h3 className="text-base font-bold text-slate-900 dark:text-sky-50 transition-colors duration-200 group-hover:text-sky-700 dark:group-hover:text-sky-300">
            Bulk Consumer Obligations
          </h3>
          <p className="text-xs text-slate-600 dark:text-sky-100/80 leading-relaxed">
            Enterprises, hospitals, universities, and public offices must ensure e-waste generated on-site is handed over exclusively to registered producers, refurbishers, or authorized recyclers—never unorganized scrap dealers.
          </p>
        </div>
        <div className="group relative overflow-hidden p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-2 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:border-sky-400/80 dark:hover:border-sky-500/70 hover:bg-sky-50/30 dark:hover:bg-[#102D4F] hover:shadow-[0_14px_30px_-14px_rgba(14,165,233,0.24)] dark:hover:shadow-[0_14px_30px_-14px_rgba(14,165,233,0.28)] cursor-default">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/80 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          />
          <Leaf className="w-5 h-5 text-sky-500 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110 group-hover:-rotate-6" />
          <h3 className="text-base font-bold text-slate-900 dark:text-sky-50 transition-colors duration-200 group-hover:text-sky-700 dark:group-hover:text-sky-300">
            Battery &amp; Hazardous Safety
          </h3>
          <p className="text-xs text-slate-600 dark:text-sky-100/80 leading-relaxed">
            Never place lithium-ion batteries, CRT monitors, or fluorescent lamps into household municipal bins. Insulate battery terminals with non-conductive tape and keep damaged packs isolated from moisture and heat.
          </p>
        </div>
      </div>
    </div>
  );
};

/* -------------------- About, Privacy & Terms Page -------------------- */
export const AboutAndLegalPage: React.FC<{ section: 'about' | 'legal' }> = ({ section }) => {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
      {section === 'about' ? (
        <>
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-400">
              About Reboot Earth
            </p>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-slate-900 dark:text-sky-50">
              Engineering Trust &amp; Efficiency into Electronic Waste Recovery
            </h1>
            <p className="text-sm sm:text-base text-slate-600 dark:text-sky-100/80 leading-relaxed">
              Reboot Earth was created to bridge the operational gap between responsible device owners and verified recycling infrastructure. By combining Geospatial discovery, multi-objective vehicle route optimization, batch-level material recovery tracking, and practical AI assistance, we help communities divert hazardous electronics away from landfills while cutting avoidable fleet emissions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="group relative overflow-hidden p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-2 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:border-sky-400/80 dark:hover:border-sky-500/70 hover:bg-sky-50/30 dark:hover:bg-[#102D4F] hover:shadow-[0_14px_30px_-14px_rgba(14,165,233,0.24)] dark:hover:shadow-[0_14px_30px_-14px_rgba(14,165,233,0.28)] cursor-default">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/80 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              />
              <Truck className="w-5 h-5 text-sky-500 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110 group-hover:translate-x-0.5" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-sky-50 transition-colors duration-200 group-hover:text-sky-700 dark:group-hover:text-sky-300">
                Transparent Math
              </h3>
              <p className="text-xs text-slate-600 dark:text-sky-200/75 leading-relaxed">
                Every CO₂e saving, road circuity multiplier, and recovery yield is computed from actual database rows with disclosed assumptions.
              </p>
            </div>
            <div className="group relative overflow-hidden p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-2 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:border-sky-400/80 dark:hover:border-sky-500/70 hover:bg-sky-50/30 dark:hover:bg-[#102D4F] hover:shadow-[0_14px_30px_-14px_rgba(14,165,233,0.24)] dark:hover:shadow-[0_14px_30px_-14px_rgba(14,165,233,0.28)] cursor-default">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/80 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              />
              <ShieldCheck className="w-5 h-5 text-sky-500 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110 group-hover:-rotate-3" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-sky-50 transition-colors duration-200 group-hover:text-sky-700 dark:group-hover:text-sky-300">
                Zero-Trust Access
              </h3>
              <p className="text-xs text-slate-600 dark:text-sky-200/75 leading-relaxed">
                Eight distinct user roles enforce least-privilege access on both API endpoints and Firestore security rules.
              </p>
            </div>
            <div className="group relative overflow-hidden p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-2 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:border-sky-400/80 dark:hover:border-sky-500/70 hover:bg-sky-50/30 dark:hover:bg-[#102D4F] hover:shadow-[0_14px_30px_-14px_rgba(14,165,233,0.24)] dark:hover:shadow-[0_14px_30px_-14px_rgba(14,165,233,0.28)] cursor-default">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/80 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              />
              <Globe className="w-5 h-5 text-sky-500 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110 group-hover:rotate-12" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-sky-50 transition-colors duration-200 group-hover:text-sky-700 dark:group-hover:text-sky-300">
                Open Interoperability
              </h3>
              <p className="text-xs text-slate-600 dark:text-sky-200/75 leading-relaxed">
                Export optimization sheets, ESG analytics, and collection receipts to CSV, Print/PDF, Gmail, Google Drive, or Google Chat.
              </p>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-8">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-400">
              Legal &amp; Data Governance
            </p>
            <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-sky-50">
              Privacy Policy &amp; Terms of Service
            </h1>
          </div>

          <div className="space-y-4 text-sm text-slate-700 dark:text-sky-100/85 leading-relaxed">
            <h2 className="text-base font-bold text-slate-900 dark:text-sky-50">
              1. Data Collection &amp; Workspace Permissions
            </h2>
            <p>
              Reboot Earth stores your profile details, pickup requests, facility records, and inventory logs to operate e-waste collection and optimization workflows. When you connect Google Workspace permissions (Gmail, Google Drive, Google Chat, Contacts), OAuth access tokens remain strictly in browser memory for your active session and are never persisted to localStorage or server databases. Every outbound Workspace action requires explicit user confirmation.
            </p>

            <h2 className="text-base font-bold text-slate-900 dark:text-sky-50">
              2. Google Maps Platform Terms &amp; Privacy
            </h2>
            <p>
              Interactive maps, facility search, and route visualization are powered by Google Maps Platform. By using location features in Reboot Earth, you agree to be bound by the{' '}
              <a
                href="https://www.google.com/intl/en_us/help/terms_maps/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-700 dark:text-sky-400 underline"
              >
                Google Maps/Google Earth Additional Terms of Service
              </a>{' '}
              and the{' '}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-700 dark:text-sky-400 underline"
              >
                Google Privacy Policy
              </a>
              .
            </p>

            <h2 className="text-base font-bold text-slate-900 dark:text-sky-50">
              3. Statutory Regulatory Disclaimer
            </h2>
            <p>
              Platform receipts, CO₂e estimates, and environmental impact reports are informational operational records and do not replace government-issued CPCB/SPCB manifests or statutory EPR certificates.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
