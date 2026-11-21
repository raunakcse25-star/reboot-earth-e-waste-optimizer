import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Camera,
  CheckCircle2,
  Compass,
  FileText,
  Loader2,
  Mail,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  EWASTE_CATEGORIES,
  PICKUP_STATUS_FLOW,
  type Facility,
  type PickupRequest,
  type Vehicle,
} from '../types';
import { listGoogleContacts, sendGmailMessage, type GoogleContact } from '../lib/workspace';
import { ConfirmDialog } from './ConfirmDialog';

interface PickupManagerProps {
  facilities: Facility[];
  vehicles: Vehicle[];
  onDataChanged?: () => void;
}

// Deterministic SVG QR-style verification grid for printable recycling receipts
function ReceiptQrSvg({ code }: { code: string }) {
  const cells = useMemo(() => {
    let hash = 2166136261;
    for (let i = 0; i < code.length; i++) {
      hash ^= code.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const grid: boolean[] = [];
    for (let i = 0; i < 121; i++) {
      const r = Math.floor(i / 11);
      const c = i % 11;
      const inCorner =
        (r < 3 && c < 3) || (r < 3 && c > 7) || (r > 7 && c < 3);
      if (inCorner) {
        grid.push(true);
      } else {
        hash = Math.imul(hash ^ (i + 17), 16777619);
        grid.push((hash & 1) === 1);
      }
    }
    return grid;
  }, [code]);

  return (
    <svg
      viewBox="0 0 110 110"
      className="w-24 h-24 rounded-md bg-white p-1.5 border border-slate-200"
      aria-label={`Verification QR for ${code}`}
    >
      {cells.map((filled, idx) => {
        if (!filled) return null;
        const x = (idx % 11) * 10;
        const y = Math.floor(idx / 11) * 10;
        return <rect key={idx} x={x} y={y} width={9} height={9} fill="#064E3B" rx={1} />;
      })}
    </svg>
  );
}

export const PickupManager: React.FC<PickupManagerProps> = ({
  facilities,
  vehicles,
  onDataChanged,
}) => {
  const { dbUser, firebaseUser, workspaceToken, pushNotification } = useAuth();
  const [pickups, setPickups] = useState<PickupRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Create form state
  const [deviceName, setDeviceName] = useState('');
  const [category, setCategory] = useState<string>(EWASTE_CATEGORIES[0]);
  const [quantity, setQuantity] = useState(1);
  const [estimatedWeightKg, setEstimatedWeightKg] = useState(2.5);
  const [condition, setCondition] = useState('Non-working');
  const [pickupAddress, setPickupAddress] = useState('');
  const [lat, setLat] = useState(28.6139);
  const [lng, setLng] = useState(77.209);
  const [preferredDate, setPreferredDate] = useState(
    new Date(Date.now() + 86400_000 * 2).toISOString().slice(0, 10)
  );
  const [timeSlot, setTimeSlot] = useState('10:00 AM - 01:00 PM');
  const [contactName, setContactName] = useState(dbUser?.fullName || '');
  const [contactPhone, setContactPhone] = useState(dbUser?.phone || '');
  const [instructions, setInstructions] = useState('');

  // AI Vision & Triage state
  const [visionLoading, setVisionLoading] = useState(false);
  const [visionTips, setVisionTips] = useState<string | null>(null);
  const [triageLoading, setTriageLoading] = useState(false);

  // Google Contacts autofill state
  const [contacts, setContacts] = useState<GoogleContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [showContacts, setShowContacts] = useState(false);

  // Duplicate & submission state
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // Selected receipt & Gmail confirmation
  const [receiptPickup, setReceiptPickup] = useState<PickupRequest | null>(null);
  const [emailConfirmOpen, setEmailConfirmOpen] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailFeedback, setEmailFeedback] = useState<string | null>(null);

  // Reschedule modal
  const [rescheduleTarget, setRescheduleTarget] = useState<PickupRequest | null>(null);
  const [newDate, setNewDate] = useState('');
  const [newSlot, setNewSlot] = useState('10:00 AM - 01:00 PM');

  // Operator status update
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const isOperator = Boolean(
    dbUser && ['admin', 'collection_centre', 'recycler', 'refurbisher', 'transporter'].includes(dbUser.role)
  );

  useEffect(() => {
    if (dbUser) {
      setContactName((prev) => prev || dbUser.fullName || '');
      setContactPhone((prev) => prev || dbUser.phone || '');
    }
  }, [dbUser]);

  const loadPickups = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await apiFetch<PickupRequest[]>('/api/pickups');
      setPickups(rows);
    } catch (err: any) {
      setFormError(err?.message || 'Unable to load pickup requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPickups();
  }, [loadPickups]);

  const filteredPickups = useMemo(() => {
    return pickups.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (searchText.trim()) {
        const q = searchText.toLowerCase();
        return (
          p.requestCode.toLowerCase().includes(q) ||
          p.deviceName.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.pickupAddress.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [pickups, statusFilter, searchText]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFormError('Please select a JPEG, PNG, or WebP photo.');
      return;
    }
    setVisionLoading(true);
    setFormError(null);
    setVisionTips(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || '');
          const clean = result.includes(',') ? result.split(',')[1] : result;
          resolve(clean);
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
      setVisionTips(`${hazardStr}${identified.safeHandlingTip || ''}`.trim());
    } catch (err: any) {
      setFormError(err?.message || 'Unable to analyze device photo.');
    } finally {
      setVisionLoading(false);
    }
  };

  const handleFastTriage = async () => {
    if (!deviceName.trim()) return;
    setTriageLoading(true);
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
      setVisionTips(`AI Quick Triage (${res.priority} priority): ${res.note}`);
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

  const handleUseGps = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(Number(pos.coords.latitude.toFixed(5)));
        setLng(Number(pos.coords.longitude.toFixed(5)));
      },
      () => setFormError('Location access denied. Enter your address manually.')
    );
  };

  const submitPickup = async (confirmDuplicate = false) => {
    setSubmitting(true);
    setFormError(null);
    try {
      const created = await apiFetch<PickupRequest>('/api/pickups', {
        method: 'POST',
        body: JSON.stringify({
          deviceName,
          category,
          quantity,
          estimatedWeightKg,
          condition,
          pickupAddress,
          lat,
          lng,
          preferredDate,
          timeSlot,
          contactName,
          contactPhone,
          instructions,
          confirmDuplicate,
        }),
      });
      setDuplicateWarning(null);
      setShowCreateForm(false);
      setDeviceName('');
      setPickupAddress('');
      setInstructions('');
      setVisionTips(null);
      await loadPickups();
      onDataChanged?.();
      void pushNotification({
        title: `Pickup ${created.requestCode} Submitted`,
        message: `${created.deviceName} (${created.estimatedWeightKg} kg) scheduled for ${created.preferredDate}.`,
        category: 'pickup',
      });
    } catch (err: any) {
      if (err?.status === 409) {
        setDuplicateWarning(err.message);
      } else {
        setFormError(err?.message || 'Failed to submit pickup request.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdvanceStatus = async (pickup: PickupRequest, nextStatus: string) => {
    setUpdatingId(pickup.id);
    try {
      await apiFetch(`/api/pickups/${pickup.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: nextStatus,
          assignedFacilityId: pickup.assignedFacilityId ?? facilities[0]?.id,
          assignedVehicleId: pickup.assignedVehicleId ?? vehicles[0]?.id,
        }),
      });
      await loadPickups();
      onDataChanged?.();
    } catch (err: any) {
      setFormError(err?.message || 'Status transition failed.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleTarget) return;
    try {
      await apiFetch(`/api/pickups/${rescheduleTarget.id}/reschedule`, {
        method: 'PATCH',
        body: JSON.stringify({ preferredDate: newDate, timeSlot: newSlot }),
      });
      setRescheduleTarget(null);
      await loadPickups();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to reschedule pickup.');
    }
  };

  const handleSendReceiptEmail = async () => {
    if (!workspaceToken || !receiptPickup || !firebaseUser?.email) return;
    setEmailBusy(true);
    setEmailFeedback(null);
    try {
      const body = [
        `Reboot Earth — Digital E-Waste Collection & Recycling Record`,
        `----------------------------------------------------------`,
        `Tracking Code: ${receiptPickup.requestCode}`,
        `Device: ${receiptPickup.deviceName} (Qty: ${receiptPickup.quantity})`,
        `Category: ${receiptPickup.category}`,
        `Estimated Weight: ${receiptPickup.estimatedWeightKg} kg`,
        `Pickup Address: ${receiptPickup.pickupAddress}`,
        `Scheduled Date: ${receiptPickup.preferredDate} (${receiptPickup.timeSlot})`,
        `Current Status: ${receiptPickup.status}`,
        ``,
        `Note: This is a Reboot Earth platform operational receipt for tracking and impact estimation. Official CPCB/SPCB statutory EPR certificates are issued solely through government-authorized CPCB portals.`,
      ].join('\n');

      await sendGmailMessage(workspaceToken, {
        to: firebaseUser.email,
        subject: `Reboot Earth Recycling Record — ${receiptPickup.requestCode}`,
        body,
      });
      setEmailFeedback(`Receipt emailed to ${firebaseUser.email} via Gmail.`);
    } catch (err: any) {
      setEmailFeedback(`Gmail error: ${err?.message || 'Unable to send email.'}`);
    } finally {
      setEmailBusy(false);
      setEmailConfirmOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-emerald-50">
            E-Waste Pickup Requests
          </h3>
          <p className="text-xs text-slate-600 dark:text-emerald-200/70">
            Track door-to-door collections across the 9-stage audited chain of custody.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateForm((v) => !v)}
          className="px-4 py-2.5 rounded-lg text-xs font-semibold bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950 hover:bg-emerald-700 dark:hover:bg-emerald-400 inline-flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          {showCreateForm ? 'Close Form' : 'Schedule New Pickup'}
        </button>
      </div>

      {formError && (
        <div className="p-3.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-center justify-between gap-2">
          <span>{formError}</span>
          <button type="button" onClick={() => setFormError(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* New Pickup Request Form */}
      {showCreateForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitPickup(false);
          }}
          className="p-6 rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#081D16] space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-emerald-900/50">
            <div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-emerald-50">
                Submit E-Waste Collection Request
              </h4>
              <p className="text-xs text-slate-500 dark:text-emerald-200/65">
                Upload a photo of your electronic device for instant AI classification, or enter details manually.
              </p>
            </div>
            <label className="px-3.5 py-2 rounded-lg border border-emerald-600/50 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 cursor-pointer inline-flex items-center gap-1.5 self-start">
              {visionLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Camera className="w-3.5 h-3.5" />
              )}
              {visionLoading ? 'Analyzing Photo...' : 'Scan Device Photo (AI)'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleImageUpload}
              />
            </label>
          </div>

          {visionTips && (
            <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 text-xs text-emerald-900 dark:text-emerald-200">
              {visionTips}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="md:col-span-2 lg:col-span-1">
              <label className="block text-xs font-medium text-slate-700 dark:text-emerald-200/80 mb-1">
                Device Name *
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  required
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  placeholder="e.g., Dell Latitude Laptop + Charger"
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
                />
                <button
                  type="button"
                  onClick={() => void handleFastTriage()}
                  disabled={triageLoading || !deviceName.trim()}
                  title="Auto-categorize with Gemini Flash-Lite"
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
                E-Waste Category *
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
                Device Condition
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
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-emerald-200/80 mb-1">
                Estimated Total Weight (kg) *
              </label>
              <input
                type="number"
                step="0.1"
                min={0.2}
                max={50000}
                required
                value={estimatedWeightKg}
                onChange={(e) => setEstimatedWeightKg(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-emerald-200/80 mb-1">
                Preferred Date &amp; Time Slot *
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="date"
                  required
                  value={preferredDate}
                  onChange={(e) => setPreferredDate(e.target.value)}
                  className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
                />
                <select
                  value={timeSlot}
                  onChange={(e) => setTimeSlot(e.target.value)}
                  className="px-2 py-2 text-xs rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
                >
                  <option>09:00 AM - 12:00 PM</option>
                  <option>10:00 AM - 01:00 PM</option>
                  <option>02:00 PM - 05:00 PM</option>
                  <option>05:00 PM - 08:00 PM</option>
                </select>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-emerald-200/80 mb-1">
                Pickup Address *
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={pickupAddress}
                  onChange={(e) => setPickupAddress(e.target.value)}
                  placeholder="House/Office number, street, locality, city, PIN code"
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
                />
                <button
                  type="button"
                  onClick={handleUseGps}
                  title="Attach GPS coordinates"
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-emerald-800 text-xs font-medium text-slate-700 dark:text-emerald-200 hover:bg-slate-100 dark:hover:bg-emerald-900/40 inline-flex items-center gap-1 whitespace-nowrap"
                >
                  <Compass className="w-3.5 h-3.5" />
                  GPS ({lat.toFixed(2)}, {lng.toFixed(2)})
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-700 dark:text-emerald-200/80">
                  Contact Person &amp; Phone *
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
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  required
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Full name"
                  className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
                />
                <input
                  type="tel"
                  required
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+91-98..."
                  className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
                />
              </div>
            </div>

            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-xs font-medium text-slate-700 dark:text-emerald-200/80 mb-1">
                Handling Instructions (Optional)
              </label>
              <input
                type="text"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g., Gate pass required at reception, call 15 mins prior, lithium battery packed separately"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
              />
            </div>
          </div>

          {showContacts && contacts.length > 0 && (
            <div className="p-3.5 rounded-lg border border-slate-200 dark:border-emerald-900/60 bg-slate-50 dark:bg-[#05140F] space-y-2">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-40 overflow-y-auto">
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
                    <p className="text-xs font-medium text-slate-900 dark:text-emerald-50 truncate">{c.name}</p>
                    <p className="text-[11px] text-slate-500 dark:text-emerald-200/65 truncate">
                      {c.phone || c.email || 'No phone'}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {duplicateWarning && (
            <div className="p-3.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-xs text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span>{duplicateWarning}</span>
              <button
                type="button"
                onClick={() => void submitPickup(true)}
                className="px-3 py-1.5 rounded bg-amber-600 text-white font-semibold whitespace-nowrap"
              >
                Submit Anyway
              </button>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="px-4 py-2 rounded-lg text-xs font-medium border border-slate-300 dark:border-emerald-800 text-slate-700 dark:text-emerald-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950 hover:bg-emerald-700 dark:hover:bg-emerald-400 disabled:opacity-60 inline-flex items-center gap-1.5"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Confirm Pickup Request
            </button>
          </div>
        </form>
      )}

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Filter by request ID (RBE-...), device name, or address"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-white dark:bg-[#081D16] text-slate-900 dark:text-emerald-50"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-white dark:bg-[#081D16] text-slate-900 dark:text-emerald-50"
        >
          <option value="all">All Statuses</option>
          {PICKUP_STATUS_FLOW.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          <option value="Cancelled">Cancelled</option>
        </select>
        <button
          type="button"
          onClick={() => void loadPickups()}
          className="px-3 py-2 rounded-lg border border-slate-300 dark:border-emerald-800 text-slate-700 dark:text-emerald-200 hover:bg-slate-100 dark:hover:bg-emerald-900/40 inline-flex items-center justify-center gap-1.5 text-xs font-medium"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Pickup Request Cards */}
      {loading ? (
        <div className="p-8 text-center text-sm text-slate-500 dark:text-emerald-200/70">
          Loading pickup requests...
        </div>
      ) : filteredPickups.length === 0 ? (
        <div className="p-8 rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#081D16] text-center space-y-2">
          <p className="text-sm font-medium text-slate-900 dark:text-emerald-50">
            No pickup requests match your filter.
          </p>
          <p className="text-xs text-slate-500 dark:text-emerald-200/70">
            Click &ldquo;Schedule New Pickup&rdquo; above to log electronic waste for responsible collection.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPickups.map((p) => {
            const stageIndex = PICKUP_STATUS_FLOW.indexOf(p.status as any);
            const nextStatus =
              stageIndex >= 0 && stageIndex < PICKUP_STATUS_FLOW.length - 1
                ? PICKUP_STATUS_FLOW[stageIndex + 1]
                : null;
            const isCancelled = p.status === 'Cancelled';

            return (
              <div
                key={p.id}
                className="p-5 rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#081D16] space-y-4"
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        {p.requestCode}
                      </span>
                      <span className="text-slate-300 dark:text-emerald-800">·</span>
                      <span className="text-xs text-slate-600 dark:text-emerald-200/75">{p.category}</span>
                      <span className="text-slate-300 dark:text-emerald-800">·</span>
                      <span
                        className={`text-xs font-semibold ${
                          isCancelled
                            ? 'text-red-600 dark:text-red-400'
                            : p.status === 'Completed'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                    <h4 className="text-base font-semibold text-slate-900 dark:text-emerald-50 mt-1">
                      {p.deviceName}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-emerald-200/70 mt-0.5">
                      {p.pickupAddress} · Contact: {p.contactName} ({p.contactPhone})
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <span className="font-mono tabular-nums text-xs text-slate-700 dark:text-emerald-100 mr-1">
                      {p.quantity} unit{p.quantity === 1 ? '' : 's'} · {p.estimatedWeightKg} kg
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        setReceiptPickup(p);
                        setEmailFeedback(null);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-emerald-800 text-slate-700 dark:text-emerald-100 hover:bg-slate-100 dark:hover:bg-emerald-900/40 inline-flex items-center gap-1"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Receipt
                    </button>

                    {!isCancelled && p.status !== 'Completed' && (
                      <button
                        type="button"
                        onClick={() => {
                          setRescheduleTarget(p);
                          setNewDate(p.preferredDate);
                          setNewSlot(p.timeSlot);
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-emerald-800 text-slate-700 dark:text-emerald-100 hover:bg-slate-100 dark:hover:bg-emerald-900/40 inline-flex items-center gap-1"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        Reschedule
                      </button>
                    )}

                    {isOperator && nextStatus && !isCancelled && (
                      <button
                        type="button"
                        disabled={updatingId === p.id}
                        onClick={() => void handleAdvanceStatus(p, nextStatus)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950 hover:bg-emerald-700 dark:hover:bg-emerald-400 disabled:opacity-60"
                      >
                        {updatingId === p.id ? 'Updating...' : `Advance → ${nextStatus}`}
                      </button>
                    )}

                    {!isCancelled && stageIndex < 5 && (
                      <button
                        type="button"
                        disabled={updatingId === p.id}
                        onClick={() => void handleAdvanceStatus(p, 'Cancelled')}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>

                {/* 9-Stage Status Progress Bar */}
                {!isCancelled && (
                  <div className="pt-2 border-t border-slate-100 dark:border-emerald-900/50">
                    <div className="grid grid-cols-3 sm:grid-cols-9 gap-1.5">
                      {PICKUP_STATUS_FLOW.map((stage, i) => {
                        const completed = i <= stageIndex;
                        return (
                          <div key={stage} className="space-y-1">
                            <div
                              className={`h-1.5 rounded-full ${
                                completed
                                  ? 'bg-emerald-500'
                                  : 'bg-slate-200 dark:bg-emerald-950'
                              }`}
                            />
                            <p
                              className={`text-[10px] leading-tight ${
                                completed
                                  ? 'text-emerald-800 dark:text-emerald-300 font-medium'
                                  : 'text-slate-400 dark:text-emerald-200/40'
                              }`}
                            >
                              {stage}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-emerald-200/60">
                  <span>
                    Scheduled: {p.preferredDate} ({p.timeSlot}) · Condition: {p.condition}
                  </span>
                  {p.instructions && <span>Note: {p.instructions}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Digital Recycling Receipt Modal */}
      {receiptPickup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-emerald-800 bg-white dark:bg-[#081D16] p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-emerald-900/60 pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Reboot Earth · Digital Collection Record
                </p>
                <h4 className="text-lg font-bold font-mono text-slate-900 dark:text-emerald-50 mt-0.5">
                  {receiptPickup.requestCode}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setReceiptPickup(null)}
                className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
              <dl className="space-y-2 text-xs flex-1">
                <div>
                  <dt className="text-slate-500 dark:text-emerald-200/60">Item &amp; Category</dt>
                  <dd className="font-medium text-slate-900 dark:text-emerald-50">
                    {receiptPickup.deviceName} ({receiptPickup.category})
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-emerald-200/60">Quantity &amp; Estimated Mass</dt>
                  <dd className="font-mono font-medium text-slate-900 dark:text-emerald-50">
                    {receiptPickup.quantity} units · {receiptPickup.estimatedWeightKg} kg
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-emerald-200/60">Collection Location</dt>
                  <dd className="text-slate-700 dark:text-emerald-100/85">{receiptPickup.pickupAddress}</dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-emerald-200/60">Chain of Custody Status</dt>
                  <dd className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {receiptPickup.status}
                  </dd>
                </div>
              </dl>
              <div className="flex flex-col items-center gap-1 shrink-0">
                <ReceiptQrSvg code={receiptPickup.requestCode} />
                <span className="text-[10px] font-mono text-slate-500 dark:text-emerald-200/60">
                  Audit QR
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-emerald-200/65 leading-relaxed">
              Disclaimer: This digital record documents operational collection and tracking within Reboot Earth. It does not substitute for statutory EPR certificates or CPCB/SPCB manifests issued by government portals.
            </p>

            {emailFeedback && (
              <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">{emailFeedback}</p>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-300 dark:border-emerald-800 text-slate-700 dark:text-emerald-100 inline-flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                Print / PDF
              </button>
              {workspaceToken && firebaseUser?.email && (
                <button
                  type="button"
                  onClick={() => setEmailConfirmOpen(true)}
                  className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950 inline-flex items-center gap-1.5"
                >
                  <Mail className="w-3.5 h-3.5" />
                  Email via Gmail
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <form
            onSubmit={handleRescheduleSubmit}
            className="w-full max-w-md rounded-xl border border-slate-200 dark:border-emerald-800 bg-white dark:bg-[#081D16] p-6 space-y-4"
          >
            <h4 className="text-base font-semibold text-slate-900 dark:text-emerald-50">
              Reschedule {rescheduleTarget.requestCode}
            </h4>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-emerald-200/80 mb-1">
                  New Date
                </label>
                <input
                  type="date"
                  required
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-emerald-200/80 mb-1">
                  Time Slot
                </label>
                <select
                  value={newSlot}
                  onChange={(e) => setNewSlot(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
                >
                  <option>09:00 AM - 12:00 PM</option>
                  <option>10:00 AM - 01:00 PM</option>
                  <option>02:00 PM - 05:00 PM</option>
                  <option>05:00 PM - 08:00 PM</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRescheduleTarget(null)}
                className="px-4 py-2 rounded-lg text-xs border border-slate-300 dark:border-emerald-800 text-slate-700 dark:text-emerald-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950"
              >
                Save Schedule
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={emailConfirmOpen}
        title="Send Digital Recycling Receipt via Gmail"
        description={`This will send an email from your connected Gmail account to ${firebaseUser?.email} containing tracking record ${receiptPickup?.requestCode}. Proceed?`}
        confirmLabel="Send Email"
        busy={emailBusy}
        onConfirm={() => void handleSendReceiptEmail()}
        onCancel={() => setEmailConfirmOpen(false)}
      />
    </div>
  );
};
