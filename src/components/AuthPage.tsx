import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Factory,
  KeyRound,
  Leaf,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Truck,
  User,
} from 'lucide-react';
import { useAuth, type OnboardingRoleChoice } from '../context/AuthContext';
import { GoogleSignInButton } from './GoogleSignInButton';
import type { AnalyticsSummary } from '../types';

export type AuthMode = 'signin' | 'register';

interface AuthPageProps {
  initialMode?: AuthMode;
  analytics: AnalyticsSummary | null;
  onSuccess: () => void;
  onBackHome: () => void;
}

interface RoleCardOption {
  id: OnboardingRoleChoice;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  spotlightTitle: string;
  spotlightSummary: string;
  steps: { title: string; detail: string }[];
}

const ROLE_OPTIONS: RoleCardOption[] = [
  {
    id: 'citizen',
    title: 'Citizen',
    description: 'Request pickups and track your e-waste',
    icon: User,
    spotlightTitle: 'Effortless doorstep recycling for every household',
    spotlightSummary:
      'Log laptops, phones, or appliances in under a minute and follow every milestone from pickup to verified material recovery.',
    steps: [
      {
        title: '01. Book a pickup slot',
        detail: 'Select device category, weight estimate, and preferred time window.',
      },
      {
        title: '02. Follow live custody updates',
        detail: 'Receive transparent handoff updates from collection to processing.',
      },
      {
        title: '03. Measure your environmental impact',
        detail: 'Track copper, aluminum, and CO₂e diverted from landfill in your dashboard.',
      },
    ],
  },
  {
    id: 'collection_centre',
    title: 'Collection center',
    description: 'Receive and store waste from pickups',
    icon: Building2,
    spotlightTitle: 'Streamlined intake bays and storage orchestration',
    spotlightSummary:
      'Coordinate incoming household and bulk drop-offs, monitor bay capacity in real time, and log categorized e-waste batches.',
    steps: [
      {
        title: '01. Register intake capacity',
        detail: 'Publish accepted device categories, operating hours, and storage load.',
      },
      {
        title: '02. Receive and inspect batches',
        detail: 'Verify incoming pickup manifests and sort hazardous batteries safely.',
      },
      {
        title: '03. Dispatch to authorized recyclers',
        detail: 'Hand off consolidated loads to verified fleet partners on schedule.',
      },
    ],
  },
  {
    id: 'recycler',
    title: 'Recycler',
    description: 'Process waste and log recovered materials',
    icon: Factory,
    spotlightTitle: 'Precision material recovery and ESG audit trails',
    spotlightSummary:
      'Record dismantling stages, log recovered copper, aluminum, plastics, and precious metals, and publish verified diversion rates.',
    steps: [
      {
        title: '01. Ingest verified batches',
        detail: 'Accept incoming inventory manifests from collection centers across corridors.',
      },
      {
        title: '02. Log recovery yields',
        detail: 'Track copper, aluminum, plastics, precious grams, and reusable units.',
      },
      {
        title: '03. Generate audit-ready analytics',
        detail: 'Feed live recovery figures into compliance and sustainability reports.',
      },
    ],
  },
  {
    id: 'transporter',
    title: 'Transporter',
    description: 'Move waste between centers and recyclers',
    icon: Truck,
    spotlightTitle: 'Low-emission reverse logistics and route intelligence',
    spotlightSummary:
      'Optimize EV, CNG, and cargo fleet routes between pickup zones, collection hubs, and recycling plants to cut distance and emissions.',
    steps: [
      {
        title: '01. Register fleet vehicles',
        detail: 'Configure capacity, fuel profile, and emission factors for each vehicle.',
      },
      {
        title: '02. Run multi-objective routing',
        detail: 'Minimize cost, travel distance, or tailpipe CO₂e across assigned stops.',
      },
      {
        title: '03. Confirm digital chain of custody',
        detail: 'Update pickup and drop-off statuses cleanly from dispatch to delivery.',
      },
    ],
  },
];

