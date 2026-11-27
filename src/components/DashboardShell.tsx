import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  AudioLines,
  Award,
  BarChart3,
  BatteryCharging,
  Bell,
  BellRing,
  Boxes,
  CalendarClock,
  Check,
  CheckCheck,
  Clapperboard,
  Cloud,
  Download,
  Gamepad2,
  Globe,
  History,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  MapPin,
  Mic,
  Music,
  PackageCheck,
  Repeat,
  Route,
  Settings,
  ShieldCheck,
  Target,
  Trash2,
  TrendingUp,
  Trophy,
  Truck,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import {
  ROLE_LABELS,
  type AnalyticsSummary,
  type BuyBackAlertCondition,
  type BuyBackCategoryId,
  type BuyBackMarketQuote,
  type Facility,
  type LeaderboardProfile,
  type LivePricePushToast,
  type MarketPriceAlert,
  type PickupRequest,
  type UserRole,
  type Vehicle,
} from '../types';
import {
  createUserPriceAlert,
  deleteUserPriceAlert,
  recordPriceAlertTrigger,
  removeUserLeaderboardProfile,
  subscribeCommunityLeaderboard,
  subscribeUserPriceAlerts,
  updateUserPriceAlertConfig,
  upsertUserLeaderboardProfile,
} from '../lib/firebase';
import {
  createInitialMarketQuotes,
  dispatchBrowserPushNotification,
  doesQuoteMeetAlert,
  formatInrPerKg,
  getBrowserPushStatus,
  requestBrowserPushPermission,
  simulateCategoryPriceMove,
  stepMarketQuotes,
  type BrowserPushPermissionState,
} from '../lib/buybackMarket';
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
import { ImageToVideoPanel } from './ImageToVideoPanel';
import { ImageStudioPanel } from './ImageStudioPanel';
import { MusicStudioPanel } from './MusicStudioPanel';
import { UserProfilePanel } from './UserProfilePanel';
import {
  COLLECTOR_ACCEPTED_STATUSES,
  NotificationCenterPanel,
  findAreaFacilityMatches,
} from './NotificationCenterPanel';
import { PickupHistoryLog, type PickupPrefillTemplate } from './PickupHistoryLog';
import { CarbonSavedWidget } from './CarbonSavedWidget';
import { CircularMarketplace } from './CircularMarketplace';
import { BuyBackPriceAlertsPanel } from './BuyBackPriceAlertsPanel';
import { DailyEwasteFactCard } from './DailyEwasteFactCard';
import { BatteryHealthCalculator } from './BatteryHealthCalculator';
import { CommunityLeaderboardWidget } from './CommunityLeaderboardWidget';
import { computeEcoExperience } from '../lib/ecoLevelSystem';

type DashTab =
  | 'overview'
  | 'notifications'
  | 'market-alerts'
  | 'impact'
  | 'targets'
  | 'leaderboard'
  | 'voice'
  | 'transcribe'
  | 'images'
  | 'animate'
  | 'music'
  | 'intel'
  | 'schedule'
  | 'pickups'
  | 'history'
  | 'marketplace'
  | 'battery-health'
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
  onLaunchGame?: () => void;
}

