import React, { useMemo, useState } from 'react';
import {
  Bell,
  Building2,
  CalendarClock,
  Check,
  CheckCheck,
  CheckCircle2,
  MapPin,
  RefreshCw,
  Route,
  Search,
  Sparkles,
  Target,
  Trash2,
  Truck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { Facility, FirestoreNotification, PickupRequest, Vehicle } from '../types';

export const COLLECTOR_ACCEPTED_STATUSES = [
  'Approved',
  'Scheduled',
  'Transporter Assigned',
  'Collected',
  'Received at Facility',
  'Processing',
  'Completed',
] as const;

export interface AreaFacilityMatch {
  facility: Facility;
  distanceKm: number | null;
  matchedCategories: string[];
  availableCapacityKg: number;
  matchReason: string;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function findAreaFacilityMatches(params: {
  facilities: Facility[];
  pickups: PickupRequest[];
  city?: string | null;
  radiusKm?: number;
}): AreaFacilityMatch[] {
  const { facilities, pickups, city, radiusKm = 40 } = params;
  const verified = facilities.filter((f) => f.verified && f.capacityKg - f.currentLoadKg > 0);
  if (verified.length === 0) return [];

  const normalizedCity = (city || '').trim().toLowerCase();
  const activePickups = pickups.filter((p) => p.status !== 'Cancelled' && p.status !== 'Completed');
  const wantedCategories = Array.from(new Set(activePickups.map((p) => p.category)));

  // Use most recent pickup coordinates if available
  const anchorPickup = pickups.find(
    (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && (p.lat !== 0 || p.lng !== 0)
  );

  const matches: AreaFacilityMatch[] = [];

  for (const facility of verified) {
    const availKg = Math.max(0, Math.round(facility.capacityKg - facility.currentLoadKg));
    const facCity = facility.city.toLowerCase();
    const facState = facility.state.toLowerCase();
    const facAddress = facility.address.toLowerCase();

    const cityMatch =
      normalizedCity.length >= 2 &&
      (facCity.includes(normalizedCity) ||
        normalizedCity.includes(facCity) ||
        facState.includes(normalizedCity) ||
        facAddress.includes(normalizedCity));

    const distanceKm = anchorPickup
      ? Number(haversineKm(anchorPickup.lat, anchorPickup.lng, facility.lat, facility.lng).toFixed(1))
      : null;

    const geoMatch = distanceKm !== null && distanceKm <= radiusKm;

    const acceptedLower = facility.acceptedCategories.toLowerCase();
    const matchedCategories = wantedCategories.filter((cat) => {
      const token = cat.toLowerCase().split('&')[0].trim();
      return acceptedLower.includes(cat.toLowerCase()) || (token.length >= 3 && acceptedLower.includes(token));
    });

    if (cityMatch || geoMatch || (!normalizedCity && !anchorPickup)) {
      const reasons: string[] = [];
      if (geoMatch && distanceKm !== null) reasons.push(`${distanceKm} km from your pickup location`);
      if (cityMatch) reasons.push(`Serves ${facility.city}`);
      if (matchedCategories.length > 0) {
        reasons.push(`Accepts ${matchedCategories.slice(0, 2).join(', ')}`);
      }
      if (reasons.length === 0) {
        reasons.push(`Verified hub in ${facility.city}, ${facility.state}`);
      }

      matches.push({
        facility,
        distanceKm,
        matchedCategories,
        availableCapacityKg: availKg,
        matchReason: reasons.join(' · '),
      });
    }
  }

  matches.sort((a, b) => {
    if (b.matchedCategories.length !== a.matchedCategories.length) {
      return b.matchedCategories.length - a.matchedCategories.length;
    }
    if (a.distanceKm !== null && b.distanceKm !== null) {
      return a.distanceKm - b.distanceKm;
    }
    return b.availableCapacityKg - a.availableCapacityKg;
  });

  return matches;
}

function formatNotificationTime(createdAt: any): string {
  const ms =
    typeof createdAt?.toMillis === 'function'
      ? createdAt.toMillis()
      : typeof createdAt === 'number'
        ? createdAt
        : typeof createdAt === 'string'
          ? Date.parse(createdAt)
          : 0;
  if (!ms || Number.isNaN(ms)) return 'Just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface NotificationCenterPanelProps {
  pickups: PickupRequest[];
  facilities: Facility[];
  vehicles: Vehicle[];
  onRefreshData: () => void;
  onScanNow: (overrideCity?: string) => Promise<number>;
  onNavigateTab: (tab: 'pickups' | 'facilities' | 'schedule' | 'targets' | 'optimizer') => void;
}

type FilterMode = 'all' | 'unread' | 'pickup' | 'facility' | 'goal' | 'system';

export const NotificationCenterPanel: React.FC<NotificationCenterPanelProps> = ({
  pickups,
  facilities,
  vehicles,
  onRefreshData,
  onScanNow,
  onNavigateTab,
}) => {
  const {
    dbUser,
    firestoreProfile,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
  } = useAuth();

  const [filter, setFilter] = useState<FilterMode>('all');
  const [searchText, setSearchText] = useState('');
  const [areaQuery, setAreaQuery] = useState(firestoreProfile?.city || dbUser?.city || '');
  const [scanning, setScanning] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<string | null>(null);

  const activeCity = areaQuery.trim() || firestoreProfile?.city || dbUser?.city || '';

  const areaMatches = useMemo(
    () =>
      findAreaFacilityMatches({
        facilities,
        pickups,
        city: activeCity,
      }),
    [facilities, pickups, activeCity]
  );

  const acceptedPickups = useMemo(
    () =>
      pickups.filter((p) =>
        (COLLECTOR_ACCEPTED_STATUSES as readonly string[]).includes(p.status)
      ),
    [pickups]
  );

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);
  const pickupAlertCount = useMemo(
    () => notifications.filter((n) => n.category === 'pickup').length,
    [notifications]
  );
  const facilityAlertCount = useMemo(
    () => notifications.filter((n) => n.category === 'facility').length,
    [notifications]
  );

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (filter === 'unread' && n.read) return false;
      if (filter !== 'all' && filter !== 'unread' && n.category !== filter) return false;
      if (searchText.trim()) {
        const q = searchText.toLowerCase();
        return (
          n.title.toLowerCase().includes(q) ||
          n.message.toLowerCase().includes(q) ||
          n.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [notifications, filter, searchText]);

  const handleRunScan = async () => {
    setScanning(true);
    setScanFeedback(null);
    try {
      onRefreshData();
      const created = await onScanNow(activeCity);
      setScanFeedback(
        created > 0
          ? `Added ${created} new real-time alert${created === 1 ? '' : 's'} for your pickups and area matches.`
          : 'You are up to date — no new collector acceptances or unseen collection center matches right now.'
      );
    } catch {
      setScanFeedback('Unable to check for new alerts right now.');
    } finally {
      setScanning(false);
    }
  };

  const renderCategoryBadge = (category: FirestoreNotification['category']) => {
    switch (category) {
      case 'pickup':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/70">
            <Truck className="w-3 h-3" />
            Collector Update
          </span>
        );
      case 'facility':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-sky-100 dark:bg-sky-950/70 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800/70">
            <MapPin className="w-3 h-3" />
            Area Centre Match
          </span>
        );
      case 'goal':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/70">
            <Target className="w-3 h-3" />
            Goal Milestone
          </span>
        );
      case 'optimization':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-100 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/70">
            <Route className="w-3 h-3" />
            Route Plan
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 dark:bg-sky-900/60 text-slate-700 dark:text-sky-200 border border-slate-200 dark:border-sky-800/70">
            <Bell className="w-3 h-3" />
            System
          </span>
        );
    }
  };

  const facilityById = useMemo(() => new Map(facilities.map((f) => [f.id, f])), [facilities]);
  const vehicleById = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);

  return (
    <div className="space-y-6">
      {/* KPI Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B]">
          <p className="text-xs text-slate-500 dark:text-sky-200/70">Unread Alerts</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-sky-700 dark:text-sky-400 mt-1">
            {unreadCount}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-sky-200/65 mt-0.5">
            {notifications.length} total in inbox
          </p>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B]">
          <p className="text-xs text-slate-500 dark:text-sky-200/70">Pickup Acceptances</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-1">
            {acceptedPickups.length}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-sky-200/65 mt-0.5">
            {pickupAlertCount} collector alert{pickupAlertCount === 1 ? '' : 's'} logged
          </p>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B]">
          <p className="text-xs text-slate-500 dark:text-sky-200/70">Area Centre Matches</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50 mt-1">
            {areaMatches.length}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-sky-200/65 mt-0.5">
            {activeCity ? `Near ${activeCity}` : 'Across verified hubs'}
          </p>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B]">
          <p className="text-xs text-slate-500 dark:text-sky-200/70">Centre Match Alerts</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50 mt-1">
            {facilityAlertCount}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-sky-200/65 mt-0.5">
            Live Firestore sync active
          </p>
        </div>
      </div>

      {/* Live Watch Controls */}
      <div className="p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-sky-50 inline-flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-500" />
              Live Pickup Acceptance &amp; Area Match Watch
            </h3>
            <p className="text-xs text-slate-500 dark:text-sky-200/70 mt-0.5">
              Automatically alerts you when a collector accepts a scheduled pickup or when verified collection centres match your area and waste categories.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <MapPin className="w-3.5 h-3.5 text-sky-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={areaQuery}
                onChange={(e) => setAreaQuery(e.target.value)}
                placeholder="Monitor city (e.g. Delhi, Noida)"
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50 w-52 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <button
              type="button"
              disabled={scanning}
              onClick={() => void handleRunScan()}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 hover:bg-sky-700 dark:hover:bg-sky-400 text-white dark:text-sky-950 inline-flex items-center gap-1.5 disabled:opacity-60 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
              Scan Pickups &amp; Area Matches
            </button>
          </div>
        </div>

        {scanFeedback && (
          <p className="text-xs text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800/70 px-3 py-2 rounded-lg">
            {scanFeedback}
          </p>
        )}
      </div>

      {/* Main Split: Notification Inbox + Live Matches Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Inbox Feed */}
        <div className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-200 dark:border-sky-900/60 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'all', label: `All (${notifications.length})` },
                    { id: 'unread', label: `Unread (${unreadCount})` },
                    { id: 'pickup', label: 'Pickup Accepted' },
                    { id: 'facility', label: 'Area Matches' },
                    { id: 'goal', label: 'Goals' },
                    { id: 'system', label: 'System' },
                  ] as { id: FilterMode; label: string }[]
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilter(tab.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      filter === tab.id
                        ? 'bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 font-semibold'
                        : 'text-slate-600 dark:text-sky-200/75 hover:bg-slate-100 dark:hover:bg-sky-900/40'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllNotificationsRead()}
                  className="text-xs font-semibold text-sky-700 dark:text-sky-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Mark all read
                </button>
              )}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search alerts by request code, collector, or facility name..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-sky-900/50 max-h-[560px] overflow-y-auto">
            {filteredNotifications.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <Bell className="w-8 h-8 text-slate-300 dark:text-sky-800 mx-auto" />
                <p className="text-sm font-medium text-slate-700 dark:text-sky-100">
                  No alerts match this view
                </p>
                <p className="text-xs text-slate-500 dark:text-sky-200/65 max-w-sm mx-auto">
                  When a collector accepts your pickup request or a verified collection center matches your area, it will appear here immediately.
                </p>
              </div>
            ) : (
              filteredNotifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-4 transition-colors ${
                    n.read
                      ? 'bg-white dark:bg-[#0B223B]'
                      : 'bg-sky-50/60 dark:bg-sky-950/35'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {!n.read && (
                          <span
                            className="w-2 h-2 rounded-full bg-sky-500 shrink-0"
                            title="Unread"
                          />
                        )}
                        {renderCategoryBadge(n.category)}
                        <span className="text-[11px] text-slate-400 dark:text-sky-300/60">
                          {formatNotificationTime(n.createdAt)}
                        </span>
                      </div>

                      <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50">
                        {n.title}
                      </h4>
                      <p className="text-xs text-slate-600 dark:text-sky-200/80 leading-relaxed">
                        {n.message}
                      </p>

                      <div className="pt-1 flex flex-wrap items-center gap-3">
                        {n.category === 'pickup' && (
                          <button
                            type="button"
                            onClick={() => onNavigateTab('pickups')}
                            className="text-[11px] font-semibold text-sky-700 dark:text-sky-400 hover:underline cursor-pointer"
                          >
                            View Pickup Requests →
                          </button>
                        )}
                        {n.category === 'facility' && (
                          <button
                            type="button"
                            onClick={() => onNavigateTab('facilities')}
                            className="text-[11px] font-semibold text-sky-700 dark:text-sky-400 hover:underline cursor-pointer"
                          >
                            Explore Facility Map →
                          </button>
                        )}
                        {n.category === 'goal' && (
                          <button
                            type="button"
                            onClick={() => onNavigateTab('targets')}
                            className="text-[11px] font-semibold text-sky-700 dark:text-sky-400 hover:underline cursor-pointer"
                          >
                            Open Monthly Targets →
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {!n.read && (
                        <button
                          type="button"
                          onClick={() => void markNotificationRead(n.id)}
                          title="Mark as read"
                          className="p-1.5 rounded-lg text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/50 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void deleteNotification(n.id)}
                        title="Dismiss alert"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Rail: Accepted Pickups & Matched Area Collection Centres */}
        <div className="lg:col-span-4 space-y-5">
          {/* Accepted Pickups Snapshot */}
          <div className="p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50 inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                Collector-Accepted Pickups
              </h4>
              <button
                type="button"
                onClick={() => onNavigateTab('pickups')}
                className="text-[11px] font-medium text-sky-700 dark:text-sky-400 hover:underline cursor-pointer"
              >
                Manage
              </button>
            </div>
            {acceptedPickups.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-sky-200/70">
                No pickups accepted by a collector yet. Schedule a pickup to receive live acceptance alerts.
              </p>
            ) : (
              <div className="space-y-2">
                {acceptedPickups.slice(0, 4).map((p) => {
                  const fac = p.assignedFacilityId ? facilityById.get(p.assignedFacilityId) : null;
                  const veh = p.assignedVehicleId ? vehicleById.get(p.assignedVehicleId) : null;
                  return (
                    <div
                      key={p.id}
                      className="p-3 rounded-lg border border-slate-200/80 dark:border-sky-900/60 bg-slate-50/70 dark:bg-[#061526] space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono font-semibold text-sky-700 dark:text-sky-400">
                          {p.requestCode}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 text-[10px] font-semibold">
                          {p.status}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-slate-800 dark:text-sky-100 truncate">
                        {p.deviceName} · {p.estimatedWeightKg} kg
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-sky-200/70 truncate">
                        {fac ? fac.name : 'Assigned collector'}
                        {veh ? ` · ${veh.registrationNo}` : ''}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Matched Area Collection Centres */}
          <div className="p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50 inline-flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-sky-500" />
                Matched Centres in Your Area
              </h4>
              <button
                type="button"
                onClick={() => onNavigateTab('facilities')}
                className="text-[11px] font-medium text-sky-700 dark:text-sky-400 hover:underline cursor-pointer"
              >
                Map
              </button>
            </div>

            {areaMatches.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-sky-200/70">
                No verified collection centers matched "{activeCity}". Clear the city filter or try another nearby city.
              </p>
            ) : (
              <div className="space-y-2.5">
                {areaMatches.slice(0, 4).map((m) => {
                  const utilPct = Math.min(
                    100,
                    Math.round((m.facility.currentLoadKg / Math.max(1, m.facility.capacityKg)) * 100)
                  );
                  return (
                    <div
                      key={m.facility.id}
                      className="p-3 rounded-lg border border-slate-200/80 dark:border-sky-900/60 bg-slate-50/70 dark:bg-[#061526] space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-900 dark:text-sky-50">
                          {m.facility.name}
                        </p>
                        {m.distanceKm !== null && (
                          <span className="text-[10px] font-mono text-sky-700 dark:text-sky-300 shrink-0">
                            {m.distanceKm} km
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-sky-200/70">
                        {m.matchReason}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-sky-300/70">
                        <span>Available capacity: {m.availableCapacityKg.toLocaleString()} kg</span>
                        <span className="font-mono">{utilPct}% full</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-200 dark:bg-sky-950 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-sky-500"
                          style={{ width: `${utilPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => onNavigateTab('schedule')}
                  className="w-full py-2 rounded-lg border border-sky-300 dark:border-sky-800 text-xs font-semibold text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/50 inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <CalendarClock className="w-3.5 h-3.5" />
                  Schedule Pickup with a Matched Centre
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
