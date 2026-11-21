import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CalendarCheck2,
  CalendarPlus,
  Camera,
  CheckCircle2,
  Clock,
  Compass,
  ExternalLink,
  Loader2,
  MapPin,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  cancelScheduledPickup,
  createScheduledPickup,
  rescheduleScheduledPickup,
  subscribeUserScheduledPickups,
} from '../lib/firebase';
import {
  checkCalendarFreeBusy,
  createGoogleCalendarEvent,
  listGoogleContacts,
  pickupSlotToIsoWindow,
  type CalendarBusyPeriod,
  type GoogleContact,
} from '../lib/workspace';
import {
  EWASTE_CATEGORIES,
  PICKUP_TIME_SLOTS,
  type Facility,
  type PickupRequest,
  type PickupTimeSlot,
  type ScheduledPickupBooking,
} from '../types';
import { ConfirmDialog } from './ConfirmDialog';
import { GoogleSignInButton } from './GoogleSignInButton';

export interface SchedulePickupProps {
  facilities?: Facility[];
  onBooked?: (booking: PickupRequest) => void;
  onCancel?: () => void;
  /** When true, hides the side-by-side live bookings list (useful when embedded inside PickupManager). */
  compact?: boolean;
}

const SLOT_DESCRIPTIONS: Record<PickupTimeSlot, string> = {
  '09:00 AM - 12:00 PM': 'Early Morning',
  '10:00 AM - 01:00 PM': 'Mid-Morning',
  '02:00 PM - 05:00 PM': 'Afternoon',
  '05:00 PM - 08:00 PM': 'Evening',
};

