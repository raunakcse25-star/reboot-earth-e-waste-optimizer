import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Bell,
  Boxes,
  CalendarClock,
  Check,
  Cloud,
  LayoutDashboard,
  LogOut,
  MapPin,
  Monitor,
  Moon,
  PackageCheck,
  Route,
  Settings,
  ShieldCheck,
  Sun,
  Truck,
  X,
} from 'lucide-react';
import { useAuth, type ThemeMode } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import {
  ROLE_LABELS,
  type AnalyticsSummary,
  type Facility,
  type PickupRequest,
  type UserRole,
  type Vehicle,
} from '../types';
import { PickupManager } from './PickupManager';
import { SchedulePickup } from './SchedulePickup';
import { OptimizerStudio } from './OptimizerStudio';
import { FacilityMap } from './FacilityMap';
import {
  AdminGovernanceModule,
  EnvironmentalAnalyticsModule,
  FleetModule,
  InventoryModule,
} from './OperationsModules';
import { WorkspaceAndStudio } from './WorkspaceAndStudio';

type DashTab =
  | 'overview'
  | 'schedule'
  | 'pickups'
  | 'optimizer'
  | 'facilities'
  | 'inventory'
  | 'fleet'
  | 'analytics'
  | 'workspace'
  | 'admin'
  | 'settings';

interface DashboardShellProps {
  analytics: AnalyticsSummary | null;
  facilities: Facility[];
  onRefreshGlobal: () => void;
  onExitDashboard: () => void;
}

