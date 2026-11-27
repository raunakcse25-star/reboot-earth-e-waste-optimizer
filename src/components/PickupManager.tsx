import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CalendarPlus,
  CheckCircle2,
  ExternalLink,
  FileText,
  Mail,
  Plus,
  Printer,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { createUserNotification } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import {
  PICKUP_STATUS_FLOW,
  type Facility,
  type PickupRequest,
  type Vehicle,
} from '../types';
import {
  createGoogleCalendarEvent,
  pickupSlotToIsoWindow,
  sendGmailMessage,
} from '../lib/workspace';
import { ConfirmDialog } from './ConfirmDialog';
import { SchedulePickup } from './SchedulePickup';

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
        return <rect key={idx} x={x} y={y} width={9} height={9} fill="#075985" rx={1} />;
      })}
    </svg>
  );
}

export const PickupManager: React.FC<PickupManagerProps> = ({
  facilities,
  vehicles,
  onDataChanged,
}) => {
  const { dbUser, firebaseUser, workspaceToken, signInWithGoogle, pushNotification } = useAuth();
  const [pickups, setPickups] = useState<PickupRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);

  // Selected receipt & Gmail confirmation
  const [receiptPickup, setReceiptPickup] = useState<PickupRequest | null>(null);
  const [emailConfirmOpen, setEmailConfirmOpen] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailFeedback, setEmailFeedback] = useState<string | null>(null);

  // Google Calendar sync confirmation
  const [calendarTarget, setCalendarTarget] = useState<PickupRequest | null>(null);
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [calendarSyncedLinks, setCalendarSyncedLinks] = useState<Record<string, string>>({});

  // Reschedule modal
  const [rescheduleTarget, setRescheduleTarget] = useState<PickupRequest | null>(null);
  const [newDate, setNewDate] = useState('');
  const [newSlot, setNewSlot] = useState('10:00 AM - 01:00 PM');

  // Operator status update
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const isOperator = Boolean(
    dbUser && ['admin', 'collection_centre', 'recycler', 'refurbisher', 'transporter'].includes(dbUser.role)
  );

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

  const handleAdvanceStatus = async (pickup: PickupRequest, nextStatus: string) => {
    setUpdatingId(pickup.id);
    try {
      const assignedFacilityId = pickup.assignedFacilityId ?? facilities[0]?.id;
      const assignedVehicleId = pickup.assignedVehicleId ?? vehicles[0]?.id;

      await apiFetch(`/api/pickups/${pickup.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: nextStatus,
          assignedFacilityId,
          assignedVehicleId,
        }),
      });

      if (['Approved', 'Scheduled', 'Transporter Assigned', 'Collected'].includes(nextStatus)) {
        const facility = facilities.find((f) => f.id === assignedFacilityId);
        const vehicle = vehicles.find((v) => v.id === assignedVehicleId);
        const title = `Collector Accepted: ${pickup.requestCode} (${nextStatus})`.slice(0, 140);
        const parts = [
          `Your pickup request for ${pickup.deviceName} (${pickup.estimatedWeightKg} kg) is now "${nextStatus}".`,
        ];
        if (facility) {
          parts.push(`Collection center: ${facility.name} (${facility.city}).`);
        }
        if (vehicle) {
          parts.push(`Assigned vehicle: ${vehicle.registrationNo} (${vehicle.vehicleType}).`);
        }
        const message = parts.join(' ').slice(0, 500);
        const currentUid = firebaseUser?.uid || dbUser?.uid;

        if (pickup.userUid && pickup.userUid === currentUid) {
          void pushNotification({ title, message, category: 'pickup' }).catch(() => {});
        } else if (
          pickup.userUid &&
          firebaseUser?.emailVerified &&
          dbUser?.role === 'admin'
        ) {
          void createUserNotification(pickup.userUid, {
            title,
            message,
            category: 'pickup',
          }).catch(() => {});
        }
      }

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

  const handleConfirmAddCalendar = async () => {
    if (!workspaceToken || !calendarTarget) return;
    setCalendarBusy(true);
    setFormError(null);
    try {
      const win = pickupSlotToIsoWindow(calendarTarget.preferredDate, calendarTarget.timeSlot);
      const created = await createGoogleCalendarEvent(workspaceToken, {
        summary: `Reboot Earth Pickup: ${calendarTarget.deviceName} (${calendarTarget.requestCode})`,
        location: calendarTarget.pickupAddress,
        description: [
          `Tracking Code: ${calendarTarget.requestCode}`,
          `Category: ${calendarTarget.category} · ${calendarTarget.estimatedWeightKg} kg`,
          `Contact: ${calendarTarget.contactName} (${calendarTarget.contactPhone})`,
          calendarTarget.instructions ? `Notes: ${calendarTarget.instructions}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        startIso: win.startIso,
        endIso: win.endIso,
        timeZone: win.timeZone,
      });
      setCalendarSyncedLinks((prev) => ({
        ...prev,
        [calendarTarget.requestCode]: created.htmlLink || 'https://calendar.google.com',
      }));
      setCalendarTarget(null);
    } catch (err: any) {
      setFormError(err?.message || 'Unable to create Google Calendar event.');
      setCalendarTarget(null);
    } finally {
      setCalendarBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-sky-50">
            E-Waste Pickup Requests
          </h3>
          <p className="text-xs text-slate-600 dark:text-sky-200/70">
            Track door-to-door collections across the 9-stage audited chain of custody.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateForm((v) => !v)}
          className="px-4 py-2.5 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 hover:bg-sky-700 dark:hover:bg-sky-400 inline-flex items-center gap-1.5 self-start sm:self-auto"
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

      {/* New Pickup Request Booking Component */}
      {showCreateForm && (
        <SchedulePickup
          facilities={facilities}
          compact
          onCancel={() => setShowCreateForm(false)}
          onBooked={() => {
            setShowCreateForm(false);
            void loadPickups();
            onDataChanged?.();
          }}
        />
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
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-sky-900/70 bg-white dark:bg-[#0B223B] text-slate-900 dark:text-sky-50"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-sky-900/70 bg-white dark:bg-[#0B223B] text-slate-900 dark:text-sky-50"
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
          className="px-3 py-2 rounded-lg border border-slate-300 dark:border-sky-800 text-slate-700 dark:text-sky-200 hover:bg-slate-100 dark:hover:bg-sky-900/40 inline-flex items-center justify-center gap-1.5 text-xs font-medium"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Pickup Request Cards */}
      {loading ? (
        <div className="p-8 text-center text-sm text-slate-500 dark:text-sky-200/70">
          Loading pickup requests...
        </div>
      ) : filteredPickups.length === 0 ? (
        <div className="p-8 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] text-center space-y-2">
          <p className="text-sm font-medium text-slate-900 dark:text-sky-50">
            No pickup requests match your filter.
          </p>
          <p className="text-xs text-slate-500 dark:text-sky-200/70">
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
                className="p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-4"
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span className="font-mono text-xs font-semibold text-sky-700 dark:text-sky-400">
                        {p.requestCode}
                      </span>
                      <span className="text-slate-300 dark:text-sky-800">·</span>
                      <span className="text-xs text-slate-600 dark:text-sky-200/75">{p.category}</span>
                      <span className="text-slate-300 dark:text-sky-800">·</span>
                      <span
                        className={`text-xs font-semibold ${
                          isCancelled
                            ? 'text-red-600 dark:text-red-400'
                            : p.status === 'Completed'
                            ? 'text-sky-700 dark:text-sky-400'
                            : 'text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                    <h4 className="text-base font-semibold text-slate-900 dark:text-sky-50 mt-1">
                      {p.deviceName}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-sky-200/70 mt-0.5">
                      {p.pickupAddress} · Contact: {p.contactName} ({p.contactPhone})
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <span className="font-mono tabular-nums text-xs text-slate-700 dark:text-sky-100 mr-1">
                      {p.quantity} unit{p.quantity === 1 ? '' : 's'} · {p.estimatedWeightKg} kg
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        setReceiptPickup(p);
                        setEmailFeedback(null);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-sky-800 text-slate-700 dark:text-sky-100 hover:bg-slate-100 dark:hover:bg-sky-900/40 inline-flex items-center gap-1"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Receipt
                    </button>

                    {!isCancelled && p.status !== 'Completed' && (
                      <>
                        {calendarSyncedLinks[p.requestCode] ? (
                          <a
                            href={calendarSyncedLinks[p.requestCode]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-sky-500/60 text-sky-700 dark:text-sky-300 inline-flex items-center gap-1"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
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
                              setCalendarTarget(p);
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-sky-600/50 text-sky-700 dark:text-sky-300 hover:bg-sky-500/10 inline-flex items-center gap-1"
                          >
                            <CalendarPlus className="w-3.5 h-3.5" />
                            Add to Calendar
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setRescheduleTarget(p);
                            setNewDate(p.preferredDate);
                            setNewSlot(p.timeSlot);
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-sky-800 text-slate-700 dark:text-sky-100 hover:bg-slate-100 dark:hover:bg-sky-900/40 inline-flex items-center gap-1"
                        >
                          <Calendar className="w-3.5 h-3.5" />
                          Reschedule
                        </button>
                      </>
                    )}

                    {isOperator && nextStatus && !isCancelled && (
                      <button
                        type="button"
                        disabled={updatingId === p.id}
                        onClick={() => void handleAdvanceStatus(p, nextStatus)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 hover:bg-sky-700 dark:hover:bg-sky-400 disabled:opacity-60"
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
                  <div className="pt-2 border-t border-slate-100 dark:border-sky-900/50">
                    <div className="grid grid-cols-3 sm:grid-cols-9 gap-1.5">
                      {PICKUP_STATUS_FLOW.map((stage, i) => {
                        const completed = i <= stageIndex;
                        return (
                          <div key={stage} className="space-y-1">
                            <div
                              className={`h-1.5 rounded-full ${
                                completed
                                  ? 'bg-sky-500'
                                  : 'bg-slate-200 dark:bg-sky-950'
                              }`}
                            />
                            <p
                              className={`text-[10px] leading-tight ${
                                completed
                                  ? 'text-sky-800 dark:text-sky-300 font-medium'
                                  : 'text-slate-400 dark:text-sky-200/40'
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

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-sky-200/60">
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
          <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-sky-800 bg-white dark:bg-[#0B223B] p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-sky-900/60 pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-400">
                  Reboot Earth · Digital Collection Record
                </p>
                <h4 className="text-lg font-bold font-mono text-slate-900 dark:text-sky-50 mt-0.5">
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
                  <dt className="text-slate-500 dark:text-sky-200/60">Item &amp; Category</dt>
                  <dd className="font-medium text-slate-900 dark:text-sky-50">
                    {receiptPickup.deviceName} ({receiptPickup.category})
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-sky-200/60">Quantity &amp; Estimated Mass</dt>
                  <dd className="font-mono font-medium text-slate-900 dark:text-sky-50">
                    {receiptPickup.quantity} units · {receiptPickup.estimatedWeightKg} kg
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-sky-200/60">Collection Location</dt>
                  <dd className="text-slate-700 dark:text-sky-100/85">{receiptPickup.pickupAddress}</dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-sky-200/60">Chain of Custody Status</dt>
                  <dd className="inline-flex items-center gap-1 font-semibold text-sky-700 dark:text-sky-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {receiptPickup.status}
                  </dd>
                </div>
              </dl>
              <div className="flex flex-col items-center gap-1 shrink-0">
                <ReceiptQrSvg code={receiptPickup.requestCode} />
                <span className="text-[10px] font-mono text-slate-500 dark:text-sky-200/60">
                  Audit QR
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-sky-200/65 leading-relaxed">
              Disclaimer: This digital record documents operational collection and tracking within Reboot Earth. It does not substitute for statutory EPR certificates or CPCB/SPCB manifests issued by government portals.
            </p>

            {emailFeedback && (
              <p className="text-xs text-sky-700 dark:text-sky-300 font-medium">{emailFeedback}</p>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-300 dark:border-sky-800 text-slate-700 dark:text-sky-100 inline-flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                Print / PDF
              </button>
              {workspaceToken && firebaseUser?.email && (
                <button
                  type="button"
                  onClick={() => setEmailConfirmOpen(true)}
                  className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 inline-flex items-center gap-1.5"
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
            className="w-full max-w-md rounded-xl border border-slate-200 dark:border-sky-800 bg-white dark:bg-[#0B223B] p-6 space-y-4"
          >
            <h4 className="text-base font-semibold text-slate-900 dark:text-sky-50">
              Reschedule {rescheduleTarget.requestCode}
            </h4>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-sky-200/80 mb-1">
                  New Date
                </label>
                <input
                  type="date"
                  required
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-sky-200/80 mb-1">
                  Time Slot
                </label>
                <select
                  value={newSlot}
                  onChange={(e) => setNewSlot(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
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
                className="px-4 py-2 rounded-lg text-xs border border-slate-300 dark:border-sky-800 text-slate-700 dark:text-sky-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950"
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

      <ConfirmDialog
        open={Boolean(calendarTarget)}
        title="Add Pickup to Google Calendar"
        description={
          calendarTarget
            ? `Create an event on your primary Google Calendar?\n\nEvent: Reboot Earth Pickup: ${calendarTarget.deviceName} (${calendarTarget.requestCode})\nDate & Window: ${calendarTarget.preferredDate} · ${calendarTarget.timeSlot}\nLocation: ${calendarTarget.pickupAddress}`
            : ''
        }
        confirmLabel="Add to Google Calendar"
        busy={calendarBusy}
        onConfirm={() => void handleConfirmAddCalendar()}
        onCancel={() => setCalendarTarget(null)}
      />
    </div>
  );
};