export const DashboardShell: React.FC<DashboardShellProps> = ({
  analytics,
  facilities,
  onRefreshGlobal,
  onExitDashboard,
  onLaunchGame,
}) => {
  const {
    dbUser,
    firebaseUser,
    firestoreProfile,
    isAuthenticated,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
    pushNotification,
    signOut,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<DashTab>('overview');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [recentPickups, setRecentPickups] = useState<PickupRequest[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [reorderPrefill, setReorderPrefill] = useState<PickupPrefillTemplate | null>(null);
  const inFlightAlertKeysRef = useRef<Set<string>>(new Set());

  // Buy-Back Market Price Push Notification State
  const [marketQuotes, setMarketQuotes] = useState<BuyBackMarketQuote[]>(() =>
    createInitialMarketQuotes()
  );
  const [priceAlerts, setPriceAlerts] = useState<MarketPriceAlert[]>([]);
  const [autoRefreshMarket, setAutoRefreshMarket] = useState(true);
  const [pushPermission, setPushPermission] = useState<BrowserPushPermissionState>(() =>
    getBrowserPushStatus()
  );
  const [pushToasts, setPushToasts] = useState<LivePricePushToast[]>([]);
  const alertCooldownMapRef = useRef<Map<string, number>>(new Map());

  // Community Leaderboard State (real-time Firestore + Eco Experience sync)
  const [leaderboardProfiles, setLeaderboardProfiles] = useState<LeaderboardProfile[]>([]);
  const [isListedOnLeaderboard, setIsListedOnLeaderboard] = useState<boolean>(true);
  const [syncingLeaderboard, setSyncingLeaderboard] = useState(false);
  const [leaderboardSyncNotice, setLeaderboardSyncNotice] = useState<string | null>(null);
  const lastLeaderboardSigRef = useRef<string>('');

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
  const ecoExperience = useMemo(() => computeEcoExperience(recentPickups, false), [recentPickups]);

  const currentLeaderboardUid = firebaseUser?.uid || dbUser?.uid || 'local';
  const currentLeaderboardName =
    firestoreProfile?.fullName || dbUser?.fullName || firebaseUser?.displayName || 'Eco Recycler';
  const currentLeaderboardCity =
    (firestoreProfile?.city || dbUser?.city || '').trim() || 'New Delhi';

  // Restore per-user leaderboard visibility preference
  useEffect(() => {
    if (!isAuthenticated) return;
    try {
      const stored = localStorage.getItem(`reboot_earth_lb_visible_${currentLeaderboardUid}`);
      setIsListedOnLeaderboard(stored === 'false' ? false : true);
    } catch {
      setIsListedOnLeaderboard(true);
    }
  }, [isAuthenticated, currentLeaderboardUid]);

  // Subscribe to real-time community leaderboard profiles in Firestore
  useEffect(() => {
    if (!isAuthenticated || !firebaseUser) {
      setLeaderboardProfiles([]);
      return;
    }
    let unsub: (() => void) | undefined;
    try {
      unsub = subscribeCommunityLeaderboard((profiles) => {
        setLeaderboardProfiles(profiles);
      });
    } catch {
      // Non-fatal fallback
    }
    return () => unsub?.();
  }, [isAuthenticated, firebaseUser]);

  const handleSyncLeaderboardRank = useCallback(
    async (cityOverride?: string) => {
      const targetCity = (cityOverride || currentLeaderboardCity || 'New Delhi').trim();
      setSyncingLeaderboard(true);
      try {
        if (firebaseUser && firebaseUser.emailVerified && isListedOnLeaderboard) {
          await upsertUserLeaderboardProfile(firebaseUser.uid, {
            displayName: currentLeaderboardName,
            city: targetCity,
            verifiedRecycledKg: ecoExperience.verifiedRecycledKg,
            pickupsCount: ecoExperience.verifiedPickupsCount,
            ecoLevel: ecoExperience.currentTier.level,
            levelTitle: ecoExperience.currentTier.title,
            badgesCount: ecoExperience.unlockedBadgesCount,
          });
          setLeaderboardSyncNotice('Synced to cloud');
        } else {
          setLeaderboardSyncNotice('Standing updated');
        }
        window.setTimeout(() => setLeaderboardSyncNotice(null), 2600);
      } catch {
        setLeaderboardSyncNotice('Sync unavailable');
        window.setTimeout(() => setLeaderboardSyncNotice(null), 2600);
      } finally {
        setSyncingLeaderboard(false);
      }
    },
    [
      firebaseUser,
      isListedOnLeaderboard,
      currentLeaderboardName,
      currentLeaderboardCity,
      ecoExperience,
    ]
  );

  const handleToggleLeaderboardVisibility = useCallback(
    async (nextVisible: boolean, cityOverride: string) => {
      setIsListedOnLeaderboard(nextVisible);
      try {
        localStorage.setItem(`reboot_earth_lb_visible_${currentLeaderboardUid}`, String(nextVisible));
      } catch {
        // Ignore storage errors
      }
      if (!firebaseUser || !firebaseUser.emailVerified) return;
      setSyncingLeaderboard(true);
      try {
        if (nextVisible) {
          await upsertUserLeaderboardProfile(firebaseUser.uid, {
            displayName: currentLeaderboardName,
            city: cityOverride || currentLeaderboardCity,
            verifiedRecycledKg: ecoExperience.verifiedRecycledKg,
            pickupsCount: ecoExperience.verifiedPickupsCount,
            ecoLevel: ecoExperience.currentTier.level,
            levelTitle: ecoExperience.currentTier.title,
            badgesCount: ecoExperience.unlockedBadgesCount,
          });
          setLeaderboardSyncNotice('Listed on leaderboard');
        } else {
          await removeUserLeaderboardProfile(firebaseUser.uid);
          lastLeaderboardSigRef.current = '';
          setLeaderboardSyncNotice('Removed from leaderboard');
        }
        window.setTimeout(() => setLeaderboardSyncNotice(null), 2600);
      } catch {
        // Non-fatal
      } finally {
        setSyncingLeaderboard(false);
      }
    },
    [
      currentLeaderboardUid,
      firebaseUser,
      currentLeaderboardName,
      currentLeaderboardCity,
      ecoExperience,
    ]
  );

  // Auto-sync user's verified recycling progress to Firestore leaderboardProfiles when stats change
  useEffect(() => {
    if (!isAuthenticated || !firebaseUser || !firebaseUser.emailVerified || !isListedOnLeaderboard) {
      return;
    }
    const sig = [
      firebaseUser.uid,
      currentLeaderboardName,
      currentLeaderboardCity,
      ecoExperience.verifiedRecycledKg,
      ecoExperience.verifiedPickupsCount,
      ecoExperience.currentTier.level,
      ecoExperience.unlockedBadgesCount,
    ].join('|');
    if (lastLeaderboardSigRef.current === sig) return;
    lastLeaderboardSigRef.current = sig;

    void upsertUserLeaderboardProfile(firebaseUser.uid, {
      displayName: currentLeaderboardName,
      city: currentLeaderboardCity,
      verifiedRecycledKg: ecoExperience.verifiedRecycledKg,
      pickupsCount: ecoExperience.verifiedPickupsCount,
      ecoLevel: ecoExperience.currentTier.level,
      levelTitle: ecoExperience.currentTier.title,
      badgesCount: ecoExperience.unlockedBadgesCount,
    }).catch(() => {});
  }, [
    isAuthenticated,
    firebaseUser,
    isListedOnLeaderboard,
    currentLeaderboardName,
    currentLeaderboardCity,
    ecoExperience,
  ]);

  const scanForPickupAndFacilityAlerts = useCallback(
    async (overrideCity?: string): Promise<number> => {
      if (!isAuthenticated) return 0;
      const uid = firebaseUser?.uid || dbUser?.uid;
      if (!uid) return 0;

      const storageKey = `reboot_earth_notif_seen_v1_${uid}`;
      let seen: { pickupStatuses: Record<string, string>; facilityIds: number[] } = {
        pickupStatuses: {},
        facilityIds: [],
      };
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            seen = {
              pickupStatuses:
                parsed.pickupStatuses && typeof parsed.pickupStatuses === 'object'
                  ? parsed.pickupStatuses
                  : {},
              facilityIds: Array.isArray(parsed.facilityIds) ? parsed.facilityIds : [],
            };
          }
        }
      } catch {
        // Ignore corrupted localStorage cache
      }

      let emittedCount = 0;
      const acceptedSet = new Set<string>(COLLECTOR_ACCEPTED_STATUSES);
      const facilityById = new Map(facilities.map((f) => [f.id, f]));
      const vehicleById = new Map(vehicles.map((v) => [v.id, v]));

      // Scope pickup alerts to the user's own scheduled requests
      const ownPickups = recentPickups.filter((p) => {
        if (p.userUid && uid) return p.userUid === uid;
        return role === 'citizen' || role === 'organization';
      });

      for (const pickup of ownPickups) {
        if (!acceptedSet.has(pickup.status)) continue;
        if (seen.pickupStatuses[pickup.requestCode] === pickup.status) continue;

        const flightKey = `pickup:${pickup.requestCode}:${pickup.status}`;
        if (inFlightAlertKeysRef.current.has(flightKey)) continue;
        inFlightAlertKeysRef.current.add(flightKey);

        try {
          const facility = pickup.assignedFacilityId
            ? facilityById.get(pickup.assignedFacilityId)
            : undefined;
          const vehicle = pickup.assignedVehicleId
            ? vehicleById.get(pickup.assignedVehicleId)
            : undefined;

          const title = `Collector Update: ${pickup.requestCode} is ${pickup.status}`.slice(0, 140);
          const details: string[] = [
            `Your pickup for ${pickup.deviceName} (${pickup.estimatedWeightKg} kg) has been accepted/updated to "${pickup.status}".`,
          ];
          if (facility) {
            details.push(`Assigned center: ${facility.name} (${facility.city}).`);
          }
          if (vehicle) {
            details.push(`Collector vehicle: ${vehicle.registrationNo} (${vehicle.vehicleType}).`);
          }
          details.push(`Scheduled window: ${pickup.preferredDate} · ${pickup.timeSlot}.`);

          await pushNotification({
            title,
            message: details.join(' ').slice(0, 500),
            category: 'pickup',
          });

          seen.pickupStatuses[pickup.requestCode] = pickup.status;
          emittedCount += 1;
        } catch {
          // Non-fatal
        } finally {
          inFlightAlertKeysRef.current.delete(flightKey);
        }
      }

      // Check for new verified collection center matches in the user's area
      const targetCity =
        (overrideCity && overrideCity.trim()) ||
        firestoreProfile?.city ||
        dbUser?.city ||
        '';
      const matches = findAreaFacilityMatches({
        facilities,
        pickups: ownPickups,
        city: targetCity,
        radiusKm: 40,
      });

      const seenFacilitySet = new Set(seen.facilityIds);
      const newMatches = matches.filter((m) => !seenFacilitySet.has(m.facility.id));

      if (newMatches.length > 0) {
        const batchKey = `facility:${newMatches.map((m) => m.facility.id).join(',')}`;
        if (!inFlightAlertKeysRef.current.has(batchKey)) {
          inFlightAlertKeysRef.current.add(batchKey);
          try {
            if (newMatches.length <= 2) {
              for (const m of newMatches) {
                const distText =
                  m.distanceKm !== null ? `${m.distanceKm} km away` : `${m.facility.city}`;
                const acceptedList = m.facility.acceptedCategories
                  .split(',')
                  .map((c) => c.trim())
                  .filter(Boolean);
                const catText =
                  m.matchedCategories.length > 0
                    ? `Matches your categories: ${m.matchedCategories.slice(0, 3).join(', ')}.`
                    : acceptedList.length > 0
                    ? `Accepts: ${acceptedList.slice(0, 3).join(', ')}.`
                    : 'Verified for multi-category e-waste intake.';

                await pushNotification({
                  title: `New Collection Center Match: ${m.facility.name}`.slice(0, 140),
                  message: `${m.facility.name} (${distText}) is verified with ${m.availableCapacityKg.toLocaleString()} kg open capacity. ${catText}`.slice(
                    0,
                    500
                  ),
                  category: 'facility',
                });
                seen.facilityIds.push(m.facility.id);
                emittedCount += 1;
              }
            } else {
              const topNames = newMatches
                .slice(0, 3)
                .map((m) => m.facility.name)
                .join(', ');
              const areaLabel = targetCity || newMatches[0].facility.city || 'your area';
              await pushNotification({
                title: `${newMatches.length} Collection Centers Matched Near ${areaLabel}`.slice(
                  0,
                  140
                ),
                message: `Verified e-waste centers with available capacity are ready in your area, including ${topNames}. Open the Facility Map or Notification Center to inspect details.`.slice(
                  0,
                  500
                ),
                category: 'facility',
              });
              for (const m of newMatches) {
                seen.facilityIds.push(m.facility.id);
              }
              emittedCount += 1;
            }
          } catch {
            // Non-fatal
          } finally {
            inFlightAlertKeysRef.current.delete(batchKey);
          }
        }
      }

      if (emittedCount > 0) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(seen));
        } catch {
          // Ignore storage quota errors
        }
      }

      return emittedCount;
    },
    [
      isAuthenticated,
      firebaseUser?.uid,
      dbUser?.uid,
      dbUser?.city,
      firestoreProfile?.city,
      facilities,
      vehicles,
      recentPickups,
      role,
      pushNotification,
    ]
  );

  useEffect(() => {
    if (!isAuthenticated || facilities.length === 0) return;
    void scanForPickupAndFacilityAlerts();
  }, [isAuthenticated, facilities.length, recentPickups, scanForPickupAndFacilityAlerts]);

  // Subscribe to owner-scoped Firestore priceAlerts (with local fallback for local-auth sessions)
  useEffect(() => {
    if (!isAuthenticated) {
      setPriceAlerts([]);
      return;
    }
    const uid = firebaseUser?.uid || dbUser?.uid || 'local';
    if (firebaseUser && firebaseUser.emailVerified) {
      let unsub: (() => void) | undefined;
      try {
        unsub = subscribeUserPriceAlerts(firebaseUser.uid, (items) => {
          setPriceAlerts(items);
        });
      } catch (err) {
        console.warn('Price alerts Firestore listener unavailable:', err);
      }
      return () => unsub?.();
    }

    try {
      const raw = localStorage.getItem(`reboot_earth_price_alerts_${uid}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setPriceAlerts(parsed as MarketPriceAlert[]);
          return;
        }
      }
    } catch {
      // Ignore corrupted local cache
    }
    setPriceAlerts([]);
  }, [isAuthenticated, firebaseUser, dbUser?.uid]);

  const persistLocalPriceAlerts = useCallback(
    (next: MarketPriceAlert[]) => {
      const uid = firebaseUser?.uid || dbUser?.uid || 'local';
      try {
        localStorage.setItem(`reboot_earth_price_alerts_${uid}`, JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
    },
    [firebaseUser?.uid, dbUser?.uid]
  );

  // Live market buy-back price ticker (every 12s while enabled)
  useEffect(() => {
    if (!isAuthenticated || !autoRefreshMarket) return;
    const timer = window.setInterval(() => {
      setMarketQuotes((prev) => stepMarketQuotes(prev));
    }, 12000);
    return () => window.clearInterval(timer);
  }, [isAuthenticated, autoRefreshMarket]);

  const dismissPushToast = useCallback((toastId: string) => {
    setPushToasts((prev) => prev.filter((t) => t.id !== toastId));
  }, []);

  const handleRequestBrowserPush = useCallback(async () => {
    const nextPerm = await requestBrowserPushPermission();
    setPushPermission(nextPerm);
  }, []);

  // Evaluate live buy-back quotes against armed user price thresholds and emit push notifications
  useEffect(() => {
    if (!isAuthenticated || priceAlerts.length === 0) return;
    const now = Date.now();
    const COOLDOWN_MS = 60_000;
    const quoteMap = new Map(marketQuotes.map((q) => [q.id, q]));

    for (const alert of priceAlerts) {
      if (!alert.active) continue;
      const quote = quoteMap.get(alert.categoryId);
      if (!quote) continue;
      if (!doesQuoteMeetAlert(quote, alert)) continue;

      const lastFiredAt = alertCooldownMapRef.current.get(alert.id) ?? 0;
      if (now - lastFiredAt < COOLDOWN_MS) continue;
      alertCooldownMapRef.current.set(alert.id, now);

      const directionText = alert.condition === 'above' ? 'reached' : 'dropped to';
      const symbol = alert.condition === 'above' ? '≥' : '≤';
      const title = `Buy-Back Price Alert: ${quote.shortName} hit ${formatInrPerKg(quote.currentPriceInr)}`;
      const bodyParts = [
        `${quote.name} buy-back rate ${directionText} ${formatInrPerKg(quote.currentPriceInr)} (your target: ${symbol} ${formatInrPerKg(alert.targetPriceInr)}).`,
      ];
      if (alert.note) {
        bodyParts.push(`Note: ${alert.note}.`);
      }
      bodyParts.push('Lock this rate now by scheduling a doorstep pickup.');
      const message = bodyParts.join(' ');

      const browserNotified = alert.browserPushEnabled
        ? dispatchBrowserPushNotification({
            title,
            body: message,
            tag: `buyback_${alert.id}`,
          })
        : false;

      const toastId = `toast_${alert.id}_${now}`;
      const toastItem: LivePricePushToast = {
        id: toastId,
        alertId: alert.id,
        categoryId: quote.id,
        categoryName: quote.name,
        condition: alert.condition,
        spotPriceInr: quote.currentPriceInr,
        targetPriceInr: alert.targetPriceInr,
        deltaInr: quote.currentPriceInr - alert.targetPriceInr,
        note: alert.note,
        browserNotified,
        timestampMs: now,
      };
      setPushToasts((prev) => [toastItem, ...prev.filter((t) => t.alertId !== alert.id)].slice(0, 4));
      window.setTimeout(() => {
        setPushToasts((prev) => prev.filter((t) => t.id !== toastId));
      }, 14000);

      void pushNotification({
        title: title.slice(0, 140),
        message: message.slice(0, 500),
        category: 'market',
      }).catch(() => {});

      const nextCount = (alert.triggeredCount || 0) + 1;
      if (firebaseUser && firebaseUser.emailVerified && !alert.id.startsWith('local_pal_')) {
        void recordPriceAlertTrigger(alert.id, quote.currentPriceInr, nextCount).catch(() => {});
      } else {
        setPriceAlerts((prev) => {
          const updated = prev.map((item) =>
            item.id === alert.id
              ? {
                  ...item,
                  lastTriggeredPriceInr: quote.currentPriceInr,
                  triggeredCount: nextCount,
                }
              : item
          );
          persistLocalPriceAlerts(updated);
          return updated;
        });
      }
    }
  }, [
    isAuthenticated,
    marketQuotes,
    priceAlerts,
    firebaseUser,
    pushNotification,
    persistLocalPriceAlerts,
  ]);

  const handleCreatePriceAlert = useCallback(
    async (payload: {
      categoryId: BuyBackCategoryId;
      categoryName: string;
      condition: BuyBackAlertCondition;
      targetPriceInr: number;
      browserPushEnabled: boolean;
      note: string;
    }) => {
      if (firebaseUser && firebaseUser.emailVerified) {
        await createUserPriceAlert(firebaseUser.uid, payload);
        return;
      }
      const localAlert: MarketPriceAlert = {
        id: `local_pal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        userId: dbUser?.uid || firebaseUser?.uid || 'local',
        categoryId: payload.categoryId,
        categoryName: payload.categoryName,
        condition: payload.condition,
        targetPriceInr: payload.targetPriceInr,
        active: true,
        browserPushEnabled: payload.browserPushEnabled,
        lastTriggeredPriceInr: 0,
        triggeredCount: 0,
        note: payload.note,
      };
      setPriceAlerts((prev) => {
        const next = [localAlert, ...prev];
        persistLocalPriceAlerts(next);
        return next;
      });
    },
    [firebaseUser, dbUser?.uid, persistLocalPriceAlerts]
  );

  const handleUpdatePriceAlert = useCallback(
    async (
      alertId: string,
      patch: {
        targetPriceInr?: number;
        condition?: BuyBackAlertCondition;
        active?: boolean;
        browserPushEnabled?: boolean;
        note?: string;
      }
    ) => {
      // Clear cooldown when user edits threshold or re-enables alert so it can fire cleanly
      alertCooldownMapRef.current.delete(alertId);
      if (firebaseUser && firebaseUser.emailVerified && !alertId.startsWith('local_pal_')) {
        await updateUserPriceAlertConfig(alertId, patch);
        return;
      }
      setPriceAlerts((prev) => {
        const next = prev.map((item) => (item.id === alertId ? { ...item, ...patch } : item));
        persistLocalPriceAlerts(next);
        return next;
      });
    },
    [firebaseUser, persistLocalPriceAlerts]
  );

  const handleDeletePriceAlert = useCallback(
    async (alertId: string) => {
      alertCooldownMapRef.current.delete(alertId);
      if (firebaseUser && firebaseUser.emailVerified && !alertId.startsWith('local_pal_')) {
        await deleteUserPriceAlert(alertId);
        return;
      }
      setPriceAlerts((prev) => {
        const next = prev.filter((item) => item.id !== alertId);
        persistLocalPriceAlerts(next);
        return next;
      });
    },
    [firebaseUser, persistLocalPriceAlerts]
  );

  const handleSimulateAlertTrigger = useCallback((alert: MarketPriceAlert) => {
    alertCooldownMapRef.current.delete(alert.id);
    if (!alert.active) {
      void handleUpdatePriceAlert(alert.id, { active: true });
    }
    setMarketQuotes((prev) =>
      simulateCategoryPriceMove(prev, alert.categoryId, alert.targetPriceInr, alert.condition)
    );
  }, [handleUpdatePriceAlert]);

  const handleSchedulePickupForBuyBack = useCallback((quote: BuyBackMarketQuote) => {
    setReorderPrefill({
      deviceName: quote.name,
      category: quote.linkedPickupCategory,
      quantity: 1,
      estimatedWeightKg: 5,
      condition: 'Non-working',
      pickupAddress: '',
      lat: 28.6139,
      lng: 77.209,
      timeSlot: '10:00 AM - 01:00 PM',
      contactName: dbUser?.fullName || firebaseUser?.displayName || '',
      contactPhone: dbUser?.phone || firestoreProfile?.phone || '',
      instructions: `Buy-back rate target lock (${quote.name} at ${formatInrPerKg(quote.currentPriceInr)}).`,
    });
    setActiveTab('schedule');
  }, [dbUser?.fullName, dbUser?.phone, firebaseUser?.displayName, firestoreProfile?.phone]);

  const marketNotifications = useMemo(
    () => notifications.filter((n) => n.category === 'market'),
    [notifications]
  );

  const activePriceAlertsCount = useMemo(
    () => priceAlerts.filter((a) => a.active).length,
    [priceAlerts]
  );

  const hitPriceAlertsCount = useMemo(() => {
    const qMap = new Map(marketQuotes.map((q) => [q.id, q]));
    return priceAlerts.filter((a) => {
      const q = qMap.get(a.categoryId);
      return q ? doesQuoteMeetAlert(q, a) : false;
    }).length;
  }, [marketQuotes, priceAlerts]);

  const goldPcbQuote = useMemo(
    () => marketQuotes.find((q) => q.id === 'gold_pcb') || marketQuotes[0],
    [marketQuotes]
  );

  const navItems: { id: DashTab; label: string; icon: React.ComponentType<any>; visible: boolean }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard, visible: true },
    { id: 'notifications', label: 'Notification Center', icon: Bell, visible: true },
    { id: 'market-alerts', label: 'Buy-Back Price Alerts', icon: TrendingUp, visible: true },
    { id: 'impact', label: 'Impact Visualizer (D3)', icon: Activity, visible: true },
    { id: 'targets', label: 'Monthly Targets', icon: Target, visible: true },
    { id: 'leaderboard', label: 'Community Leaderboard', icon: Trophy, visible: true },
    { id: 'voice', label: 'Live Voice AI', icon: AudioLines, visible: true },
    { id: 'transcribe', label: 'Audio Transcribe', icon: Mic, visible: true },
    { id: 'images', label: 'Image Studio', icon: ImageIcon, visible: true },
    { id: 'animate', label: 'Video Studio', icon: Clapperboard, visible: true },
    { id: 'music', label: 'Music Studio', icon: Music, visible: true },
    { id: 'intel', label: 'Live Web Intel', icon: Globe, visible: true },
    { id: 'schedule', label: 'Schedule Pickup', icon: CalendarClock, visible: true },
    { id: 'pickups', label: 'Pickup Requests', icon: PackageCheck, visible: true },
    { id: 'history', label: 'Pickup History', icon: History, visible: true },
    { id: 'marketplace', label: 'Circular Marketplace', icon: Repeat, visible: true },
    { id: 'battery-health', label: 'Battery Health', icon: BatteryCharging, visible: true },
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
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className="mt-2 w-full p-2 rounded-lg border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-[#061526] hover:border-emerald-400 transition-colors text-left space-y-1.5 cursor-pointer"
              title="View your recycling experience level, badges, and milestones"
            >
              <div className="flex items-center justify-between gap-1.5 text-[11px]">
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-800 dark:text-emerald-300 truncate">
                  <Award className="w-3.5 h-3.5 shrink-0" />
                  Lvl {ecoExperience.currentTier.level} · {ecoExperience.currentTier.title}
                </span>
                <span className="font-mono text-[10px] text-slate-500 dark:text-sky-300/75 shrink-0">
                  {ecoExperience.verifiedRecycledKg} kg
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-200 dark:bg-sky-950 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-500 transition-all duration-500"
                  style={{ width: `${Math.max(4, ecoExperience.levelProgressPct)}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-500 dark:text-sky-200/65 flex items-center justify-between">
                <span>
                  {ecoExperience.unlockedBadgesCount}/{ecoExperience.badges.length} badges
                </span>
                <span>
                  {ecoExperience.nextTier
                    ? `${ecoExperience.kgToNextLevel} kg to Lvl ${ecoExperience.nextTier.level}`
                    : 'Max Level'}
                </span>
              </p>
            </button>
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
                    className={`px-3 py-2 rounded-lg text-xs font-medium inline-flex items-center justify-between gap-2 whitespace-nowrap transition-colors ${
                      active
                        ? 'bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 font-semibold'
                        : 'text-slate-600 dark:text-sky-100/75 hover:bg-slate-100 dark:hover:bg-sky-900/40'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2.5">
                      <Icon className="w-4 h-4 shrink-0" />
                      {item.label}
                    </span>
                    {item.id === 'notifications' && unreadCount > 0 && (
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                          active
                            ? 'bg-white/25 text-white dark:bg-sky-950/30 dark:text-sky-950'
                            : 'bg-sky-600 text-white'
                        }`}
                      >
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                    {item.id === 'market-alerts' && (hitPriceAlertsCount > 0 || activePriceAlertsCount > 0) && (
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                          hitPriceAlertsCount > 0
                            ? 'bg-emerald-500 text-white'
                            : active
                              ? 'bg-white/25 text-white dark:bg-sky-950/30 dark:text-sky-950'
                              : 'bg-slate-200 dark:bg-sky-900/70 text-slate-700 dark:text-sky-200'
                        }`}
                      >
                        {hitPriceAlertsCount > 0 ? `${hitPriceAlertsCount} HIT` : activePriceAlertsCount}
                      </span>
                    )}
                  </button>
                );
              })}
          </nav>
        </div>

        <div className="hidden lg:flex flex-col gap-2 pt-4 border-t border-slate-200 dark:border-sky-900/50">
          {onLaunchGame && (
            <button
              type="button"
              onClick={onLaunchGame}
              className="w-full px-3 py-2 rounded-lg text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-900/60 hover:border-emerald-400 transition-colors inline-flex items-center gap-2 text-left cursor-pointer"
            >
              <Gamepad2 className="w-4 h-4 shrink-0" />
              Play Circuit Rush
            </button>
          )}
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
            {goldPcbQuote && (
              <button
                type="button"
                onClick={() => setActiveTab('market-alerts')}
                title="Live Gold-Bearing PCB buy-back rate — click to manage price push alerts"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/80 dark:bg-emerald-950/40 text-xs font-semibold text-emerald-800 dark:text-emerald-300 hover:border-emerald-500 transition-colors cursor-pointer"
              >
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Gold PCB:</span>
                <span className="font-mono tabular-nums">
                  {formatInrPerKg(goldPcbQuote.currentPriceInr)}
                </span>
                {activePriceAlertsCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded bg-emerald-600 text-white text-[10px] font-mono">
                    {activePriceAlertsCount}
                  </span>
                )}
              </button>
            )}
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
              <div className="absolute right-0 top-12 z-40 w-80 sm:w-96 rounded-xl border border-slate-200 dark:border-sky-800 bg-white dark:bg-[#0B223B] shadow-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-sky-50">
                      Notification Center
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-sky-200/60">
                      {unreadCount} unread · Pickup &amp; area center alerts
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={() => void markAllNotificationsRead()}
                        className="px-2 py-1 rounded text-[11px] font-medium text-sky-700 dark:text-sky-300 hover:bg-sky-500/10 inline-flex items-center gap-1"
                        title="Mark all notifications as read"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        Read all
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setNotifOpen(false)}
                      className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-sky-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {notifications.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-sky-200/65 py-2">
                    No notifications yet. You will be alerted when collectors accept pickups or verified centers match your area.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
                    {notifications.slice(0, 8).map((n) => (
                      <div
                        key={n.id}
                        className={`p-2.5 rounded-lg border text-xs ${
                          n.read
                            ? 'border-slate-100 dark:border-sky-900/40 opacity-75'
                            : 'border-sky-300 dark:border-sky-700 bg-sky-50/60 dark:bg-sky-950/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400">
                              {n.category === 'pickup'
                                ? 'Collector Pickup'
                                : n.category === 'facility'
                                ? 'Area Center Match'
                                : n.category === 'market'
                                ? 'Buy-Back Price Alert'
                                : n.category}
                            </span>
                            <p className="font-semibold text-slate-900 dark:text-sky-50 leading-snug">
                              {n.title}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {!n.read && (
                              <button
                                type="button"
                                onClick={() => void markNotificationRead(n.id)}
                                className="p-1 text-sky-700 dark:text-sky-400 hover:bg-sky-500/10 rounded"
                                title="Mark read"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void deleteNotification(n.id)}
                              className="p-1 text-slate-400 hover:text-red-500 rounded"
                              title="Dismiss notification"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-sky-200/75 mt-1 leading-relaxed">
                          {n.message}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="pt-2 border-t border-slate-200 dark:border-sky-900/60 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('notifications');
                      setNotifOpen(false);
                    }}
                    className="w-full py-2 px-3 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 hover:bg-sky-700 dark:hover:bg-sky-400 inline-flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>Open Notification Center</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
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

            {/* Carbon Saved Widget (calculated from user's e-waste history log) */}
            <CarbonSavedWidget
              pickups={recentPickups}
              onOpenHistory={() => setActiveTab('history')}
              onSchedulePickup={() => setActiveTab('schedule')}
            />

            {/* Daily E-Waste & Circular Economy Fact */}
            <DailyEwasteFactCard
              onSchedulePickup={() => setActiveTab('schedule')}
              onOpenMarketplace={() => setActiveTab('marketplace')}
            />

            {/* Quick Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              <button
                type="button"
                onClick={() => setActiveTab('schedule')}
                className="p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] hover:border-sky-500 text-left space-y-1.5 transition-colors cursor-pointer"
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
                onClick={() => setActiveTab('battery-health')}
                className="p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] hover:border-amber-500 text-left space-y-1.5 transition-colors cursor-pointer"
              >
                <BatteryCharging className="w-5 h-5 text-amber-500" />
                <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50">
                  Battery Health Calculator
                </h4>
                <p className="text-xs text-slate-500 dark:text-sky-200/70">
                  Estimate remaining useful life to decide whether to optimize, repurpose, or recycle.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('marketplace')}
                className="p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] hover:border-emerald-500 text-left space-y-1.5 transition-colors cursor-pointer"
              >
                <Repeat className="w-5 h-5 text-emerald-500" />
                <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50">
                  Circular Marketplace
                </h4>
                <p className="text-xs text-slate-500 dark:text-sky-200/70">
                  Trade or donate functional salvaged cables, chargers, RAM, and spare components.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('optimizer')}
                className="p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] hover:border-sky-500 text-left space-y-1.5 transition-colors cursor-pointer"
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
                className="p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] hover:border-sky-500 text-left space-y-1.5 transition-colors cursor-pointer"
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

            {/* City Community Recycling Leaderboard Widget */}
            <CommunityLeaderboardWidget
              compact
              facilities={facilities}
              liveProfiles={leaderboardProfiles}
              currentUserId={currentLeaderboardUid}
              currentUserName={currentLeaderboardName}
              currentUserCity={currentLeaderboardCity}
              ecoExperience={ecoExperience}
              isListedOnLeaderboard={isListedOnLeaderboard}
              canSyncCloud={Boolean(firebaseUser && firebaseUser.emailVerified)}
              syncingRank={syncingLeaderboard}
              syncNotice={leaderboardSyncNotice}
              onSyncMyRank={handleSyncLeaderboardRank}
              onToggleVisibility={handleToggleLeaderboardVisibility}
              onOpenFullTab={() => setActiveTab('leaderboard')}
              onSchedulePickup={() => setActiveTab('schedule')}
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
                    onClick={() => setActiveTab('history')}
                    className="text-xs font-medium text-slate-600 dark:text-sky-300 hover:text-sky-600 dark:hover:text-sky-200 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <History className="w-3.5 h-3.5" />
                    History Log
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

        {activeTab === 'notifications' && (
          <NotificationCenterPanel
            pickups={recentPickups}
            facilities={facilities}
            vehicles={vehicles}
            onRefreshData={() => {
              void loadDashData();
              onRefreshGlobal();
            }}
            onScanNow={scanForPickupAndFacilityAlerts}
            onNavigateTab={(tab) => setActiveTab(tab)}
          />
        )}

        {activeTab === 'market-alerts' && (
          <BuyBackPriceAlertsPanel
            quotes={marketQuotes}
            alerts={priceAlerts}
            marketNotifications={marketNotifications}
            pushPermission={pushPermission}
            autoRefreshEnabled={autoRefreshMarket}
            onToggleAutoRefresh={() => setAutoRefreshMarket((v) => !v)}
            onRequestPushPermission={handleRequestBrowserPush}
            onRefreshQuotes={() => setMarketQuotes((prev) => stepMarketQuotes(prev))}
            onCreateAlert={handleCreatePriceAlert}
            onUpdateAlert={handleUpdatePriceAlert}
            onDeleteAlert={handleDeletePriceAlert}
            onSimulateAlertTrigger={handleSimulateAlertTrigger}
            onSchedulePickupForCategory={handleSchedulePickupForBuyBack}
          />
        )}

        {activeTab === 'impact' && (
          <D3ImpactVisualizer analytics={analytics} pickups={recentPickups} />
        )}

        {activeTab === 'targets' && (
          <MonthlyTargetsPanel pickups={recentPickups} />
        )}

        {activeTab === 'leaderboard' && (
          <CommunityLeaderboardWidget
            facilities={facilities}
            liveProfiles={leaderboardProfiles}
            currentUserId={currentLeaderboardUid}
            currentUserName={currentLeaderboardName}
            currentUserCity={currentLeaderboardCity}
            ecoExperience={ecoExperience}
            isListedOnLeaderboard={isListedOnLeaderboard}
            canSyncCloud={Boolean(firebaseUser && firebaseUser.emailVerified)}
            syncingRank={syncingLeaderboard}
            syncNotice={leaderboardSyncNotice}
            onSyncMyRank={handleSyncLeaderboardRank}
            onToggleVisibility={handleToggleLeaderboardVisibility}
            onSchedulePickup={() => setActiveTab('schedule')}
          />
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

        {activeTab === 'images' && <ImageStudioPanel />}

        {activeTab === 'animate' && <ImageToVideoPanel />}

        {activeTab === 'music' && <MusicStudioPanel />}

        {activeTab === 'intel' && (
          <LiveSearchIntelPanel
            title="Live E-Waste & Circular Economy Web Intel"
            subtitle="Real-time Google Search grounded market benchmarks, CPCB regulatory circulars, OEM take-back programs, and circular economy news."
          />
        )}

        {activeTab === 'schedule' && (
          <SchedulePickup
            facilities={facilities}
            prefill={reorderPrefill}
            onBooked={() => {
              setReorderPrefill(null);
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

        {activeTab === 'history' && (
          <PickupHistoryLog
            pickups={recentPickups}
            facilities={facilities}
            vehicles={vehicles}
            onRefreshData={() => {
              void loadDashData();
              onRefreshGlobal();
            }}
            onCustomizeReorder={(template) => {
              setReorderPrefill(template);
              setActiveTab('schedule');
            }}
          />
        )}

        {activeTab === 'marketplace' && <CircularMarketplace pickups={recentPickups} />}

        {activeTab === 'battery-health' && (
          <BatteryHealthCalculator
            userKey={firebaseUser?.uid || dbUser?.uid || 'guest'}
            contactName={dbUser?.fullName || firebaseUser?.displayName || ''}
            contactPhone={dbUser?.phone || firestoreProfile?.phone || ''}
            onScheduleRecyclePickup={(prefill) => {
              setReorderPrefill(prefill);
              setActiveTab('schedule');
            }}
            onOpenMarketplace={() => setActiveTab('marketplace')}
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
          <UserProfilePanel
            pickups={recentPickups}
            onSchedulePickup={() => setActiveTab('schedule')}
          />
        )}
      </main>

      {/* Floating Live Market Buy-Back Push Notification Toasts (visible across all Dashboard tabs) */}
      {pushToasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 w-[calc(100vw-2.5rem)] max-w-sm space-y-2.5 pointer-events-none"
        >
          {pushToasts.map((toast) => {
            const matchedQuote = marketQuotes.find((q) => q.id === toast.categoryId);
            return (
              <div
                key={toast.id}
                className="pointer-events-auto rounded-xl border border-emerald-400 dark:border-emerald-600 bg-white dark:bg-[#071D34] shadow-2xl p-4 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 shrink-0">
                      <BellRing className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                        Buy-Back Price Push Alert
                        {toast.browserNotified ? ' · Desktop Sent' : ''}
                      </p>
                      <h5 className="text-xs font-bold text-slate-900 dark:text-sky-50 truncate">
                        {toast.categoryName}
                      </h5>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => dismissPushToast(toast.id)}
                    aria-label="Dismiss price push notification"
                    className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-sky-200 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-baseline justify-between gap-2 px-2.5 py-2 rounded-lg bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-900/60">
                  <div>
                    <p className="text-[10px] text-slate-500 dark:text-sky-200/70">Live Spot Rate</p>
                    <p className="text-base font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
                      {formatInrPerKg(toast.spotPriceInr)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-500 dark:text-sky-200/70">Your Target</p>
                    <p className="text-xs font-mono font-semibold text-slate-800 dark:text-sky-100">
                      {toast.condition === 'above' ? '≥' : '≤'} {formatInrPerKg(toast.targetPriceInr)}
                    </p>
                  </div>
                </div>

                {toast.note && (
                  <p className="text-[11px] text-slate-600 dark:text-sky-200/80 italic">
                    “{toast.note}”
                  </p>
                )}

                <div className="flex items-center gap-2 pt-0.5">
                  {matchedQuote && (
                    <button
                      type="button"
                      onClick={() => {
                        handleSchedulePickupForBuyBack(matchedQuote);
                        dismissPushToast(toast.id);
                      }}
                      className="flex-1 py-1.5 px-2.5 rounded-lg text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer"
                    >
                      Schedule Pickup
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('market-alerts');
                      dismissPushToast(toast.id);
                    }}
                    className="py-1.5 px-2.5 rounded-lg text-[11px] font-semibold border border-slate-200 dark:border-sky-800 text-slate-700 dark:text-sky-200 hover:bg-slate-100 dark:hover:bg-sky-900/50 transition-colors cursor-pointer"
                  >
                    Manage Alerts
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
