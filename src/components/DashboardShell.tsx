import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AudioLines,
  BarChart3,
  Bell,
  Boxes,
  CalendarClock,
  Check,
  Cloud,
  Download,
  Globe,
  LayoutDashboard,
  LogOut,
  MapPin,
  Mic,
  PackageCheck,
  Route,
  Settings,
  ShieldCheck,
  Target,
  Truck,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
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
import { D3ImpactVisualizer } from './D3ImpactVisualizer';
import { MonthlyTargetsPanel } from './MonthlyTargetsPanel';
import { LiveVoicePanel } from './LiveVoicePanel';
import { LiveSearchIntelPanel } from './LiveSearchIntelPanel';
import { AudioTranscriberPanel } from './AudioTranscriber';
import { UserProfilePanel } from './UserProfilePanel';

type DashTab =
  | 'overview'
  | 'impact'
  | 'targets'
  | 'voice'
  | 'transcribe'
  | 'intel'
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
    isAuthenticated,
    notifications,
    markNotificationRead,
    signOut,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<DashTab>('overview');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [recentPickups, setRecentPickups] = useState<PickupRequest[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

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
    if (isAuthenticated) {
      void loadDashData();
    }
  }, [isAuthenticated, loadDashData]);

  const role: UserRole = dbUser?.role || 'citizen';
  const unreadCount = notifications.filter((n) => !n.read).length;

  const navItems: { id: DashTab; label: string; icon: React.ComponentType<any>; visible: boolean }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard, visible: true },
    { id: 'impact', label: 'Impact Visualizer (D3)', icon: Activity, visible: true },
    { id: 'targets', label: 'Monthly Targets', icon: Target, visible: true },
    { id: 'voice', label: 'Live Voice AI', icon: AudioLines, visible: true },
    { id: 'transcribe', label: 'Audio Transcribe', icon: Mic, visible: true },
    { id: 'intel', label: 'Live Web Intel', icon: Globe, visible: true },
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
    { id: 'settings', label: 'Profile & Preferences', icon: Settings, visible: true },
  ];

  const handleExportCollectionCsv = () => {
    const escapeCsvCell = (value: unknown): string => {
      const str = value === null || value === undefined ? '' : String(value);
      // Guard against spreadsheet formula injection (=, +, -, @, tab, CR)
      const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
      return `"${safe.replace(/"/g, '""')}"`;
    };

    const facilityById = new Map(facilities.map((f) => [f.id, f.name]));
    const vehicleById = new Map(vehicles.map((v) => [v.id, `${v.registrationNo} (${v.vehicleType})`]));

    const headers = [
      'Request Code',
      'Device Name',
      'Category',
      'Quantity',
      'Estimated Weight (kg)',
      'Estimated CO2e Avoided (kg)',
      'Condition',
      'Status',
      'Preferred Date',
      'Time Slot',
      'Pickup Address',
      'Assigned Facility',
      'Assigned Vehicle',
      'Contact Name',
      'Instructions',
      'Created At',
      'Updated At',
    ];

    let totalQty = 0;
    let totalWeightKg = 0;
    let totalCo2Kg = 0;

    const rows = recentPickups.map((p) => {
      const weight = Number(p.estimatedWeightKg) || 0;
      const co2 = Number((weight * 1.44).toFixed(2));
      const qty = Number(p.quantity) || 1;
      if (p.status !== 'Cancelled') {
        totalQty += qty;
        totalWeightKg += weight;
        totalCo2Kg += co2;
      }
      return [
        p.requestCode,
        p.deviceName,
        p.category,
        qty,
        weight.toFixed(2),
        co2.toFixed(2),
        p.condition,
        p.status,
        p.preferredDate,
        p.timeSlot,
        p.pickupAddress,
        p.assignedFacilityId ? facilityById.get(p.assignedFacilityId) || `Facility #${p.assignedFacilityId}` : 'Unassigned',
        p.assignedVehicleId ? vehicleById.get(p.assignedVehicleId) || `Vehicle #${p.assignedVehicleId}` : 'Unassigned',
        p.contactName,
        p.instructions || '',
        p.createdAt || '',
        p.updatedAt || '',
      ];
    });

    const summaryRow = [
      'TOTAL (ACTIVE)',
      `${recentPickups.length} request(s)`,
      '',
      totalQty,
      totalWeightKg.toFixed(2),
      totalCo2Kg.toFixed(2),
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ];

    const csvLines = [
      headers.map(escapeCsvCell).join(','),
      ...rows.map((r) => r.map(escapeCsvCell).join(',')),
      summaryRow.map(escapeCsvCell).join(','),
    ];

    const blob = new Blob(['\uFEFF' + csvLines.join('\r\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reboot-earth-collection-activity-${dateStamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setExportStatus(`Exported ${recentPickups.length} record${recentPickups.length === 1 ? '' : 's'}`);
    window.setTimeout(() => setExportStatus(null), 3000);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col lg:flex-row bg-[#EFF7FF] dark:bg-[#040E1A]">
      {/* Left Sidebar */}
      <aside className="lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#071A2E] p-4 flex flex-col justify-between gap-6">
        <div className="space-y-5">
          <div className="px-2 space-y-1">
            <p className="text-xs font-semibold text-slate-900 dark:text-sky-50 truncate">
              {dbUser?.fullName || firebaseUser?.displayName || 'Account'}
            </p>
            <p className="text-[11px] text-sky-700 dark:text-sky-400 font-medium">
              {ROLE_LABELS[role]}
            </p>
            <p className="text-[11px] font-mono text-slate-500 dark:text-sky-200/60 truncate">
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
                        ? 'bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 font-semibold'
                        : 'text-slate-600 dark:text-sky-100/75 hover:bg-slate-100 dark:hover:bg-sky-900/40'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {item.label}
                  </button>
                );
              })}
          </nav>
        </div>

        <div className="hidden lg:flex flex-col gap-2 pt-4 border-t border-slate-200 dark:border-sky-900/50">
          <button
            type="button"
            onClick={onExitDashboard}
            className="w-full px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-sky-200/80 hover:bg-slate-100 dark:hover:bg-sky-900/40 text-left"
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
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-sky-900/50">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-sky-50">
              {navItems.find((i) => i.id === activeTab)?.label || 'Dashboard'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-sky-200/65">
              Role scope: {ROLE_LABELS[role]} · Reward Credits:{' '}
              <span className="font-mono font-semibold text-sky-700 dark:text-sky-400">
                {dbUser?.rewardPoints ?? 0} pts
              </span>
            </p>
          </div>

          <div className="relative flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCollectionCsv}
              title="Download CSV report of your e-waste collection activity"
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-sky-900/70 bg-white dark:bg-[#0B223B] text-xs font-semibold text-slate-700 dark:text-sky-100 hover:border-sky-500 hover:text-sky-700 dark:hover:text-sky-300 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {exportStatus ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span>{exportStatus}</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5 text-sky-500" />
                  <span>Export Data</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setNotifOpen((v) => !v)}
              aria-label="Toggle notifications"
              className="relative p-2 rounded-lg border border-slate-200 dark:border-sky-900/70 bg-white dark:bg-[#0B223B] text-slate-700 dark:text-sky-200 hover:border-sky-500"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full bg-sky-600 text-white text-[10px] font-mono font-bold">
                  {unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-12 z-40 w-80 rounded-xl border border-slate-200 dark:border-sky-800 bg-white dark:bg-[#0B223B] shadow-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-sky-50">
                    Realtime Notifications
                  </h4>
                  <button type="button" onClick={() => setNotifOpen(false)}>
                    <X className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                </div>
                {notifications.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-sky-200/65">
                    No notifications yet.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`p-2.5 rounded-lg border text-xs ${
                          n.read
                            ? 'border-slate-100 dark:border-sky-900/40 opacity-70'
                            : 'border-sky-300 dark:border-sky-700 bg-sky-50/60 dark:bg-sky-950/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-slate-900 dark:text-sky-50">{n.title}</p>
                          {!n.read && (
                            <button
                              type="button"
                              onClick={() => void markNotificationRead(n.id)}
                              className="text-sky-700 dark:text-sky-400"
                              title="Mark read"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-sky-200/75 mt-0.5">
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
              <div className="p-4 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B]">
                <p className="text-xs text-slate-500 dark:text-sky-200/70">Visible Pickup Requests</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50 mt-1">
                  {recentPickups.length}
                </p>
                <p className="text-xs text-slate-500 dark:text-sky-200/65 mt-1">
                  {recentPickups.filter((p) => p.status !== 'Completed' && p.status !== 'Cancelled').length} active in queue
                </p>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B]">
                <p className="text-xs text-slate-500 dark:text-sky-200/70">Platform E-Waste Mass</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50 mt-1">
                  {analytics?.totalCollectedKg.toLocaleString() ?? 0} kg
                </p>
                <p className="text-xs text-sky-700 dark:text-sky-400 mt-1">
                  {analytics?.landfillDiversionPct ?? 0}% landfill diversion
                </p>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B]">
                <p className="text-xs text-slate-500 dark:text-sky-200/70">CO₂e Avoided</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-sky-700 dark:text-sky-400 mt-1">
                  {analytics?.estimatedCo2AvoidedKg.toLocaleString() ?? 0} kg
                </p>
                <p className="text-xs text-slate-500 dark:text-sky-200/65 mt-1">
                  {analytics?.optimizationRunsCount ?? 0} optimization runs logged
                </p>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B]">
                <p className="text-xs text-slate-500 dark:text-sky-200/70">Registered Fleet &amp; Hubs</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50 mt-1">
                  {vehicles.length} / {facilities.length}
                </p>
                <p className="text-xs text-slate-500 dark:text-sky-200/65 mt-1">
                  Vehicles &amp; recycling facilities
                </p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                type="button"
                onClick={() => setActiveTab('schedule')}
                className="p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] hover:border-sky-500 text-left space-y-1.5 transition-colors"
              >
                <CalendarClock className="w-5 h-5 text-sky-500" />
                <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50">
                  Schedule Doorstep Pickup
                </h4>
                <p className="text-xs text-slate-500 dark:text-sky-200/70">
                  Reserve a collection time slot from your location with GPS pinning and live sync.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('optimizer')}
                className="p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] hover:border-sky-500 text-left space-y-1.5 transition-colors"
              >
                <Route className="w-5 h-5 text-sky-500" />
                <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50">
                  Run Logistics Optimizer
                </h4>
                <p className="text-xs text-slate-500 dark:text-sky-200/70">
                  Optimize collection routes for minimum cost, distance, or emissions.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('workspace')}
                className="p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] hover:border-sky-500 text-left space-y-1.5 transition-colors"
              >
                <Cloud className="w-5 h-5 text-sky-500" />
                <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50">
                  Workspace Hub &amp; Visual Studio
                </h4>
                <p className="text-xs text-slate-500 dark:text-sky-200/70">
                  Sync pickups with Google Calendar, export ESG data to Drive, send Gmail receipts, or craft campaign art.
                </p>
              </button>
            </div>

            {/* Live Monthly Targets Summary Widget */}
            <MonthlyTargetsPanel
              pickups={recentPickups}
              compact
              onOpenFullTab={() => setActiveTab('targets')}
            />

            {/* D3.js Recycling Impact Trends Preview */}
            <D3ImpactVisualizer analytics={analytics} pickups={recentPickups} compact />

            {/* Recent Pickups Snapshot */}
            <div className="rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] overflow-x-auto">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-sky-900/60 flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50">
                  Recent Collection Activity
                </h4>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleExportCollectionCsv}
                    className="text-xs font-medium text-slate-600 dark:text-sky-300 hover:text-sky-600 dark:hover:text-sky-200 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('pickups')}
                    className="text-xs font-medium text-sky-700 dark:text-sky-400 hover:underline cursor-pointer"
                  >
                    View All
                  </button>
                </div>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-[#061526] text-slate-500 dark:text-sky-200/70">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Code</th>
                    <th className="px-4 py-2.5 font-medium">Device</th>
                    <th className="px-4 py-2.5 font-medium">Weight</th>
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-sky-900/50">
                  {recentPickups.slice(0, 6).map((p) => (
                    <tr key={p.id} className="text-slate-700 dark:text-sky-100/90">
                      <td className="px-4 py-2.5 font-mono font-semibold text-sky-700 dark:text-sky-400">
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

        {activeTab === 'impact' && (
          <D3ImpactVisualizer analytics={analytics} pickups={recentPickups} />
        )}

        {activeTab === 'targets' && (
          <MonthlyTargetsPanel pickups={recentPickups} />
        )}

        {activeTab === 'voice' && (
          <div className="max-w-3xl space-y-4">
            <p className="text-xs text-slate-600 dark:text-sky-200/75">
              Speak directly with EcoBot Voice in real time via the Gemini Live API (`gemini-3.8-live`) for hands-free e-waste recycling guidance, pickup advice, and goal planning.
            </p>
            <LiveVoicePanel />
          </div>
        )}

        {activeTab === 'transcribe' && <AudioTranscriberPanel />}

        {activeTab === 'intel' && (
          <LiveSearchIntelPanel
            title="Live E-Waste & Circular Economy Web Intel"
            subtitle="Real-time Google Search grounded market benchmarks, CPCB regulatory circulars, OEM take-back programs, and circular economy news."
          />
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

        {activeTab === 'settings' && <UserProfilePanel />}
      </main>
    </div>
  );
};