function evaluatePasswordStrength(password: string): {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  barClass: string;
  textClass: string;
} {
  if (!password) {
    return {
      score: 0,
      label: 'At least 8 characters.',
      barClass: 'bg-slate-200 dark:bg-emerald-950',
      textClass: 'text-slate-500 dark:text-emerald-200/60',
    };
  }
  let points = 0;
  if (password.length >= 8) points += 1;
  if (password.length >= 12) points += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) points += 1;
  if (/[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)) points += 1;

  if (password.length < 8) {
    return {
      score: 1,
      label: 'Too short — use at least 8 characters.',
      barClass: 'bg-rose-500',
      textClass: 'text-rose-600 dark:text-rose-400',
    };
  }
  if (points <= 1) {
    return {
      score: 2,
      label: 'Fair — add uppercase letters or numbers.',
      barClass: 'bg-amber-500',
      textClass: 'text-amber-700 dark:text-amber-400',
    };
  }
  if (points === 2 || points === 3) {
    return {
      score: 3,
      label: 'Good password strength.',
      barClass: 'bg-teal-500',
      textClass: 'text-teal-700 dark:text-teal-300',
    };
  }
  return {
    score: 4,
    label: 'Strong password.',
    barClass: 'bg-emerald-600 dark:bg-emerald-400',
    textClass: 'text-emerald-700 dark:text-emerald-300',
  };
}

