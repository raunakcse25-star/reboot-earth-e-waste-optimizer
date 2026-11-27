import React, { useEffect, useState } from 'react';
import {
  Bell,
  Building2,
  CheckCircle2,
  Globe,
  Loader2,
  Mail,
  MessageSquare,
  Monitor,
  Moon,
  Phone,
  Save,
  Sun,
  UserCheck,
} from 'lucide-react';
import { useAuth, type ThemeMode } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import {
  ORGANIZATION_TYPE_LABELS,
  ROLE_LABELS,
  type CommunicationChannel,
  type OrganizationType,
  type UserRole,
} from '../types';

const CHANNEL_OPTIONS: {
  id: CommunicationChannel;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'email', label: 'Email', desc: 'Receipts & digests', icon: Mail },
  { id: 'sms', label: 'SMS', desc: 'Slot & dispatch alerts', icon: Phone },
  { id: 'whatsapp', label: 'WhatsApp', desc: 'Pickup coordination', icon: MessageSquare },
  { id: 'in_app', label: 'In-App Only', desc: 'Dashboard bell alerts', icon: Bell },
];

export const UserProfilePanel: React.FC = () => {
  const {
    dbUser,
    firestoreProfile,
    firebaseUser,
    theme,
    setTheme,
    language,
    setLanguage,
    refreshProfile,
    syncFirestoreProfile,
  } = useAuth();

  const role: UserRole = dbUser?.role || 'citizen';
  const uid = firebaseUser?.uid || dbUser?.uid || 'local';

  // Read any locally cached extended preferences as fallback for non-Firestore/local sessions
  const readLocalPrefs = () => {
    try {
      const raw = localStorage.getItem(`reboot_earth_profile_prefs_${uid}`);
      return raw ? (JSON.parse(raw) as Record<string, any>) : null;
    } catch {
      return null;
    }
  };

  const [fullName, setFullName] = useState(dbUser?.fullName || firestoreProfile?.fullName || '');
  const [organizationName, setOrganizationName] = useState(
    dbUser?.organizationName || firestoreProfile?.organizationName || ''
  );
  const [organizationType, setOrganizationType] = useState<OrganizationType>(
    firestoreProfile?.organizationType || 'individual'
  );
  const [phone, setPhone] = useState(dbUser?.phone || firestoreProfile?.phone || '');
  const [city, setCity] = useState(dbUser?.city || firestoreProfile?.city || '');
  const [requestedRole, setRequestedRole] = useState<string>(dbUser?.requestedRole || '');

  // Communication preferences
  const [preferredChannel, setPreferredChannel] = useState<CommunicationChannel>(
    firestoreProfile?.preferredChannel || 'email'
  );
  const [emailAlerts, setEmailAlerts] = useState<boolean>(
    firestoreProfile?.emailAlerts ?? true
  );
  const [pickupReminders, setPickupReminders] = useState<boolean>(
    firestoreProfile?.pickupReminders ?? true
  );
  const [goalMilestoneAlerts, setGoalMilestoneAlerts] = useState<boolean>(
    firestoreProfile?.goalMilestoneAlerts ?? true
  );
  const [weeklyImpactDigest, setWeeklyImpactDigest] = useState<boolean>(
    firestoreProfile?.weeklyImpactDigest ?? false
  );
  const [regulatoryUpdates, setRegulatoryUpdates] = useState<boolean>(
    firestoreProfile?.regulatoryUpdates ?? true
  );

  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  useEffect(() => {
    const cached = readLocalPrefs();
    const src = firestoreProfile || cached;
    if (dbUser || src) {
      setFullName(dbUser?.fullName || src?.fullName || '');
      setOrganizationName(dbUser?.organizationName || src?.organizationName || '');
      setOrganizationType(
        (src?.organizationType as OrganizationType) ||
          (role === 'organization' || role === 'producer'
            ? 'corporate'
            : role === 'recycler' || role === 'collection_centre' || role === 'transporter'
              ? 'recycler_partner'
              : 'individual')
      );
      setPhone(dbUser?.phone || src?.phone || '');
      setCity(dbUser?.city || src?.city || '');
      setRequestedRole(dbUser?.requestedRole || '');
      setPreferredChannel((src?.preferredChannel as CommunicationChannel) || 'email');
      setEmailAlerts(src?.emailAlerts ?? true);
      setPickupReminders(src?.pickupReminders ?? true);
      setGoalMilestoneAlerts(src?.goalMilestoneAlerts ?? true);
      setWeeklyImpactDigest(src?.weeklyImpactDigest ?? false);
      setRegulatoryUpdates(src?.regulatoryUpdates ?? true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbUser, firestoreProfile, uid, role]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMsg(null);
    try {
      await apiFetch('/api/me', {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: fullName.trim(),
          organizationName: organizationName.trim(),
          phone: phone.trim(),
          city: city.trim(),
          requestedRole: requestedRole || undefined,
        }),
      });

      await syncFirestoreProfile({
        fullName: fullName.trim(),
        organizationName: organizationName.trim(),
        organizationType,
        phone: phone.trim(),
        city: city.trim(),
        preferredChannel,
        emailAlerts,
        pickupReminders,
        goalMilestoneAlerts,
        weeklyImpactDigest,
        regulatoryUpdates,
      });

      await refreshProfile();
      setStatusMsg({
        type: 'success',
        text:
          requestedRole && requestedRole !== role
            ? 'Profile, organization type, and communication preferences saved. Your role upgrade request is queued for admin approval.'
            : 'Profile, organization type, and communication preferences saved and synced.',
      });
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err?.message || 'Unable to save profile changes right now.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Column: Identity, Organization Type & Role */}
      <div className="lg:col-span-7 space-y-6">
        <div className="p-6 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-sky-50 inline-flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-sky-500" />
                User Profile &amp; Organization Details
              </h3>
              <p className="text-xs text-slate-500 dark:text-sky-200/70 mt-1">
                Manage your account identity, organization classification, and platform role.
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-sky-50 dark:bg-sky-950/70 border border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300">
              {ROLE_LABELS[role]}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-sky-200/80 mb-1">
                Full Name
              </label>
              <input
                type="text"
                required
                maxLength={120}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-sky-200/80 mb-1">
                Organization Type
              </label>
              <div className="relative">
                <Building2 className="w-3.5 h-3.5 text-sky-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={organizationType}
                  onChange={(e) => setOrganizationType(e.target.value as OrganizationType)}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  {(Object.keys(ORGANIZATION_TYPE_LABELS) as OrganizationType[]).map((key) => (
                    <option key={key} value={key}>
                      {ORGANIZATION_TYPE_LABELS[key]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-sky-200/80 mb-1">
                Organization Name{' '}
                <span className="text-slate-400 font-normal">
                  {organizationType === 'individual' ? '(Optional)' : ''}
                </span>
              </label>
              <input
                type="text"
                maxLength={140}
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                placeholder={
                  organizationType === 'individual'
                    ? 'Personal / Household'
                    : 'e.g., GreenTech Labs Pvt. Ltd.'
                }
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-sky-200/80 mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                maxLength={40}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98XXXXXXXX"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-sky-200/80 mb-1">
                City / Operating Region
              </label>
              <input
                type="text"
                maxLength={80}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g., New Delhi, Bengaluru, Mumbai"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          {role !== 'admin' && (
            <div className="pt-2 border-t border-slate-200 dark:border-sky-900/50">
              <label className="block text-xs font-medium text-slate-600 dark:text-sky-200/80 mb-1">
                Request Privileged Platform Role (Requires Admin Verification)
              </label>
              <select
                value={requestedRole}
                onChange={(e) => setRequestedRole(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="">Keep Current Role ({ROLE_LABELS[role]})</option>
                <option value="organization">Organization / Bulk Consumer</option>
                <option value="collection_centre">Collection Centre</option>
                <option value="recycler">Recycler</option>
                <option value="refurbisher">Refurbisher</option>
                <option value="transporter">Transporter</option>
                <option value="producer">Producer / Manufacturer</option>
              </select>
            </div>
          )}

          {statusMsg && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
                statusMsg.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/70 text-emerald-800 dark:text-emerald-200'
                  : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300'
              }`}
            >
              {statusMsg.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
              <span>{statusMsg.text}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-[11px] text-slate-500 dark:text-sky-200/60">
              Account email: <span className="font-mono">{dbUser?.email || firebaseUser?.email}</span>
            </p>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2.5 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 hover:bg-sky-700 dark:hover:bg-sky-400 text-white dark:text-sky-950 inline-flex items-center gap-1.5 disabled:opacity-60 transition-colors cursor-pointer"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save Profile &amp; Preferences
            </button>
          </div>
        </div>
      </div>

      {/* Right Column: Communication Preferences & Theme */}
      <div className="lg:col-span-5 space-y-6">
        <div className="p-6 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-5">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-sky-50 inline-flex items-center gap-2">
              <Bell className="w-4 h-4 text-sky-500" />
              Communication Preferences
            </h3>
            <p className="text-xs text-slate-500 dark:text-sky-200/70 mt-1">
              Choose how and when Reboot Earth notifies you about pickups, goals, and policy updates.
            </p>
          </div>

          {/* Primary Channel Picker */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-600 dark:text-sky-200/80">
              Preferred Contact Channel
            </label>
            <div className="grid grid-cols-2 gap-2">
              {CHANNEL_OPTIONS.map((ch) => {
                const Icon = ch.icon;
                const active = preferredChannel === ch.id;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => setPreferredChannel(ch.id)}
                    className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                      active
                        ? 'border-sky-500 bg-sky-500/15 text-sky-900 dark:text-sky-100'
                        : 'border-slate-200 dark:border-sky-900 text-slate-600 dark:text-sky-200/75 hover:border-sky-400'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-semibold">
                      <Icon className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                      <span>{ch.label}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-sky-300/65 mt-0.5">
                      {ch.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Granular Notification Toggles */}
          <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-sky-900/50">
            {[
              {
                label: 'Email Receipts & Status Updates',
                desc: 'Pickup confirmations, QR custody updates, and dispatch summaries.',
                checked: emailAlerts,
                onChange: setEmailAlerts,
              },
              {
                label: 'Pickup Slot Reminders',
                desc: 'Advance reminders before scheduled collection time slots.',
                checked: pickupReminders,
                onChange: setPickupReminders,
              },
              {
                label: 'Monthly Recycling Goal Alerts',
                desc: 'Notifications when crossing 50%, 75%, and 100% of monthly targets.',
                checked: goalMilestoneAlerts,
                onChange: setGoalMilestoneAlerts,
              },
              {
                label: 'Weekly Impact Digest',
                desc: 'Summary of CO₂e avoided and materials recovered.',
                checked: weeklyImpactDigest,
                onChange: setWeeklyImpactDigest,
              },
              {
                label: 'CPCB & EPR Policy Advisories',
                desc: 'Important updates on India E-Waste Rules and safe battery handling.',
                checked: regulatoryUpdates,
                onChange: setRegulatoryUpdates,
              },
            ].map((item) => (
              <label
                key={item.label}
                className="flex items-start justify-between gap-3 p-2.5 rounded-lg border border-slate-200/80 dark:border-sky-900/60 bg-slate-50/60 dark:bg-[#061526] cursor-pointer hover:border-sky-400/70 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800 dark:text-sky-100">
                    {item.label}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-sky-200/65 mt-0.5">
                    {item.desc}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) => item.onChange(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-sky-500 rounded shrink-0 cursor-pointer"
                />
              </label>
            ))}
          </div>

          {/* Language Preference */}
          <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-sky-900/50">
            <label className="text-xs font-medium text-slate-600 dark:text-sky-200/80 inline-flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-sky-500" />
              Preferred Assistant &amp; Communication Language
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'en', label: 'English' },
                  { id: 'hi', label: 'हिन्दी' },
                  { id: 'hinglish', label: 'Hinglish' },
                ] as const
              ).map((lang) => (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => setLanguage(lang.id)}
                  className={`py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                    language === lang.id
                      ? 'border-sky-500 bg-sky-500/15 text-sky-700 dark:text-sky-300 font-semibold'
                      : 'border-slate-200 dark:border-sky-900 text-slate-600 dark:text-sky-200/75'
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Display Theme Preference */}
        <div className="p-6 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-sky-50">
            Display Theme Preference
          </h3>
          <p className="text-xs text-slate-500 dark:text-sky-200/70">
            Synchronized automatically to your user preferences across sessions.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: 'light', label: 'Light', icon: Sun },
                { id: 'dark', label: 'Dark', icon: Moon },
                { id: 'system', label: 'System', icon: Monitor },
              ] as { id: ThemeMode; label: string; icon: React.ComponentType<any> }[]
            ).map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setTheme(m.id)}
                  className={`py-2.5 rounded-lg border text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                    theme === m.id
                      ? 'border-sky-500 bg-sky-500/15 text-sky-700 dark:text-sky-300 font-semibold'
                      : 'border-slate-200 dark:border-sky-900 text-slate-600 dark:text-sky-200/75'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </form>
  );
};