function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const SchedulePickup: React.FC<SchedulePickupProps> = ({
  facilities = [],
  onBooked,
  onCancel,
  compact = false,
}) => {
  const {
    firebaseUser,
    dbUser,
    authReady,
    signingIn,
    signInWithGoogle,
    workspaceToken,
    pushNotification,
  } = useAuth();

  const todayIso = useMemo(() => formatIsoDate(new Date()), []);

  const upcomingDays = useMemo(() => {
    const days: { iso: string; weekday: string; dayNum: string; month: string }[] = [];
    const base = new Date();
    for (let offset = 1; offset <= 7; offset += 1) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset);
      days.push({
        iso: formatIsoDate(d),
        weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
        dayNum: String(d.getDate()),
        month: d.toLocaleDateString(undefined, { month: 'short' }),
      });
    }
    return days;
  }, []);

  // Form state
  const [deviceName, setDeviceName] = useState('');
  const [category, setCategory] = useState<string>(EWASTE_CATEGORIES[0]);
  const [condition, setCondition] = useState('Non-working');
  const [quantity, setQuantity] = useState(1);
  const [estimatedWeightKg, setEstimatedWeightKg] = useState(2.5);
  const [preferredDate, setPreferredDate] = useState(upcomingDays[0]?.iso || todayIso);
  const [timeSlot, setTimeSlot] = useState<PickupTimeSlot>('10:00 AM - 01:00 PM');
  const [pickupAddress, setPickupAddress] = useState('');
  const [lat, setLat] = useState(28.6139);
  const [lng, setLng] = useState(77.209);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'locating' | 'locked'>('idle');
  const [contactName, setContactName] = useState(dbUser?.fullName || '');
  const [contactPhone, setContactPhone] = useState(dbUser?.phone || '');
  const [instructions, setInstructions] = useState('');

  // AI photo scan & quick triage
  const [visionLoading, setVisionLoading] = useState(false);
  const [triageLoading, setTriageLoading] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  // Google Contacts autofill
  const [contacts, setContacts] = useState<GoogleContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [showContacts, setShowContacts] = useState(false);

  // Submission feedback
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<{
    requestCode: string;
    preferredDate: string;
    timeSlot: string;
    pickupAddress: string;
    deviceName: string;
  } | null>(null);

  // Real-time synced bookings from Firestore
  const [bookings, setBookings] = useState<ScheduledPickupBooking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(!compact);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editSlot, setEditSlot] = useState<PickupTimeSlot>('10:00 AM - 01:00 PM');
  const [busyBookingId, setBusyBookingId] = useState<string | null>(null);

  // Google Calendar availability & sync state
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [busyPeriods, setBusyPeriods] = useState<CalendarBusyPeriod[] | null>(null);
  const [availabilityCheckedDate, setAvailabilityCheckedDate] = useState<string | null>(null);
  const [calendarLinks, setCalendarLinks] = useState<Record<string, string>>({});
  const [calendarPending, setCalendarPending] = useState<null | {
    requestCode: string;
    deviceName: string;
    preferredDate: string;
    timeSlot: string;
    pickupAddress: string;
    instructions?: string;
  }>(null);
  const [calendarSyncBusy, setCalendarSyncBusy] = useState(false);

  useEffect(() => {
    if (dbUser || firebaseUser) {
      setContactName((prev) => prev || dbUser?.fullName || firebaseUser?.displayName || '');
      setContactPhone((prev) => prev || dbUser?.phone || '');
    }
  }, [dbUser, firebaseUser]);

  useEffect(() => {
    if (compact || !authReady || !firebaseUser) {
      setBookings([]);
      setBookingsLoading(false);
      return;
    }
    setBookingsLoading(true);
    let unsub: (() => void) | undefined;
    try {
      unsub = subscribeUserScheduledPickups(firebaseUser.uid, (items) => {
        setBookings(items);
        setBookingsLoading(false);
      });
    } catch {
      setBookingsLoading(false);
    }
    return () => {
      unsub?.();
    };
  }, [compact, authReady, firebaseUser]);

  const nearestFacility = useMemo(() => {
    const verified = facilities.filter((f) => f.verified);
    const pool = verified.length > 0 ? verified : facilities;
    if (pool.length === 0) return null;
    let best = pool[0];
    let bestDist = haversineKm(lat, lng, best.lat, best.lng);
    for (let i = 1; i < pool.length; i += 1) {
      const dist = haversineKm(lat, lng, pool[i].lat, pool[i].lng);
      if (dist < bestDist) {
        best = pool[i];
        bestDist = dist;
      }
    }
    return { facility: best, distanceKm: bestDist };
  }, [facilities, lat, lng]);

  const handleUseGps = () => {
    if (!navigator.geolocation) {
      setFormError('Geolocation is not supported by this browser. Enter your pickup address manually.');
      return;
    }
    setGpsStatus('locating');
    setFormError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(Number(pos.coords.latitude.toFixed(5)));
        setLng(Number(pos.coords.longitude.toFixed(5)));
        setGpsStatus('locked');
      },
      () => {
        setGpsStatus('idle');
        setFormError('Location access was denied. Please type your pickup address below.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFormError('Please select a JPEG, PNG, or WebP photo.');
      return;
    }
    setVisionLoading(true);
    setFormError(null);
    setAiNote(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || '');
          resolve(result.includes(',') ? result.split(',')[1] : result);
        };
        reader.onerror = () => reject(new Error('Unable to read image file.'));
        reader.readAsDataURL(file);
      });

      const identified = await apiFetch<{
        deviceName: string;
        category: string;
        estimatedWeightKg: number;
        condition: string;
        hazards: string[];
        safeHandlingTip: string;
      }>(
        '/api/ai/identify-device',
        {
          method: 'POST',
          body: JSON.stringify({ imageBase64: base64, mimeType: file.type }),
        },
        false
      );

      if (identified.deviceName) setDeviceName(identified.deviceName);
      if (identified.category) setCategory(identified.category);
      if (identified.estimatedWeightKg) setEstimatedWeightKg(Number(identified.estimatedWeightKg));
      if (identified.condition) setCondition(identified.condition);
      const hazardStr =
        identified.hazards && identified.hazards.length > 0
          ? `Detected components: ${identified.hazards.join(', ')}. `
          : '';
      setAiNote(`${hazardStr}${identified.safeHandlingTip || ''}`.trim());
    } catch (err: any) {
      setFormError(err?.message || 'Unable to analyze device photo.');
    } finally {
      setVisionLoading(false);
    }
  };

  const handleFastTriage = async () => {
    if (!deviceName.trim()) return;
    setTriageLoading(true);
    setFormError(null);
    try {
      const res = await apiFetch<{
        category: string;
        estimatedWeightKg: number;
        priority: string;
        note: string;
      }>(
        '/api/ai/triage',
        {
          method: 'POST',
          body: JSON.stringify({ description: deviceName }),
        },
        false
      );
      if (res.category) setCategory(res.category);
      if (res.estimatedWeightKg) setEstimatedWeightKg(Number(res.estimatedWeightKg));
      setAiNote(`Quick Triage (${res.priority} priority): ${res.note}`);
    } catch (err: any) {
      setFormError(err?.message || 'Quick triage failed.');
    } finally {
      setTriageLoading(false);
    }
  };

  const handleFetchContacts = async () => {
    if (!workspaceToken) {
      setFormError('Sign in with Google Workspace permissions to autofill from Google Contacts.');
      return;
    }
    setLoadingContacts(true);
    try {
      const items = await listGoogleContacts(workspaceToken);
      setContacts(items);
      setShowContacts(true);
    } catch (err: any) {
      setFormError(err?.message || 'Unable to read Google Contacts.');
    } finally {
      setLoadingContacts(false);
    }
  };

  const handleCheckCalendarAvailability = async () => {
    if (!workspaceToken) {
      setFormError('Sign in with Google Calendar access to check your free/busy availability.');
      return;
    }
    setCheckingAvailability(true);
    setFormError(null);
    try {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(preferredDate);
      if (!match) return;
      const dayStart = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0);
      const dayEnd = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59);
      const periods = await checkCalendarFreeBusy(workspaceToken, {
        timeMin: dayStart.toISOString(),
        timeMax: dayEnd.toISOString(),
      });
      setBusyPeriods(periods);
      setAvailabilityCheckedDate(preferredDate);
    } catch (err: any) {
      setFormError(err?.message || 'Unable to check Google Calendar availability.');
    } finally {
      setCheckingAvailability(false);
    }
  };

  const slotConflictMap = useMemo(() => {
    const conflicts: Record<string, boolean> = {};
    if (!busyPeriods || availabilityCheckedDate !== preferredDate) return conflicts;
    for (const slot of PICKUP_TIME_SLOTS) {
      const win = pickupSlotToIsoWindow(preferredDate, slot);
      const sStart = new Date(win.startIso).getTime();
      const sEnd = new Date(win.endIso).getTime();
      conflicts[slot] = busyPeriods.some((b) => {
        const bStart = new Date(b.start).getTime();
        const bEnd = new Date(b.end).getTime();
        return bStart < sEnd && bEnd > sStart;
      });
    }
    return conflicts;
  }, [busyPeriods, availabilityCheckedDate, preferredDate]);

  const handleConfirmAddToCalendar = async () => {
    if (!workspaceToken || !calendarPending) return;
    setCalendarSyncBusy(true);
    setFormError(null);
    try {
      const win = pickupSlotToIsoWindow(calendarPending.preferredDate, calendarPending.timeSlot);
      const created = await createGoogleCalendarEvent(workspaceToken, {
        summary: `Reboot Earth Pickup: ${calendarPending.deviceName} (${calendarPending.requestCode})`,
        location: calendarPending.pickupAddress,
        description: [
          `Tracking Code: ${calendarPending.requestCode}`,
          `Device: ${calendarPending.deviceName}`,
          `Pickup Window: ${calendarPending.preferredDate} (${calendarPending.timeSlot})`,
          calendarPending.instructions ? `Instructions: ${calendarPending.instructions}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        startIso: win.startIso,
        endIso: win.endIso,
        timeZone: win.timeZone,
      });
      setCalendarLinks((prev) => ({
        ...prev,
        [calendarPending.requestCode]: created.htmlLink || 'https://calendar.google.com',
      }));
      setCalendarPending(null);
    } catch (err: any) {
      setFormError(err?.message || 'Unable to add pickup to Google Calendar.');
      setCalendarPending(null);
    } finally {
      setCalendarSyncBusy(false);
    }
  };

  const handleBookSlot = async (confirmDuplicate = false) => {
    if (!firebaseUser) return;

    const cleanDevice = deviceName.trim();
    const cleanAddress = pickupAddress.trim();
    const cleanContact = contactName.trim();
    const cleanPhone = contactPhone.trim();

    if (cleanDevice.length < 2) {
      setFormError('Please enter the electronic device name (at least 2 characters).');
      return;
    }
    if (cleanAddress.length < 5) {
      setFormError('Please enter your complete pickup address (at least 5 characters).');
      return;
    }
    if (cleanContact.length < 2 || cleanPhone.length < 6) {
      setFormError('Please enter a valid contact name and phone number for the pickup crew.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(preferredDate) || preferredDate < todayIso) {
      setFormError('Please choose today or a future pickup date.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setConfirmedBooking(null);

    try {
      const created = await apiFetch<PickupRequest>('/api/pickups', {
        method: 'POST',
        body: JSON.stringify({
          deviceName: cleanDevice.slice(0, 140),
          category,
          quantity: Math.max(1, Math.min(5000, Math.round(quantity) || 1)),
          estimatedWeightKg: Math.max(0.2, Math.min(50000, Number(estimatedWeightKg) || 1)),
          condition,
          pickupAddress: cleanAddress.slice(0, 300),
          lat,
          lng,
          preferredDate,
          timeSlot,
          contactName: cleanContact.slice(0, 120),
          contactPhone: cleanPhone.slice(0, 40),
          instructions: instructions.trim().slice(0, 500),
          confirmDuplicate,
        }),
      });

      // Sync booking to Firestore so it persists across sessions and updates in real time
      await createScheduledPickup(firebaseUser.uid, {
        requestCode: created.requestCode,
        deviceName: created.deviceName,
        category: created.category,
        quantity: created.quantity,
        estimatedWeightKg: created.estimatedWeightKg,
        condition: created.condition,
        pickupAddress: created.pickupAddress,
        lat: created.lat,
        lng: created.lng,
        preferredDate: created.preferredDate,
        timeSlot: created.timeSlot,
        contactName: created.contactName,
        contactPhone: created.contactPhone,
        instructions: created.instructions || '',
      });

      setDuplicateWarning(null);
      setConfirmedBooking({
        requestCode: created.requestCode,
        preferredDate: created.preferredDate,
        timeSlot: created.timeSlot,
        pickupAddress: created.pickupAddress,
        deviceName: created.deviceName,
      });

      setDeviceName('');
      setInstructions('');
      setAiNote(null);

      void pushNotification({
        title: `Pickup Booked — ${created.requestCode}`,
        message: `${created.deviceName} scheduled for ${created.preferredDate} (${created.timeSlot}).`,
        category: 'pickup',
      }).catch(() => {});

      onBooked?.(created);
    } catch (err: any) {
      if (err?.status === 409) {
        setDuplicateWarning(err.message);
      } else {
        setFormError(err?.message || 'Unable to book pickup slot right now. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveReschedule = async (bookingId: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(editDate) || editDate < todayIso) {
      setFormError('Please select today or a future date to reschedule.');
      return;
    }
    setBusyBookingId(bookingId);
    setFormError(null);
    try {
      await rescheduleScheduledPickup(bookingId, editDate, editSlot);
      setEditingId(null);
    } catch (err: any) {
      setFormError(err?.message || 'Unable to reschedule booking.');
    } finally {
      setBusyBookingId(null);
    }
  };

  const handleCancelBooking = async (bookingId: string) => {
    setBusyBookingId(bookingId);
    setFormError(null);
    try {
      await cancelScheduledPickup(bookingId);
    } catch (err: any) {
      setFormError(err?.message || 'Unable to cancel booking.');
    } finally {
      setBusyBookingId(null);
    }
  };

  if (!firebaseUser) {
    return (
      <section className="p-6 rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#081D16] space-y-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-slate-900 dark:text-emerald-50">
            Schedule Doorstep E-Waste Collection
          </h3>
          <p className="text-xs text-slate-600 dark:text-emerald-200/75 max-w-xl leading-relaxed">
            Sign in with your Google account to reserve a collection time slot from your location, attach GPS coordinates, and keep your bookings synced across sessions.
          </p>
        </div>
        <GoogleSignInButton
          onClick={() => void signInWithGoogle()}
          loading={signingIn}
          label="Sign in to Schedule a Pickup"
        />
      </section>
    );
  }

  return (
    <div className={compact ? 'space-y-5' : 'grid grid-cols-1 xl:grid-cols-12 gap-6 items-start'}>
      {/* Booking Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleBookSlot(false);
        }}
        className={`${
          compact ? '' : 'xl:col-span-7'
        } p-6 rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#081D16] space-y-6`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-emerald-900/50">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-emerald-50">
              Schedule E-Waste Pickup
            </h3>
            <p className="text-xs text-slate-500 dark:text-emerald-200/70 mt-0.5">
              Choose a collection window, confirm your pickup location, and log your devices.
            </p>
          </div>
          <label className="px-3.5 py-2 rounded-lg border border-emerald-600/50 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 cursor-pointer inline-flex items-center gap-1.5 self-start whitespace-nowrap">
            {visionLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Camera className="w-3.5 h-3.5" />
            )}
            {visionLoading ? 'Analyzing Photo...' : 'Scan Device Photo'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleImageUpload}
            />
          </label>
        </div>

        {formError && (
          <div
            role="alert"
            className="p-3.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-center justify-between gap-2"
          >
            <span>{formError}</span>
            <button type="button" onClick={() => setFormError(null)} aria-label="Dismiss error">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {confirmedBooking && (
          <div
            role="status"
            className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 space-y-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200 inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Pickup Slot Confirmed —{' '}
                <span className="font-mono tabular-nums">{confirmedBooking.requestCode}</span>
              </p>
              <button
                type="button"
                onClick={() => setConfirmedBooking(null)}
                aria-label="Dismiss confirmation"
                className="text-emerald-700 dark:text-emerald-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-xs text-emerald-800 dark:text-emerald-200/85">
              {confirmedBooking.deviceName} ·{' '}
              <span className="font-mono tabular-nums">{confirmedBooking.preferredDate}</span> (
              {confirmedBooking.timeSlot})
            </p>
            <p className="text-[11px] text-emerald-700 dark:text-emerald-300/80">
              Location: {confirmedBooking.pickupAddress}
            </p>
            <div className="pt-1 flex flex-wrap items-center gap-2">
              {calendarLinks[confirmedBooking.requestCode] ? (
                <a
                  href={calendarLinks[confirmedBooking.requestCode]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 underline"
                >
                  <CalendarCheck2 className="w-3.5 h-3.5" />
                  Added to Google Calendar
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : workspaceToken ? (
                <button
                  type="button"
                  onClick={() =>
                    setCalendarPending({
                      requestCode: confirmedBooking.requestCode,
                      deviceName: confirmedBooking.deviceName,
                      preferredDate: confirmedBooking.preferredDate,
                      timeSlot: confirmedBooking.timeSlot,
                      pickupAddress: confirmedBooking.pickupAddress,
                    })
                  }
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950 hover:bg-emerald-700 dark:hover:bg-emerald-400 inline-flex items-center gap-1.5"
                >
                  <CalendarPlus className="w-3.5 h-3.5" />
                  Add to Google Calendar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void signInWithGoogle()}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-emerald-600/50 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-500/10 inline-flex items-center gap-1.5"
                >
                  <CalendarPlus className="w-3.5 h-3.5" />
                  Connect Google Calendar to Save Event
                </button>
              )}
            </div>
          </div>
        )}

        {aiNote && (
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#05140F] border border-slate-200 dark:border-emerald-900/60 text-xs text-slate-700 dark:text-emerald-200">
            {aiNote}
          </div>
        )}

        {/* Step 1: Date & Time Slot */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-semibold text-slate-800 dark:text-emerald-100 inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              1. Select Pickup Date &amp; Time Window
            </label>
            <div className="flex items-center gap-2">
              {workspaceToken ? (
                <button
                  type="button"
                  disabled={checkingAvailability}
                  onClick={() => void handleCheckCalendarAvailability()}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-emerald-800 text-[11px] font-medium text-slate-700 dark:text-emerald-200 hover:bg-slate-100 dark:hover:bg-emerald-900/40 inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  {checkingAvailability ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <CalendarCheck2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  )}
                  {availabilityCheckedDate === preferredDate
                    ? 'Calendar Checked'
                    : 'Check Calendar'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void signInWithGoogle()}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-emerald-800 text-[11px] font-medium text-slate-700 dark:text-emerald-200 hover:bg-slate-100 dark:hover:bg-emerald-900/40 inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Calendar className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  Connect Calendar
                </button>
              )}
              <input
                type="date"
                min={todayIso}
                required
                aria-label="Custom pickup date"
                value={preferredDate}
                onChange={(e) => setPreferredDate(e.target.value)}
                className="px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
              />
            </div>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
            {upcomingDays.map((d) => {
              const selected = preferredDate === d.iso;
              return (
                <button
                  key={d.iso}
                  type="button"
                  onClick={() => setPreferredDate(d.iso)}
                  className={`py-2 px-1.5 rounded-lg border text-center transition-colors ${
                    selected
                      ? 'border-emerald-500 bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950'
                      : 'border-slate-200 dark:border-emerald-900/60 bg-slate-50 dark:bg-[#05140F] text-slate-700 dark:text-emerald-100 hover:border-emerald-500/70'
                  }`}
                >
                  <p className="text-[10px] opacity-80">{d.weekday}</p>
                  <p className="text-sm font-bold font-mono tabular-nums leading-tight mt-0.5">
                    {d.dayNum}
                  </p>
                  <p className="text-[10px] opacity-80">{d.month}</p>
                </button>
              );
            })}
          </div>

          <div
            role="radiogroup"
            aria-label="Select pickup time slot"
            className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1"
          >
            {PICKUP_TIME_SLOTS.map((slot) => {
              const selected = timeSlot === slot;
              const hasConflict = slotConflictMap[slot];
              const isChecked = availabilityCheckedDate === preferredDate;
              return (
                <button
                  key={slot}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setTimeSlot(slot)}
                  className={`px-3.5 py-2.5 rounded-lg border text-left transition-colors flex items-center justify-between gap-2 ${
                    selected
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-950 dark:text-emerald-50'
                      : 'border-slate-200 dark:border-emerald-900/60 bg-slate-50 dark:bg-[#05140F] text-slate-700 dark:text-emerald-100 hover:border-emerald-600/50'
                  }`}
                >
                  <span className="inline-flex items-center gap-2 text-xs font-mono tabular-nums font-semibold">
                    <Clock
                      className={`w-3.5 h-3.5 shrink-0 ${
                        selected ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                      }`}
                    />
                    {slot}
                  </span>
                  <span
                    className={`text-[11px] whitespace-nowrap ${
                      isChecked
                        ? hasConflict
                          ? 'text-amber-600 dark:text-amber-400 font-medium'
                          : 'text-emerald-700 dark:text-emerald-400 font-medium'
                        : 'text-slate-500 dark:text-emerald-200/65'
                    }`}
                  >
                    {isChecked
                      ? hasConflict
                        ? 'Busy on Calendar'
                        : 'Free on Calendar'
                      : SLOT_DESCRIPTIONS[slot]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Pickup Location & Contact */}
        <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-emerald-900/50">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor="schedule-pickup-address"
              className="text-xs font-semibold text-slate-800 dark:text-emerald-100 inline-flex items-center gap-1.5"
            >
              <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              2. Collection Location &amp; Contact
            </label>
            <button
              type="button"
              onClick={handleUseGps}
              disabled={gpsStatus === 'locating'}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-emerald-800 text-xs font-medium text-slate-700 dark:text-emerald-200 hover:bg-slate-100 dark:hover:bg-emerald-900/40 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              {gpsStatus === 'locating' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Compass className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              )}
              {gpsStatus === 'locked'
                ? `GPS Attached (${lat.toFixed(3)}, ${lng.toFixed(3)})`
                : 'Use My Current Location'}
            </button>
          </div>

          <input
            id="schedule-pickup-address"
            type="text"
            required
            minLength={5}
            maxLength={300}
            value={pickupAddress}
            onChange={(e) => setPickupAddress(e.target.value)}
            placeholder="House/Office number, street, locality, city, PIN code"
            className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          />

          {nearestFacility && (
            <p className="text-[11px] text-slate-500 dark:text-emerald-200/65">
              Nearest verified hub: <span className="font-medium text-slate-700 dark:text-emerald-100">{nearestFacility.facility.name}</span>{' '}
              · <span className="font-mono tabular-nums">{nearestFacility.distanceKm.toFixed(1)} km</span> away
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-700 dark:text-emerald-200/80">
                  Contact Name *
                </label>
                {workspaceToken && (
                  <button
                    type="button"
                    onClick={() => void handleFetchContacts()}
                    className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                  >
                    {loadingContacts ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Users className="w-3 h-3" />
                    )}
                    Google Contacts
                  </button>
                )}
              </div>
              <input
                type="text"
                required
                minLength={2}
                maxLength={120}
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Full name"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-emerald-200/80 mb-1">
                Contact Phone *
              </label>
              <input
                type="tel"
                required
                minLength={6}
                maxLength={40}
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+91-98..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
              />
            </div>
          </div>

          {showContacts && contacts.length > 0 && (
            <div className="p-3 rounded-lg border border-slate-200 dark:border-emerald-900/60 bg-slate-50 dark:bg-[#05140F] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-emerald-200">
                  Select from Google Contacts
                </span>
                <button
                  type="button"
                  onClick={() => setShowContacts(false)}
                  className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  Close
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto">
                {contacts.map((c) => (
                  <button
                    key={c.resourceName}
                    type="button"
                    onClick={() => {
                      setContactName(c.name);
                      if (c.phone) setContactPhone(c.phone);
                      setShowContacts(false);
                    }}
                    className="p-2 rounded text-left border border-slate-200 dark:border-emerald-900/60 hover:border-emerald-500 bg-white dark:bg-[#081D16]"
                  >
                    <p className="text-xs font-medium text-slate-900 dark:text-emerald-50 truncate">
                      {c.name}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-emerald-200/65 truncate">
                      {c.phone || c.email || 'No phone'}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Step 3: E-Waste Items */}
        <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-emerald-900/50">
          <p className="text-xs font-semibold text-slate-800 dark:text-emerald-100">
            3. Electronic Waste Details
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-emerald-200/80 mb-1">
                Device Name / Description *
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={140}
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  placeholder="e.g., 2x ThinkPad Laptops, Power Adapters & Old Router"
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
                />
                <button
                  type="button"
                  onClick={() => void handleFastTriage()}
                  disabled={triageLoading || !deviceName.trim()}
                  title="Auto-categorize device"
                  className="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
                >
                  {triageLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-emerald-200/80 mb-1">
                Category *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
              >
                {EWASTE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-emerald-200/80 mb-1">
                Condition
              </label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
              >
                <option value="Working / Refurbishable">Working / Refurbishable</option>
                <option value="Partially Working">Partially Working</option>
                <option value="Non-working">Non-working</option>
                <option value="Damaged / Swollen Battery">Damaged / Swollen Battery</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-emerald-200/80 mb-1">
                Quantity (units) *
              </label>
              <input
                type="number"
                min={1}
                max={5000}
                required
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-emerald-200/80 mb-1">
                Estimated Weight (kg) *
              </label>
              <input
                type="number"
                step="0.1"
                min={0.2}
                max={50000}
                required
                value={estimatedWeightKg}
                onChange={(e) => setEstimatedWeightKg(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-emerald-200/80 mb-1">
                Handling / Access Instructions (Optional)
              </label>
              <input
                type="text"
                maxLength={500}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g., Security gate pass required, call 15 mins before arrival"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
              />
            </div>
          </div>
        </div>

        {duplicateWarning && (
          <div className="p-3.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-xs text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span>{duplicateWarning}</span>
            <button
              type="button"
              onClick={() => void handleBookSlot(true)}
              className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-semibold whitespace-nowrap"
            >
              Confirm Anyway
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-emerald-800 text-slate-700 dark:text-emerald-100 hover:bg-slate-100 dark:hover:bg-emerald-900/40 whitespace-nowrap"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2.5 rounded-lg text-xs font-semibold bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950 hover:bg-emerald-700 dark:hover:bg-emerald-400 disabled:opacity-60 inline-flex items-center gap-2 whitespace-nowrap"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Book Pickup Slot
          </button>
        </div>
      </form>

      {/* Right Column: Live Synced Upcoming Bookings */}
      {!compact && (
        <aside className="xl:col-span-5 p-6 rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#081D16] space-y-4">
          <div className="pb-3 border-b border-slate-200 dark:border-emerald-900/50">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-emerald-50">
              Your Booked Pickup Slots
            </h4>
            <p className="text-xs text-slate-500 dark:text-emerald-200/65 mt-0.5">
              Saved to your account · Reschedule or cancel upcoming windows anytime.
            </p>
          </div>

          {bookingsLoading ? (
            <div className="space-y-3">
              {[1, 2].map((n) => (
                <div
                  key={n}
                  className="py-3 border-b border-slate-200 dark:border-emerald-900/50 animate-pulse space-y-2"
                >
                  <div className="h-3.5 w-32 rounded bg-slate-200 dark:bg-emerald-900/60" />
                  <div className="h-3 w-full rounded bg-slate-100 dark:bg-emerald-950/70" />
                </div>
              ))}
            </div>
          ) : bookings.length === 0 ? (
            <div className="py-8 px-4 rounded-xl border border-dashed border-slate-300 dark:border-emerald-900/70 text-center space-y-1.5">
              <p className="text-sm font-medium text-slate-900 dark:text-emerald-50">
                No scheduled pickups yet
              </p>
              <p className="text-xs text-slate-500 dark:text-emerald-200/65">
                Pick a date and time slot on the left to reserve your first doorstep e-waste collection.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-emerald-900/50 max-h-[540px] overflow-y-auto pr-1">
              {bookings.map((b) => {
                const isClosed = b.status === 'Cancelled' || b.status === 'Completed';
                const isEditing = editingId === b.id;

                return (
                  <article key={b.id} className="py-4 first:pt-0 last:pb-0 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 text-xs">
                          <span className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                            {b.requestCode}
                          </span>
                          <span className="text-slate-300 dark:text-emerald-800" aria-hidden="true">
                            ·
                          </span>
                          <span
                            className={`font-semibold ${
                              b.status === 'Cancelled'
                                ? 'text-red-600 dark:text-red-400'
                                : b.status === 'Completed'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-amber-700 dark:text-amber-300'
                            }`}
                          >
                            {b.status}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-emerald-50 mt-0.5 truncate">
                          {b.deviceName}
                        </p>
                      </div>
                      <span className="font-mono tabular-nums text-xs text-slate-500 dark:text-emerald-200/70 shrink-0">
                        {b.estimatedWeightKg} kg
                      </span>
                    </div>

                    <p className="text-xs font-mono tabular-nums text-slate-700 dark:text-emerald-100/85">
                      {b.preferredDate} · {b.timeSlot}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-emerald-200/65 leading-snug">
                      {b.pickupAddress}
                    </p>

                    {!isClosed && !isEditing && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(b.id);
                            setEditDate(b.preferredDate);
                            setEditSlot(b.timeSlot);
                          }}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-emerald-800 text-slate-700 dark:text-emerald-100 hover:bg-slate-100 dark:hover:bg-emerald-900/40 whitespace-nowrap"
                        >
                          Reschedule
                        </button>
                        {calendarLinks[b.requestCode] ? (
                          <a
                            href={calendarLinks[b.requestCode]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:underline inline-flex items-center gap-1 whitespace-nowrap"
                          >
                            <CalendarCheck2 className="w-3.5 h-3.5" />
                            In Calendar
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (!workspaceToken) {
                                void signInWithGoogle();
                                return;
                              }
                              setCalendarPending({
                                requestCode: b.requestCode,
                                deviceName: b.deviceName,
                                preferredDate: b.preferredDate,
                                timeSlot: b.timeSlot,
                                pickupAddress: b.pickupAddress,
                                instructions: b.instructions,
                              });
                            }}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-emerald-600/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 inline-flex items-center gap-1 whitespace-nowrap"
                          >
                            <CalendarPlus className="w-3.5 h-3.5" />
                            Add to Calendar
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busyBookingId === b.id}
                          onClick={() => void handleCancelBooking(b.id)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 disabled:opacity-50 whitespace-nowrap"
                        >
                          {busyBookingId === b.id ? 'Cancelling...' : 'Cancel Slot'}
                        </button>
                      </div>
                    )}

                    {isEditing && (
                      <div className="pt-2 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="date"
                            min={todayIso}
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            className="px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-emerald-800 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
                          />
                          <select
                            value={editSlot}
                            onChange={(e) => setEditSlot(e.target.value as PickupTimeSlot)}
                            className="px-2 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-emerald-800 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
                          >
                            {PICKUP_TIME_SLOTS.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={busyBookingId === b.id}
                            onClick={() => void handleSaveReschedule(b.id)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950 disabled:opacity-60"
                          >
                            {busyBookingId === b.id ? 'Saving...' : 'Save Slot'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-emerald-200/75 hover:underline"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </aside>
      )}

      <ConfirmDialog
        open={Boolean(calendarPending)}
        title="Add Pickup to Google Calendar"
        description={
          calendarPending
            ? `Create an event on your primary Google Calendar?\n\nEvent: Reboot Earth Pickup: ${calendarPending.deviceName} (${calendarPending.requestCode})\nDate & Window: ${calendarPending.preferredDate} · ${calendarPending.timeSlot}\nLocation: ${calendarPending.pickupAddress}`
            : ''
        }
        confirmLabel="Add to Google Calendar"
        busy={calendarSyncBusy}
        onConfirm={() => void handleConfirmAddToCalendar()}
        onCancel={() => setCalendarPending(null)}
      />
    </div>
  );
};

export default SchedulePickup;