export const DashboardShell: React.FC<DashboardShellProps> = ({
  analytics,
  facilities,
  onRefreshGlobal,
  onExitDashboard,
}) => {
  const {
    dbUser,
    firebaseUser,
    notifications,
    theme,
    setTheme,
    markNotificationRead,
    refreshProfile,
    signOut,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<DashTab>('overview');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [recentPickups, setRecentPickups] = useState<PickupRequest[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);

  // Profile settings state
  const [fullName, setFullName] = useState(dbUser?.fullName || '');
  const [organizationName, setOrganizationName] = useState(dbUser?.organizationName || '');
  const [phone, setPhone] = useState(dbUser?.phone || '');
  const [city, setCity] = useState(dbUser?.city || '');
  const [requestedRole, setRequestedRole] = useState<string>(dbUser?.requestedRole || '');
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  useEffect(() => {
    if (dbUser) {
      setFullName(dbUser.fullName || '');
      setOrganizationName(dbUser.organizationName || '');
      setPhone(dbUser.phone || '');
      setCity(dbUser.city || '');
      setRequestedRole(dbUser.requestedRole || '');
    }
  }, [dbUser]);

  const loadDashData = useCallback(async () => {
    try {
      const [vRows, pRows] = await Promise.all([
        apiFetch<Vehicle[]>('/api/vehicles'),
        apiFetch<PickupRequest[]>('/api/pickups'),
      ]);
      setVehicles(vRows);
      setRecentPickups(pRows);
    } catch {
      // Handled silently if session not ready
    }
  }, []);

  useEffect(() => {
    if (firebaseUser) {
      void loadDashData();
    }
  }, [firebaseUser, loadDashData]);

  const role: UserRole = dbUser?.role || 'citizen';
  const unreadCount = notifications.filter((n) => !n.read).length;

  const navItems: { id: DashTab; label: string; icon: React.ComponentType<any>; visible: boolean }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard, visible: true },
    { id: 'schedule', label: 'Schedule Pickup', icon: CalendarClock, visible: true },
    { id: 'pickups', label: 'Pickup Requests', icon: PackageCheck, visible: true },
    { id: 'optimizer', label: 'Smart Optimizer', icon: Route, visible: true },
    { id: 'facilities', label: 'Facility Map', icon: MapPin, visible: true },
    {
      id: 'inventory',
      label: 'Inventory & Recovery',
      icon: Boxes,
      visible: ['collection_centre', 'recycler', 'refurbisher', 'producer', 'admin'].includes(role),
    },
    {
      id: 'fleet',
      label: 'Fleet & Vehicles',
      icon: Truck,
      visible: ['transporter', 'collection_centre', 'recycler', 'admin'].includes(role),
    },
    { id: 'analytics', label: 'ESG Analytics', icon: BarChart3, visible: true },
    { id: 'workspace', label: 'Workspace & AI Studio', icon: Cloud, visible: true },
    { id: 'admin', label: 'Admin Governance', icon: ShieldCheck, visible: role === 'admin' },
    { id: 'settings', label: 'Profile & Role', icon: Settings, visible: true },
  ];

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    try {
      await apiFetch('/api/me', {
        method: 'PATCH',
        body: JSON.stringify({
          fullName,
          organizationName,
          phone,
          city,
          requestedRole: requestedRole || undefined,
        }),
      });
      await refreshProfile();
      setProfileMsg(
        requestedRole && requestedRole !== role
          ? 'Profile saved. Your role upgrade request has been queued for administrator approval.'
          : 'Profile settings saved.'
      );
    } catch (err: any) {
      setProfileMsg(err?.message || 'Unable to update profile.');
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col lg:flex-row bg-slate-50 dark:bg-[#04100C]">
      {/* Left Sidebar */}
      <aside className="lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#061812] p-4 flex flex-col justify-between gap-6">
        <div className="space-y-5">
          <div className="px-2 space-y-1">
            <p className="text-xs font-semibold text-slate-900 dark:text-emerald-50 truncate">
              {dbUser?.fullName || firebaseUser?.displayName || 'Account'}
            </p>
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
              {ROLE_LABELS[role]}
            </p>
            <p className="text-[11px] font-mono text-slate-500 dark:text-emerald-200/60 truncate">
              {dbUser?.email || firebaseUser?.email}
            </p>
          </div>

          <nav className="flex lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-0">
            {navItems
              .filter((item) => item.visible)
              .map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium inline-flex items-center gap-2.5 whitespace-nowrap transition-colors ${
                      active
                        ? 'bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950 font-semibold'
                        : 'text-slate-600 dark:text-emerald-100/75 hover:bg-slate-100 dark:hover:bg-emerald-900/40'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {item.label}
                  </button>
                );
              })}
          </nav>
        </div>

        <div className="hidden lg:flex flex-col gap-2 pt-4 border-t border-slate-200 dark:border-emerald-900/50">
          <button
            type="button"
            onClick={onExitDashboard}
            className="w-full px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-emerald-200/80 hover:bg-slate-100 dark:hover:bg-emerald-900/40 text-left"
          >
            ← Back to Public Site
          </button>
          <button
            type="button"
            onClick={() => {
              void signOut();
              onExitDashboard();
            }}
            className="w-full px-3 py-2 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 inline-flex items-center gap-2"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="flex-1 min-w-0 p-5 lg:p-8 space-y-6">
        {/* Top Utility Strip inside Dashboard */}
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-emerald-900/50">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-emerald-50">
              {navItems.find((i) => i.id === activeTab)?.label || 'Dashboard'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-emerald-200/65">
              Role scope: {ROLE_LABELS[role]} · Reward Credits:{' '}
              <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                {dbUser?.rewardPoints ?? 0} pts
              </span>
            </p>
          </div>

          <div className="relative flex items-center gap-2">
            <button
              type="button"
              onClick={() => setNotifOpen((v) => !v)}
              aria-label="Toggle notifications"
              className="relative p-2 rounded-lg border border-slate-200 dark:border-emerald-900/70 bg-white dark:bg-[#081D16] text-slate-700 dark:text-emerald-200 hover:border-emerald-500"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full bg-emerald-600 text-white text-[10px] font-mono font-bold">
                  {unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-12 z-40 w-80 rounded-xl border border-slate-200 dark:border-emerald-800 bg-white dark:bg-[#081D16] shadow-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-emerald-50">
                    Realtime Notifications
                  </h4>
                  <button type="button" onClick={() => setNotifOpen(false)}>
                    <X className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                </div>
                {notifications.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-emerald-200/65">
                    No notifications yet.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`p-2.5 rounded-lg border text-xs ${
                          n.read
                            ? 'border-slate-100 dark:border-emerald-900/40 opacity-70'
                            : 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-950/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-slate-900 dark:text-emerald-50">{n.title}</p>
                          {!n.read && (
                            <button
                              type="button"
                              onClick={() => void markNotificationRead(n.id)}
                              className="text-emerald-700 dark:text-emerald-400"
                              title="Mark read"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-emerald-200/75 mt-0.5">
                          {n.message}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#081D16]">
                <p className="text-xs text-slate-500 dark:text-emerald-200/70">Visible Pickup Requests</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-emerald-50 mt-1">
                  {recentPickups.length}
                </p>
                <p className="text-xs text-slate-500 dark:text-emerald-200/65 mt-1">
                  {recentPickups.filter((p) => p.status !== 'Completed' && p.status !== 'Cancelled').length} active in queue
                </p>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#081D16]">
                <p className="text-xs text-slate-500 dark:text-emerald-200/70">Platform E-Waste Mass</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-emerald-50 mt-1">
                  {analytics?.totalCollectedKg.toLocaleString() ?? 0} kg
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                  {analytics?.landfillDiversionPct ?? 0}% landfill diversion
                </p>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#081D16]">
                <p className="text-xs text-slate-500 dark:text-emerald-200/70">CO₂e Avoided</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-1">
                  {analytics?.estimatedCo2AvoidedKg.toLocaleString() ?? 0} kg
                </p>
                <p className="text-xs text-slate-500 dark:text-emerald-200/65 mt-1">
                  {analytics?.optimizationRunsCount ?? 0} optimization runs logged
                </p>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#081D16]">
                <p className="text-xs text-slate-500 dark:text-emerald-200/70">Registered Fleet &amp; Hubs</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-emerald-50 mt-1">
                  {vehicles.length} / {facilities.length}
                </p>
                <p className="text-xs text-slate-500 dark:text-emerald-200/65 mt-1">
                  Vehicles &amp; recycling facilities
                </p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                type="button"
                onClick={() => setActiveTab('schedule')}
                className="p-5 rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#081D16] hover:border-emerald-500 text-left space-y-1.5 transition-colors"
              >
                <CalendarClock className="w-5 h-5 text-emerald-500" />
                <h4 className="text-sm font-semibold text-slate-900 dark:text-emerald-50">
                  Schedule Doorstep Pickup
                </h4>
                <p className="text-xs text-slate-500 dark:text-emerald-200/70">
                  Reserve a collection time slot from your location with GPS pinning and live sync.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('optimizer')}
                className="p-5 rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#081D16] hover:border-emerald-500 text-left space-y-1.5 transition-colors"
              >
                <Route className="w-5 h-5 text-emerald-500" />
                <h4 className="text-sm font-semibold text-slate-900 dark:text-emerald-50">
                  Run Logistics Optimizer
                </h4>
                <p className="text-xs text-slate-500 dark:text-emerald-200/70">
                  Optimize collection routes for minimum cost, distance, or emissions.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('workspace')}
                className="p-5 rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#081D16] hover:border-emerald-500 text-left space-y-1.5 transition-colors"
              >
                <Cloud className="w-5 h-5 text-emerald-500" />
                <h4 className="text-sm font-semibold text-slate-900 dark:text-emerald-50">
                  Workspace Hub &amp; Visual Studio
                </h4>
                <p className="text-xs text-slate-500 dark:text-emerald-200/70">
                  Sync pickups with Google Calendar, export ESG data to Drive, send Gmail receipts, or craft campaign art.
                </p>
              </button>
            </div>

            {/* Recent Pickups Snapshot */}
            <div className="rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#081D16] overflow-x-auto">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-emerald-900/60 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-emerald-50">
                  Recent Collection Activity
                </h4>
                <button
                  type="button"
                  onClick={() => setActiveTab('pickups')}
                  className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
                >
                  View All
                </button>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-[#05140F] text-slate-500 dark:text-emerald-200/70">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Code</th>
                    <th className="px-4 py-2.5 font-medium">Device</th>
                    <th className="px-4 py-2.5 font-medium">Weight</th>
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-emerald-900/50">
                  {recentPickups.slice(0, 6).map((p) => (
                    <tr key={p.id} className="text-slate-700 dark:text-emerald-100/90">
                      <td className="px-4 py-2.5 font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                        {p.requestCode}
                      </td>
                      <td className="px-4 py-2.5">{p.deviceName}</td>
                      <td className="px-4 py-2.5 font-mono tabular-nums">{p.estimatedWeightKg} kg</td>
                      <td className="px-4 py-2.5">{p.preferredDate}</td>
                      <td className="px-4 py-2.5 font-medium">{p.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'schedule' && (
          <SchedulePickup
            facilities={facilities}
            onBooked={() => {
              void loadDashData();
              onRefreshGlobal();
            }}
          />
        )}

        {activeTab === 'pickups' && (
          <PickupManager
            facilities={facilities}
            vehicles={vehicles}
            onDataChanged={() => {
              void loadDashData();
              onRefreshGlobal();
            }}
          />
        )}

        {activeTab === 'optimizer' && <OptimizerStudio />}

        {activeTab === 'facilities' && <FacilityMap facilities={facilities} />}

        {activeTab === 'inventory' && (
          <InventoryModule facilities={facilities} onDataChanged={onRefreshGlobal} />
        )}

        {activeTab === 'fleet' && (
          <FleetModule vehicles={vehicles} onRefresh={() => void loadDashData()} />
        )}

        {activeTab === 'analytics' && <EnvironmentalAnalyticsModule analytics={analytics} />}

        {activeTab === 'workspace' && <WorkspaceAndStudio analytics={analytics} />}

        {activeTab === 'admin' && role === 'admin' && (
          <AdminGovernanceModule
            facilities={facilities}
            onFacilitiesChanged={onRefreshGlobal}
          />
        )}

        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <form
              onSubmit={handleSaveProfile}
              className="lg:col-span-7 p-6 rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#081D16] space-y-4"
            >
              <h3 className="text-base font-semibold text-slate-900 dark:text-emerald-50">
                Profile &amp; Role Upgrade Application
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-600 dark:text-emerald-200/75 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 dark:text-emerald-200/75 mb-1">Organization (Optional)</label>
                  <input
                    type="text"
                    value={organizationName}
                    onChange={(e) => setOrganizationName(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 dark:text-emerald-200/75 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 dark:text-emerald-200/75 mb-1">City</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
                  />
                </div>
              </div>

              {role !== 'admin' && (
                <div>
                  <label className="block text-xs text-slate-600 dark:text-emerald-200/75 mb-1">
                    Request Privileged Platform Role (Requires Admin Verification)
                  </label>
                  <select
                    value={requestedRole}
                    onChange={(e) => setRequestedRole(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
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

              {profileMsg && (
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  {profileMsg}
                </p>
              )}

              <button
                type="submit"
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950"
              >
                Save Profile Settings
              </button>
            </form>

            <div className="lg:col-span-5 p-6 rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#081D16] space-y-4">
              <h3 className="text-base font-semibold text-slate-900 dark:text-emerald-50">
                Display Theme Preference
              </h3>
              <p className="text-xs text-slate-600 dark:text-emerald-200/70">
                Synchronized automatically to your Firestore user preferences across sessions.
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
                      className={`py-2.5 rounded-lg border text-xs font-medium inline-flex items-center justify-center gap-1.5 ${
                        theme === m.id
                          ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : 'border-slate-200 dark:border-emerald-900 text-slate-600 dark:text-emerald-200/75'
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
        )}
      </main>
    </div>
  );
};