export const AuthPage: React.FC<AuthPageProps> = ({
  initialMode = 'signin',
  analytics,
  onSuccess,
  onBackHome,
}) => {
  const {
    signingIn,
    authError,
    clearAuthError,
    signInWithGoogle,
    signInWithEmail,
    registerWithEmail,
    sendPasswordReset,
  } = useAuth();

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [selectedRole, setSelectedRole] = useState<OnboardingRoleChoice>('citizen');

  // Shared & mode-specific form fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Local validation / feedback state
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Forgot password inline panel
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  const activeRoleMeta = useMemo(
    () => ROLE_OPTIONS.find((r) => r.id === selectedRole) || ROLE_OPTIONS[0],
    [selectedRole]
  );

  const strength = useMemo(() => evaluatePasswordStrength(password), [password]);

  const handleModeSwitch = (nextMode: AuthMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setLocalError(null);
    setSuccessMsg(null);
    setResetOpen(false);
    clearAuthError();
  };

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setSuccessMsg(null);
    clearAuthError();

    const cleanEmail = email.trim();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      setLocalError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setLocalError('Please enter your password.');
      return;
    }

    try {
      await signInWithEmail(cleanEmail, password);
      onSuccess();
    } catch {
      // Surfaced cleanly via authError
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setSuccessMsg(null);
    clearAuthError();

    const cleanName = fullName.trim();
    const cleanEmail = email.trim();
    if (cleanName.length < 2) {
      setLocalError('Please enter your full name (at least 2 characters).');
      return;
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      setLocalError('Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters long.');
      return;
    }

    try {
      await registerWithEmail({
        fullName: cleanName,
        email: cleanEmail,
        password,
        role: selectedRole,
      });
      onSuccess();
    } catch {
      // Surfaced cleanly via authError
    }
  };

  const handleGoogleContinue = async () => {
    setLocalError(null);
    setSuccessMsg(null);
    clearAuthError();
    try {
      await signInWithGoogle();
      onSuccess();
    } catch {
      // Surfaced via authError
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setSuccessMsg(null);
    const target = (resetEmail || email).trim();
    if (!target || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(target)) {
      setLocalError('Enter your account email to receive a password reset link.');
      return;
    }
    setResetBusy(true);
    try {
      await sendPasswordReset(target);
      setSuccessMsg(`Password reset instructions sent to ${target}. Check your inbox.`);
      setResetOpen(false);
    } catch (err: any) {
      setLocalError(err?.message || 'Unable to send reset email right now.');
    } finally {
      setResetBusy(false);
    }
  };

  const displayError = localError || authError;
  const ActiveRoleIcon = activeRoleMeta.icon;

  return (
    <section className="relative min-h-[calc(100vh-4rem)] w-full overflow-hidden bg-[#F7FCFA] dark:bg-[#041118] transition-colors">
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[calc(100vh-4rem)]">
        {/* LEFT DYNAMIC SHOWCASE PANEL (Desktop 5-col) */}
        <aside className="relative hidden lg:flex lg:col-span-5 flex-col justify-between overflow-hidden bg-gradient-to-br from-[#022C22] via-[#053B30] to-[#06293B] text-emerald-50 p-10 xl:p-12 border-r border-emerald-900/60">
          {/* Architectural Grid Backdrop */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.14]"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(167, 243, 208, 0.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(167, 243, 208, 0.25) 1px, transparent 1px)',
              backgroundSize: '42px 42px',
            }}
          />

          {/* Ambient Floating Aurora Orbs (compositor-only transform + opacity) */}
          <motion.div
            aria-hidden="true"
            animate={{ x: [0, 22, -12, 0], y: [0, -18, 14, 0], scale: [1, 1.08, 0.96, 1] }}
            transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
            className="pointer-events-none absolute -top-24 -right-24 w-96 h-96 rounded-full bg-emerald-400/20 blur-3xl"
          />
          <motion.div
            aria-hidden="true"
            animate={{ x: [0, -18, 16, 0], y: [0, 20, -12, 0], scale: [1, 0.94, 1.06, 1] }}
            transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
            className="pointer-events-none absolute -bottom-28 -left-24 w-96 h-96 rounded-full bg-teal-400/18 blur-3xl"
          />

          {/* Top Brand Callout (inspired by Image 2) */}
          <div className="relative z-10 space-y-8">
            <button
              type="button"
              onClick={onBackHome}
              className="inline-flex items-center gap-2 text-xs font-medium text-emerald-200/80 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Reboot Earth
            </button>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-4 rounded-2xl border border-emerald-400/20 bg-white/[0.06] backdrop-blur-md px-5 py-4"
            >
              <div className="w-12 h-12 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-lg shadow-emerald-950/40">
                <Leaf className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <p className="font-display text-base font-bold text-white tracking-tight">
                  Responsible disposal starts here
                </p>
                <p className="text-xs text-emerald-100/75 mt-0.5 leading-relaxed">
                  One platform for every e-waste journey.
                </p>
              </div>
            </motion.div>
          </div>

          {/* Center Dynamic Orbital + Role Journey Preview */}
          <div className="relative z-10 my-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={`${mode}-${selectedRole}`}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-6"
              >
                {/* Animated Circular Eco-Orbital Emblem */}
                <div className="flex items-center gap-4">
                  <div className="relative w-16 h-16 flex items-center justify-center shrink-0">
                    <motion.svg
                      viewBox="0 0 64 64"
                      className="absolute inset-0 w-full h-full"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}
                    >
                      <circle
                        cx="32"
                        cy="32"
                        r="29"
                        fill="none"
                        stroke="rgba(52, 211, 153, 0.35)"
                        strokeWidth="1.5"
                        strokeDasharray="6 6"
                      />
                    </motion.svg>
                    <motion.svg
                      viewBox="0 0 64 64"
                      className="absolute inset-0 w-full h-full"
                      animate={{ rotate: -360 }}
                      transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
                    >
                      <circle
                        cx="32"
                        cy="32"
                        r="22"
                        fill="none"
                        stroke="rgba(16, 185, 129, 0.55)"
                        strokeWidth="1.5"
                        strokeDasharray="18 10"
                      />
                    </motion.svg>
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300">
                      {mode === 'signin' ? (
                        <ShieldCheck className="w-5 h-5" />
                      ) : (
                        <ActiveRoleIcon className="w-5 h-5" />
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-emerald-300/90">
                      {mode === 'signin'
                        ? 'Unified Role Workspace'
                        : `${activeRoleMeta.title} Workspace`}
                    </p>
                    <h2 className="font-display text-2xl font-bold text-white leading-snug">
                      {mode === 'signin'
                        ? 'Pick up right where your sustainability impact left off'
                        : activeRoleMeta.spotlightTitle}
                    </h2>
                  </div>
                </div>

                <p className="text-sm text-emerald-100/80 leading-relaxed max-w-md">
                  {mode === 'signin'
                    ? 'Sign in to access live e-waste pickup tracking, multi-objective fleet routing, verified partner centres, and transparent material recovery metrics.'
                    : activeRoleMeta.spotlightSummary}
                </p>

                {/* Staggered Operational Steps */}
                <div className="space-y-3.5 pt-2 border-t border-emerald-400/15">
                  {(mode === 'signin'
                    ? [
                        {
                          title: '01. Live chain of custody',
                          detail: 'Track every pickup through 9 auditable lifecycle stages.',
                        },
                        {
                          title: '02. Multi-objective route optimization',
                          detail: 'Balance fleet cost, road distance, and tailpipe CO₂e savings.',
                        },
                        {
                          title: '03. Verified material recovery',
                          detail: 'Monitor copper, aluminum, and landfill diversion across regions.',
                        },
                      ]
                    : activeRoleMeta.steps
                  ).map((step, idx) => (
                    <motion.div
                      key={step.title}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        delay: 0.06 * idx,
                        duration: 0.28,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      className="space-y-0.5"
                    >
                      <p className="text-sm font-semibold text-white">{step.title}</p>
                      <p className="text-xs text-emerald-100/70 leading-relaxed">{step.detail}</p>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Bottom Live Platform Metrics Strip (Tabular Numerals, Hairline Dividers) */}
          <div className="relative z-10 pt-6 border-t border-emerald-400/15 grid grid-cols-3 gap-4">
            <div>
              <p className="font-mono tabular-nums text-xl font-bold text-white">
                {analytics?.verifiedFacilities ?? 4}+
              </p>
              <p className="text-[11px] text-emerald-200/70 mt-0.5">Verified hubs</p>
            </div>
            <div className="border-l border-emerald-400/15 pl-4">
              <p className="font-mono tabular-nums text-xl font-bold text-emerald-300">
                {analytics ? `${analytics.landfillDiversionPct.toFixed(1)}%` : '94.2%'}
              </p>
              <p className="text-[11px] text-emerald-200/70 mt-0.5">Diversion rate</p>
            </div>
            <div className="border-l border-emerald-400/15 pl-4">
              <p className="font-mono tabular-nums text-xl font-bold text-white">
                {analytics
                  ? `${Math.round(analytics.estimatedCo2AvoidedKg).toLocaleString()} kg`
                  : '1,420 kg'}
              </p>
              <p className="text-[11px] text-emerald-200/70 mt-0.5">CO₂e avoided</p>
            </div>
          </div>
        </aside>

        {/* RIGHT INTERACTIVE FORM PANEL (Desktop 7-col, faithful to the 2 sample images) */}
        <div className="relative lg:col-span-7 flex flex-col justify-center items-center px-5 sm:px-8 py-10 sm:py-12">
          {/* Subtle Architectural Mint Grid & Corner Aurora Glows (matching the 2 sample images) */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-100 dark:opacity-35"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(16, 185, 129, 0.065) 1px, transparent 1px), linear-gradient(to bottom, rgba(16, 185, 129, 0.065) 1px, transparent 1px)',
              backgroundSize: '36px 36px',
            }}
          />
          <motion.div
            aria-hidden="true"
            animate={{ opacity: [0.55, 0.85, 0.55], scale: [1, 1.06, 1] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
            className="pointer-events-none absolute -top-24 -right-20 w-[420px] h-[420px] rounded-full bg-emerald-200/45 dark:bg-emerald-500/12 blur-3xl"
          />
          <motion.div
            aria-hidden="true"
            animate={{ opacity: [0.45, 0.75, 0.45], scale: [1, 1.04, 1] }}
            transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
            className="pointer-events-none absolute -bottom-24 -left-16 w-[380px] h-[380px] rounded-full bg-teal-200/40 dark:bg-teal-500/10 blur-3xl"
          />

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-[490px] space-y-6"
          >
            {/* Mobile Back Link */}
            <div className="lg:hidden">
              <button
                type="button"
                onClick={onBackHome}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-emerald-200/75 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Reboot Earth
              </button>
            </div>

            {/* Top Brand Callout Card (shown on Sign In view & on mobile, matching Image 2) */}
            <AnimatePresence initial={false}>
              {(mode === 'signin' || true) && (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className={`${
                    mode === 'signin' ? 'flex' : 'flex lg:hidden'
                  } items-center gap-3.5 rounded-2xl border border-emerald-200/75 dark:border-emerald-800/60 bg-white/85 dark:bg-[#071D26]/90 backdrop-blur-md px-4 py-3.5 shadow-[0_6px_24px_-12px_rgba(5,150,105,0.18)]`}
                >
                  <span className="w-11 h-11 rounded-xl bg-[#009966] dark:bg-emerald-500 text-white dark:text-emerald-950 flex items-center justify-center shrink-0 shadow-sm">
                    <Leaf className="w-5 h-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-emerald-50 leading-snug">
                      Responsible disposal starts here
                    </p>
                    <p className="text-xs text-slate-500 dark:text-emerald-200/70 mt-0.5">
                      One platform for every e-waste journey.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Dynamic Heading & Subtitle */}
            <div className="space-y-1.5">
              <AnimatePresence mode="wait">
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                >
                  <h1 className="font-display text-3xl sm:text-[34px] font-bold tracking-tight text-slate-900 dark:text-emerald-50">
                    {mode === 'signin' ? 'Welcome back' : 'Create your account'}
                  </h1>
                  <p className="text-sm text-slate-600 dark:text-emerald-100/70 mt-1">
                    {mode === 'signin'
                      ? 'Sign in to continue to your dashboard.'
                      : 'Choose the role that describes you best.'}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Animated Segmented Toggle: Sign in | Register */}
            <div
              role="tablist"
              aria-label="Authentication mode"
              className="relative grid grid-cols-2 p-1 rounded-xl bg-slate-200/75 dark:bg-[#08222D] border border-slate-200/80 dark:border-emerald-900/60"
            >
              {(['signin', 'register'] as const).map((tab) => {
                const isActive = mode === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => handleModeSwitch(tab)}
                    className={`relative z-10 h-10 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      isActive
                        ? 'text-slate-900 dark:text-emerald-50'
                        : 'text-slate-600 dark:text-emerald-200/65 hover:text-slate-900 dark:hover:text-emerald-100'
                    }`}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="auth-mode-slider"
                        transition={{ type: 'spring', stiffness: 440, damping: 34 }}
                        className="absolute inset-0 -z-10 rounded-lg bg-white dark:bg-[#0F313E] shadow-sm border border-slate-200/70 dark:border-emerald-700/50"
                      />
                    )}
                    {tab === 'signin' ? 'Sign in' : 'Register'}
                  </button>
                );
              })}
            </div>

            {/* Accessible Error / Success Banners */}
            <AnimatePresence>
              {displayError && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50/90 dark:bg-rose-950/45 px-3.5 py-3 text-xs text-rose-700 dark:text-rose-200"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                  <span className="leading-relaxed">{displayError}</span>
                </motion.div>
              )}

              {successMsg && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  role="status"
                  className="flex items-start gap-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/90 dark:bg-emerald-950/50 px-3.5 py-3 text-xs text-emerald-800 dark:text-emerald-200"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="leading-relaxed">{successMsg}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Animated Form Body */}
            <AnimatePresence mode="wait">
              {mode === 'signin' ? (
                <motion.div
                  key="signin-form"
                  initial={{ opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 14 }}
                  transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                  className="space-y-5"
                >
                  <form onSubmit={(e) => void handleSignInSubmit(e)} className="space-y-4">
                    {/* Email */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="signin-email"
                        className="block text-sm font-medium text-slate-700 dark:text-emerald-100/90"
                      >
                        Email
                      </label>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-emerald-300/50" />
                        <input
                          id="signin-email"
                          type="email"
                          autoComplete="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-300/90 dark:border-emerald-800/70 bg-white dark:bg-[#071D26] text-sm text-slate-900 dark:text-emerald-50 placeholder:text-slate-400 dark:placeholder:text-emerald-200/35 focus:border-emerald-600 dark:focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/12 transition-all outline-none"
                        />
                      </div>
                    </div>

                    {/* Password */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor="signin-password"
                          className="block text-sm font-medium text-slate-700 dark:text-emerald-100/90"
                        >
                          Password
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setResetOpen((v) => !v);
                            setResetEmail(email);
                            setLocalError(null);
                            setSuccessMsg(null);
                          }}
                          className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                        >
                          Forgot password?
                        </button>
                      </div>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-emerald-300/50" />
                        <input
                          id="signin-password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter your password"
                          className="w-full h-11 pl-10 pr-11 rounded-xl border border-slate-300/90 dark:border-emerald-800/70 bg-white dark:bg-[#071D26] text-sm text-slate-900 dark:text-emerald-50 placeholder:text-slate-400 dark:placeholder:text-emerald-200/35 focus:border-emerald-600 dark:focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/12 transition-all outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-emerald-200 transition-colors cursor-pointer"
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Primary Sign In CTA */}
                    <motion.button
                      type="submit"
                      disabled={signingIn}
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.985 }}
                      className="w-full h-12 rounded-xl bg-[#009966] hover:bg-[#008257] dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white dark:text-emerald-950 text-sm font-semibold shadow-sm hover:shadow-md hover:shadow-emerald-600/20 disabled:opacity-60 transition-all inline-flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {signingIn ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Signing in...
                        </>
                      ) : (
                        <>
                          <span>Sign in</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </motion.button>
                  </form>

                  {/* Inline Password Reset Panel */}
                  <AnimatePresence>
                    {resetOpen && (
                      <motion.form
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.22 }}
                        onSubmit={(e) => void handlePasswordReset(e)}
                        className="overflow-hidden rounded-xl border border-emerald-200/80 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-950/35 p-4 space-y-3"
                      >
                        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                          <KeyRound className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          Reset your password
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="email"
                            required
                            value={resetEmail}
                            onChange={(e) => setResetEmail(e.target.value)}
                            placeholder="Enter your registered email"
                            className="flex-1 h-10 px-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-[#071D26] text-xs text-slate-900 dark:text-emerald-50 outline-none focus:border-emerald-600"
                          />
                          <button
                            type="submit"
                            disabled={resetBusy}
                            className="h-10 px-4 rounded-lg bg-emerald-700 dark:bg-emerald-500 text-white dark:text-emerald-950 text-xs font-semibold hover:bg-emerald-800 dark:hover:bg-emerald-400 disabled:opacity-60 whitespace-nowrap cursor-pointer"
                          >
                            {resetBusy ? 'Sending...' : 'Send reset link'}
                          </button>
                        </div>
                      </motion.form>
                    )}
                  </AnimatePresence>
                </motion.div>
              ) : (
                <motion.form
                  key="register-form"
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -14 }}
                  transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                  onSubmit={(e) => void handleRegisterSubmit(e)}
                  className="space-y-4"
                >
                  {/* 2x2 Role Selector (faithful to Image 1) */}
                  <div className="space-y-2">
                    <span className="block text-sm font-medium text-slate-700 dark:text-emerald-100/90">
                      I am registering as
                    </span>
                    <div
                      role="radiogroup"
                      aria-label="Account role"
                      className="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
                    >
                      {ROLE_OPTIONS.map((option) => {
                        const Icon = option.icon;
                        const active = selectedRole === option.id;
                        return (
                          <motion.button
                            key={option.id}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => setSelectedRole(option.id)}
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.985 }}
                            transition={{ duration: 0.16 }}
                            className={`relative text-left rounded-xl p-3.5 border transition-all cursor-pointer ${
                              active
                                ? 'border-[#10B981] bg-emerald-50/90 dark:bg-emerald-900/35 shadow-[0_6px_18px_-10px_rgba(16,185,129,0.45)]'
                                : 'border-slate-200/90 dark:border-emerald-900/70 bg-white/95 dark:bg-[#071D26]/90 hover:border-emerald-300 dark:hover:border-emerald-700/80'
                            }`}
                          >
                            {active && (
                              <motion.span
                                initial={{ scale: 0.6, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ type: 'spring', stiffness: 500, damping: 26 }}
                                aria-hidden="true"
                                className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-[#009966] dark:bg-emerald-400 text-white dark:text-emerald-950 flex items-center justify-center"
                              >
                                <Check className="w-3 h-3 stroke-[3]" />
                              </motion.span>
                            )}
                            <div className="flex items-start gap-2.5 pr-5">
                              <span
                                className={`mt-0.5 shrink-0 transition-colors ${
                                  active
                                    ? 'text-[#009966] dark:text-emerald-300'
                                    : 'text-slate-500 dark:text-emerald-200/60'
                                }`}
                              >
                                <Icon className="w-4 h-4" />
                              </span>
                              <div className="space-y-0.5 min-w-0">
                                <p
                                  className={`text-sm font-semibold leading-tight ${
                                    active
                                      ? 'text-slate-900 dark:text-emerald-50'
                                      : 'text-slate-800 dark:text-emerald-100/90'
                                  }`}
                                >
                                  {option.title}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-emerald-200/65 leading-snug">
                                  {option.description}
                                </p>
                              </div>
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Full Name */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="register-fullname"
                      className="block text-sm font-medium text-slate-700 dark:text-emerald-100/90"
                    >
                      Full name
                    </label>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-emerald-300/50" />
                      <input
                        id="register-fullname"
                        type="text"
                        autoComplete="name"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Aarav Sharma"
                        className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-300/90 dark:border-emerald-800/70 bg-white dark:bg-[#071D26] text-sm text-slate-900 dark:text-emerald-50 placeholder:text-slate-400 dark:placeholder:text-emerald-200/35 focus:border-emerald-600 dark:focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/12 transition-all outline-none"
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="register-email"
                      className="block text-sm font-medium text-slate-700 dark:text-emerald-100/90"
                    >
                      Email
                    </label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-emerald-300/50" />
                      <input
                        id="register-email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-300/90 dark:border-emerald-800/70 bg-white dark:bg-[#071D26] text-sm text-slate-900 dark:text-emerald-50 placeholder:text-slate-400 dark:placeholder:text-emerald-200/35 focus:border-emerald-600 dark:focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/12 transition-all outline-none"
                      />
                    </div>
                  </div>

                  {/* Password + Dynamic Strength Meter */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="register-password"
                      className="block text-sm font-medium text-slate-700 dark:text-emerald-100/90"
                    >
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-emerald-300/50" />
                      <input
                        id="register-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        minLength={8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Create a strong password"
                        className="w-full h-11 pl-10 pr-11 rounded-xl border border-slate-300/90 dark:border-emerald-800/70 bg-white dark:bg-[#071D26] text-sm text-slate-900 dark:text-emerald-50 placeholder:text-slate-400 dark:placeholder:text-emerald-200/35 focus:border-emerald-600 dark:focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/12 transition-all outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-emerald-200 transition-colors cursor-pointer"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    {/* 4-segment Password Strength Indicator + Explicit Text */}
                    {password.length > 0 && (
                      <div className="grid grid-cols-4 gap-1.5 pt-1" aria-hidden="true">
                        {[1, 2, 3, 4].map((seg) => (
                          <div
                            key={seg}
                            className={`h-1 rounded-full transition-colors duration-200 ${
                              strength.score >= seg
                                ? strength.barClass
                                : 'bg-slate-200 dark:bg-emerald-950'
                            }`}
                          />
                        ))}
                      </div>
                    )}
                    <p className={`text-xs ${strength.textClass}`}>{strength.label}</p>
                  </div>

                  {/* Primary Create Account CTA */}
                  <motion.button
                    type="submit"
                    disabled={signingIn}
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.985 }}
                    className="w-full h-12 rounded-xl bg-[#009966] hover:bg-[#008257] dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white dark:text-emerald-950 text-sm font-semibold shadow-sm hover:shadow-md hover:shadow-emerald-600/20 disabled:opacity-60 transition-all inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {signingIn ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating account...
                      </>
                    ) : (
                      <>
                        <span>Create account</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </motion.button>
                </motion.form>
              )}
            </AnimatePresence>

            {/* Hairline Divider + Official Google Sign-In */}
            <div className="space-y-3.5 pt-1">
              <div className="relative flex items-center">
                <div className="flex-1 border-t border-slate-200 dark:border-emerald-900/70" />
                <span className="px-3 text-xs text-slate-500 dark:text-emerald-200/60">
                  Or continue with
                </span>
                <div className="flex-1 border-t border-slate-200 dark:border-emerald-900/70" />
              </div>

              <div className="flex justify-center">
                <GoogleSignInButton
                  onClick={() => void handleGoogleContinue()}
                  loading={signingIn}
                  label="Continue with Google"
                  className="w-full"
                />
              </div>

              <p className="text-center text-xs text-slate-500 dark:text-emerald-200/65 pt-1">
                {mode === 'signin' ? (
                  <>
                    New to Reboot Earth?{' '}
                    <button
                      type="button"
                      onClick={() => handleModeSwitch('register')}
                      className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                    >
                      Create an account
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => handleModeSwitch('signin')}
                      className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                    >
                      Sign in
                    </button>
                  </>
                )}
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
