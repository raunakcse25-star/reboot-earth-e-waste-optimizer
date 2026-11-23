import React, { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  CloudUpload,
  Download,
  IndianRupee,
  Leaf,
  Loader2,
  Play,
  Route,
  Truck,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { saveFileToGoogleDrive } from '../lib/workspace';
import { ConfirmDialog } from './ConfirmDialog';
import { OptimizerRouteMap } from './OptimizerRouteMap';
import type { OptimizationObjective, OptimizationOutput } from '../server/optimizer';

interface SavedRunRow {
  id: number;
  runCode: string;
  objective: string;
  totalDistanceKm: number;
  baselineDistanceKm: number;
  estimatedCostInr: number;
  baselineCostInr: number;
  estimatedEmissionsKg: number;
  baselineEmissionsKg: number;
  assignedCount: number;
  unassignedCount: number;
  approved: boolean;
  createdAt: string;
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export const OptimizerStudio: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isAuthenticated, firebaseUser, dbUser, workspaceToken, pushNotification } = useAuth();
  const [objective, setObjective] = useState<OptimizationObjective>('emission');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OptimizationOutput | null>(null);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [history, setHistory] = useState<SavedRunRow[]>([]);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [driveConfirmOpen, setDriveConfirmOpen] = useState(false);
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveSuccess, setDriveSuccess] = useState<{ name: string; link?: string } | null>(null);
  const [lastRunNote, setLastRunNote] = useState<string | null>(null);

  const canApprove =
    dbUser && ['admin', 'transporter', 'collection_centre'].includes(dbUser.role);

  const OBJECTIVE_LABELS: Record<OptimizationObjective, string> = {
    emission: 'Min Emissions (kg CO₂e)',
    distance: 'Min Distance (km)',
    cost: 'Min Cost (₹)',
  };

  const loadHistory = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const rows = await apiFetch<SavedRunRow[]>('/api/optimize/history');
      setHistory(rows);
    } catch {
      // History stays empty if unauthenticated
    }
  }, [isAuthenticated]);

  const executeOptimization = useCallback(
    async (selectedObj: OptimizationObjective, saveRun = true, announce = true) => {
      setRunning(true);
      setError(null);
      setDriveSuccess(null);
      try {
        const res = await apiFetch<{ result: OptimizationOutput; savedRun?: SavedRunRow }>(
          '/api/optimize',
          {
            method: 'POST',
            body: JSON.stringify({
              objective: selectedObj,
              saveRun: Boolean(isAuthenticated && saveRun),
            }),
          },
          Boolean(isAuthenticated)
        );
        setResult(res.result);
        setSelectedRouteIndex(0);
        if (announce) {
          const timeLabel = new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });
          const savedSuffix = res.savedRun ? ` · Saved as ${res.savedRun.runCode}` : '';
          setLastRunNote(
            `Optimized for ${OBJECTIVE_LABELS[selectedObj]} at ${timeLabel} — ${res.result.assignments.length} route${res.result.assignments.length === 1 ? '' : 's'}, ${res.result.totalDistanceKm} km, ${formatDuration(res.result.estimatedTravelMinutes)}, ₹${res.result.estimatedCostInr.toLocaleString()}, ${res.result.estimatedEmissionsKg} kg CO₂e${savedSuffix}.`
          );
        }
        if (isAuthenticated && res.savedRun) {
          void loadHistory();
          if (firebaseUser) {
            void pushNotification({
              title: `Route Plan ${res.savedRun.runCode} Generated`,
              message: `Objective: ${selectedObj}. Estimated savings: ${res.result.distanceSavedKm} km, ${res.result.timeSavedMinutes} min, and ${res.result.emissionsSavedKg} kg CO2e.`,
              category: 'optimization',
            });
          }
        }
      } catch (err: any) {
        setError(err?.message || 'Unable to execute route optimization.');
      } finally {
        setRunning(false);
      }
    },
    [isAuthenticated, firebaseUser, loadHistory, pushNotification]
  );

  useEffect(() => {
    void executeOptimization('emission', false, false);
    if (isAuthenticated) {
      void loadHistory();
    }
  }, [isAuthenticated, executeOptimization, loadHistory]);

  const handleApproveRun = async (id: number) => {
    setApprovingId(id);
    try {
      await apiFetch(`/api/optimize/${id}/approve`, { method: 'PATCH' });
      await loadHistory();
    } catch (err: any) {
      setError(err?.message || 'Failed to approve dispatch plan.');
    } finally {
      setApprovingId(null);
    }
  };

  const buildCsvReport = () => {
    if (!result) return '';
    const headers = [
      'Vehicle',
      'Type',
      'Fuel',
      'Driver',
      'Facility',
      'Requests',
      'Weight_kg',
      'Utilization_pct',
      'Distance_km',
      'Travel_Time_min',
      'Cost_INR',
      'Emissions_kg_CO2e',
    ];
    const rows = result.assignments.map((a) => [
      a.registrationNo,
      a.vehicleType,
      a.fuelType,
      a.driverName,
      a.facilityName,
      a.requestCodes.join(' | '),
      a.totalWeightKg,
      a.utilizationPct,
      a.routeDistanceKm,
      a.estimatedTravelMinutes,
      a.estimatedCostInr,
      a.estimatedEmissionsKg,
    ]);
    return [
      headers.join(','),
      ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
  };

  const handleDownloadCsv = () => {
    const csv = buildCsvReport();
    if (!csv) return;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reboot-earth-optimization-${objective}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleUploadToDrive = async () => {
    if (!workspaceToken || !result) return;
    setDriveBusy(true);
    try {
      const csv = buildCsvReport();
      const uploaded = await saveFileToGoogleDrive(workspaceToken, {
        fileName: `RebootEarth_Optimization_${objective}_${new Date().toISOString().slice(0, 10)}.csv`,
        content: csv,
        mimeType: 'text/csv',
      });
      setDriveSuccess({ name: uploaded.name, link: uploaded.webViewLink });
    } catch (err: any) {
      setError(err?.message || 'Google Drive upload failed.');
    } finally {
      setDriveBusy(false);
      setDriveConfirmOpen(false);
    }
  };

  const activeObjective = result?.objective ?? objective;
  const objectivePendingRecalc = Boolean(result && result.objective !== objective);

  const comparisonData = result
    ? [
        {
          metric: 'Distance (km)',
          Baseline: result.baselineDistanceKm,
          Optimized: result.totalDistanceKm,
        },
        {
          metric: 'Time (min)',
          Baseline: result.baselineTravelMinutes,
          Optimized: result.estimatedTravelMinutes,
        },
        {
          metric: 'Cost (₹ x10)',
          Baseline: Number((result.baselineCostInr / 10).toFixed(1)),
          Optimized: Number((result.estimatedCostInr / 10).toFixed(1)),
        },
        {
          metric: 'Emissions (kg CO₂e)',
          Baseline: result.baselineEmissionsKg,
          Optimized: result.estimatedEmissionsKg,
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Control Bar */}
      <div className="p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-sky-50">
            Smart Multi-Objective Logistics Optimizer
          </h3>
          <p className="text-xs text-slate-600 dark:text-sky-200/70 max-w-2xl">
            Select an optimization goal below and click Run Optimization to compute capacity-aware vehicle assignments, 2-opt tour ordering, travel times, and highlighted route paths.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-sky-900/70 p-1 bg-slate-50 dark:bg-[#061526]">
            {(
              [
                { id: 'emission', label: 'Min Emissions', icon: Leaf },
                { id: 'distance', label: 'Min Distance', icon: Route },
                { id: 'cost', label: 'Min Cost (₹)', icon: IndianRupee },
              ] as const
            ).map((opt) => {
              const Icon = opt.icon;
              const active = objective === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={running}
                  onClick={() => setObjective(opt.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap ${
                    active
                      ? 'bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 shadow-sm'
                      : 'text-slate-600 dark:text-sky-200/75 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {opt.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => void executeOptimization(objective, true, true)}
            disabled={running}
            className={`px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 hover:bg-sky-700 dark:hover:bg-sky-400 disabled:opacity-60 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:shadow-sky-600/20 ${
              objectivePendingRecalc ? 'ring-2 ring-sky-400/80 ring-offset-2 dark:ring-offset-[#0B223B]' : ''
            }`}
          >
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {running ? 'Optimizing...' : 'Run Optimization'}
          </button>

          {result && (
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="px-3 py-2 rounded-lg text-xs font-medium border border-slate-300 dark:border-sky-800 text-slate-700 dark:text-sky-100 hover:bg-slate-100 dark:hover:bg-sky-900/40 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
          )}

          {result && workspaceToken && (
            <button
              type="button"
              onClick={() => setDriveConfirmOpen(true)}
              className="px-3 py-2 rounded-lg text-xs font-medium border border-sky-600/50 text-sky-700 dark:text-sky-300 hover:bg-sky-500/10 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <CloudUpload className="w-3.5 h-3.5" />
              Save to Drive
            </button>
          )}
        </div>
      </div>

      {objectivePendingRecalc && !running && (
        <div className="px-4 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-3">
          <span>
            Objective switched to <strong>{OBJECTIVE_LABELS[objective]}</strong>. Click <strong>Run Optimization</strong> to calculate the new best route.
          </span>
          <button
            type="button"
            onClick={() => void executeOptimization(objective, true, true)}
            className="px-3 py-1 rounded-md bg-amber-600 text-white font-semibold hover:bg-amber-700 whitespace-nowrap cursor-pointer"
          >
            Run Now
          </button>
        </div>
      )}

      {lastRunNote && !error && !objectivePendingRecalc && (
        <div className="px-4 py-2.5 rounded-lg bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800/80 text-xs text-sky-900 dark:text-sky-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
          <span>{lastRunNote}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {driveSuccess && (
        <div className="p-3.5 rounded-lg bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 text-xs text-sky-800 dark:text-sky-200 flex items-center justify-between gap-2">
          <span>Saved {driveSuccess.name} to your Google Drive.</span>
          {driveSuccess.link && (
            <a
              href={driveSuccess.link}
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold"
            >
              Open in Drive
            </a>
          )}
        </div>
      )}

      {result && (
        <>
          {/* KPI Summary Strip with Active Objective Spotlight + Travel Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div
              className={`p-5 rounded-xl border bg-white dark:bg-[#0B223B] transition-all duration-200 hover:-translate-y-0.5 ${
                activeObjective === 'distance'
                  ? 'border-sky-500 ring-2 ring-sky-500/25 shadow-md shadow-sky-500/10'
                  : 'border-sky-200/80 dark:border-sky-900/60 hover:border-sky-400/80'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-500 dark:text-sky-200/75">
                  Optimized Distance
                </p>
                <span className="w-7 h-7 rounded-lg bg-sky-100 dark:bg-sky-900/60 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                  <Route className="w-3.5 h-3.5" />
                </span>
              </div>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50 mt-2">
                {result.totalDistanceKm.toLocaleString()} km
              </p>
              <p className="text-xs font-mono tabular-nums text-sky-700 dark:text-sky-400 mt-1">
                Saved {result.distanceSavedKm} km ({result.distanceSavedPct}%)
              </p>
            </div>

            <div
              className={`p-5 rounded-xl border bg-white dark:bg-[#0B223B] transition-all duration-200 hover:-translate-y-0.5 ${
                activeObjective === 'cost'
                  ? 'border-amber-500 ring-2 ring-amber-500/25 shadow-md shadow-amber-500/10'
                  : 'border-sky-200/80 dark:border-sky-900/60 hover:border-sky-400/80'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-500 dark:text-sky-200/75">
                  Estimated Dispatch Cost
                </p>
                <span className="w-7 h-7 rounded-lg bg-sky-100 dark:bg-sky-900/60 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                  <IndianRupee className="w-3.5 h-3.5" />
                </span>
              </div>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50 mt-2">
                ₹{result.estimatedCostInr.toLocaleString()}
              </p>
              <p className="text-xs font-mono tabular-nums text-sky-700 dark:text-sky-400 mt-1">
                Saved ₹{result.costSavedInr.toLocaleString()} ({result.costSavedPct}%)
              </p>
            </div>

            <div
              className={`p-5 rounded-xl border bg-white dark:bg-[#0B223B] transition-all duration-200 hover:-translate-y-0.5 ${
                activeObjective === 'emission'
                  ? 'border-emerald-500 ring-2 ring-emerald-500/25 shadow-md shadow-emerald-500/10'
                  : 'border-sky-200/80 dark:border-sky-900/60 hover:border-sky-400/80'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-500 dark:text-sky-200/75">
                  Transport Emissions
                </p>
                <span className="w-7 h-7 rounded-lg bg-sky-100 dark:bg-sky-900/60 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                  <Leaf className="w-3.5 h-3.5" />
                </span>
              </div>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50 mt-2">
                {result.estimatedEmissionsKg} kg CO₂e
              </p>
              <p className="text-xs font-mono tabular-nums text-sky-700 dark:text-sky-400 mt-1">
                Avoided {result.emissionsSavedKg} kg ({result.emissionsSavedPct}%)
              </p>
            </div>

            <div className="p-5 rounded-xl border border-sky-200/80 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-400/80">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-500 dark:text-sky-200/75">
                  Est. Travel Time
                </p>
                <span className="w-7 h-7 rounded-lg bg-sky-100 dark:bg-sky-900/60 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                  <Clock className="w-3.5 h-3.5" />
                </span>
              </div>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50 mt-2">
                {formatDuration(result.estimatedTravelMinutes)}
              </p>
              <p className="text-xs font-mono tabular-nums text-sky-700 dark:text-sky-400 mt-1">
                Saved {result.timeSavedMinutes} min ({result.timeSavedPct}%)
              </p>
            </div>

            <div className="p-5 rounded-xl border border-sky-200/80 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-400/80">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-500 dark:text-sky-200/75">
                  Batch Coverage
                </p>
                <span className="w-7 h-7 rounded-lg bg-sky-100 dark:bg-sky-900/60 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                  <Truck className="w-3.5 h-3.5" />
                </span>
              </div>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50 mt-2">
                {result.assignedCount} Assigned
              </p>
              <p className="text-xs font-mono tabular-nums text-slate-500 dark:text-sky-200/70 mt-1">
                {result.assignments.length} route{result.assignments.length === 1 ? '' : 's'} ·{' '}
                {result.unassignedCount} unassigned
              </p>
            </div>
          </div>

          {/* Interactive Highlighted Route Map */}
          {result.assignments.length > 0 && (
            <OptimizerRouteMap
              assignments={result.assignments}
              objective={result.objective}
              selectedRouteIndex={selectedRouteIndex}
              onSelectRouteIndex={setSelectedRouteIndex}
            />
          )}

          {/* Chart + Strategy Explanation */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B]">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50 mb-4">
                Baseline vs Optimized Dispatch Comparison
              </h4>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparisonData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(14, 165, 233, 0.16)" />
                    <XAxis dataKey="metric" tick={{ fontSize: 12, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#081C32',
                        borderColor: '#0369A1',
                        color: '#E0F2FE',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="Baseline" fill="#64748B" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Optimized" fill="#0EA5E9" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="lg:col-span-5 p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] flex flex-col justify-between gap-4">
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50">
                  Selected Objective Strategy
                </h4>
                <p className="text-sm text-slate-700 dark:text-sky-100/85 leading-relaxed">
                  {result.explanation}
                </p>
              </div>
              <div className="pt-3 border-t border-slate-200 dark:border-sky-900/50 space-y-1.5">
                <p className="text-xs font-semibold text-slate-600 dark:text-sky-300">
                  Methodology &amp; Transparent Assumptions
                </p>
                <p className="text-xs text-slate-500 dark:text-sky-200/70 leading-relaxed">
                  {result.assumptions}
                </p>
              </div>
            </div>
          </div>

          {/* Route Assignments */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50">
              Recommended Vehicle Routes ({result.assignments.length})
            </h4>
            {result.assignments.length === 0 ? (
              <div className="p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 text-sm text-slate-600 dark:text-sky-200/70">
                No eligible pending pickups are waiting for route dispatch right now. Submit a pickup request to simulate routing.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {result.assignments.map((a, idx) => {
                  const isHighlighted = idx === selectedRouteIndex;
                  return (
                    <div
                      key={`${a.vehicleId}-${idx}`}
                      onClick={() => setSelectedRouteIndex(idx)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedRouteIndex(idx);
                        }
                      }}
                      className={`p-5 rounded-xl border bg-white dark:bg-[#0B223B] space-y-4 transition-all duration-200 hover:-translate-y-0.5 cursor-pointer ${
                        isHighlighted
                          ? 'border-sky-500 ring-2 ring-sky-500/25 shadow-[0_14px_30px_-16px_rgba(14,165,233,0.3)]'
                          : 'border-sky-200/80 dark:border-sky-900/60 hover:border-sky-400/80 dark:hover:border-sky-600/80'
                      }`}
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="w-9 h-9 rounded-lg bg-sky-100 dark:bg-sky-900/60 border border-sky-200/80 dark:border-sky-800/70 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                              <Truck className="w-4 h-4" />
                            </span>
                            <div>
                              <h5 className="text-sm font-semibold text-slate-900 dark:text-sky-50">
                                {a.registrationNo} · {a.vehicleType}
                              </h5>
                              <p className="text-xs text-slate-500 dark:text-sky-200/65">
                                Driver: {a.driverName} · Fuel: {a.fuelType} · Drop-off: {a.facilityName}
                              </p>
                            </div>
                          </div>
                          <span className="text-xs font-mono tabular-nums font-semibold text-sky-700 dark:text-sky-400 shrink-0">
                            {a.utilizationPct}% load
                          </span>
                        </div>

                        {/* Capacity Utilization Bar */}
                        <div className="h-1.5 w-full rounded-full bg-sky-100 dark:bg-[#061526] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.max(4, a.utilizationPct))}%` }}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 py-2.5 border-y border-slate-100 dark:border-sky-900/50 text-xs font-mono tabular-nums">
                        <div>
                          <span className="block text-[11px] font-sans text-slate-500 dark:text-sky-200/60">
                            Payload
                          </span>
                          <span className="text-slate-900 dark:text-sky-50 font-semibold">
                            {a.totalWeightKg} / {a.capacityKg} kg
                          </span>
                        </div>
                        <div>
                          <span className="block text-[11px] font-sans text-slate-500 dark:text-sky-200/60">
                            Distance
                          </span>
                          <span className="text-slate-900 dark:text-sky-50 font-semibold">
                            {a.routeDistanceKm} km
                          </span>
                        </div>
                        <div>
                          <span className="block text-[11px] font-sans text-slate-500 dark:text-sky-200/60">
                            Travel Time
                          </span>
                          <span className="text-slate-900 dark:text-sky-50 font-semibold">
                            {formatDuration(a.estimatedTravelMinutes)}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[11px] font-sans text-slate-500 dark:text-sky-200/60">
                            Cost / CO₂e
                          </span>
                          <span className="text-slate-900 dark:text-sky-50 font-semibold">
                            ₹{a.estimatedCostInr} · {a.estimatedEmissionsKg} kg
                          </span>
                        </div>
                      </div>

                      {/* Visual Stop Timeline */}
                      <ol className="relative pl-5 space-y-2.5 text-xs before:content-[''] before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-sky-200 dark:before:bg-sky-800/80">
                        {a.stops.map((stop, sIdx) => {
                          const dotColor =
                            stop.type === 'depot'
                              ? 'bg-slate-400 dark:bg-sky-400/60'
                              : stop.type === 'facility'
                                ? 'bg-cyan-500 dark:bg-cyan-400'
                                : 'bg-sky-600 dark:bg-sky-400';
                          return (
                            <li
                              key={sIdx}
                              className="relative flex items-start justify-between gap-2 text-slate-700 dark:text-sky-100/85"
                            >
                              <span
                                aria-hidden="true"
                                className={`absolute -left-5 top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-[#0B223B] ${dotColor}`}
                              />
                              <span className="leading-snug">
                                <span className="font-mono font-semibold uppercase text-[10px] text-sky-700 dark:text-sky-300 mr-1.5">
                                  {stop.type}
                                </span>
                                {stop.label}
                                {stop.weightKg ? ` (${stop.weightKg} kg)` : ''}
                              </span>
                              {stop.legDistanceKm > 0 && (
                                <span className="font-mono tabular-nums text-slate-500 dark:text-sky-200/65 whitespace-nowrap">
                                  +{stop.legDistanceKm} km · {stop.legMinutes}m
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Unassigned Requests */}
          {result.unassigned.length > 0 && (
            <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-800/60 bg-amber-50/70 dark:bg-amber-950/30 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
                <AlertCircle className="w-4 h-4" />
                Unassigned Requests ({result.unassigned.length})
              </div>
              <ul className="space-y-1 text-xs text-amber-900 dark:text-amber-200/85">
                {result.unassigned.map((u) => (
                  <li key={u.requestId}>
                    <span className="font-mono font-semibold">{u.requestCode}</span> ({u.deviceName}
                    ): {u.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Optimization History Table (Authenticated Dashboard) */}
      {!compact && isAuthenticated && history.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-sky-900/60">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50">
              Saved Optimization Run History
            </h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-[#061526] text-slate-500 dark:text-sky-200/70">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Run Code</th>
                  <th className="px-4 py-2.5 font-medium">Objective</th>
                  <th className="px-4 py-2.5 font-medium">Distance</th>
                  <th className="px-4 py-2.5 font-medium">Cost (INR)</th>
                  <th className="px-4 py-2.5 font-medium">Emissions</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  {canApprove && <th className="px-4 py-2.5 font-medium text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-sky-900/50">
                {history.slice(0, 8).map((row) => (
                  <tr
                    key={row.id}
                    className="text-slate-700 dark:text-sky-100/90 hover:bg-sky-50/50 dark:hover:bg-sky-900/25 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-mono font-medium">{row.runCode}</td>
                    <td className="px-4 py-2.5 capitalize">{row.objective}</td>
                    <td className="px-4 py-2.5 font-mono tabular-nums">{row.totalDistanceKm} km</td>
                    <td className="px-4 py-2.5 font-mono tabular-nums">₹{row.estimatedCostInr}</td>
                    <td className="px-4 py-2.5 font-mono tabular-nums">
                      {row.estimatedEmissionsKg} kg
                    </td>
                    <td className="px-4 py-2.5">
                      {row.approved ? (
                        <span className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-400 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Approved
                        </span>
                      ) : (
                        <span className="text-slate-500 dark:text-sky-200/65">Draft Plan</span>
                      )}
                    </td>
                    {canApprove && (
                      <td className="px-4 py-2.5 text-right">
                        {!row.approved && (
                          <button
                            type="button"
                            disabled={approvingId === row.id}
                            onClick={() => void handleApproveRun(row.id)}
                            className="px-2.5 py-1 rounded text-xs font-medium bg-sky-600/15 text-sky-700 dark:text-sky-300 hover:bg-sky-600/25 cursor-pointer"
                          >
                            {approvingId === row.id ? 'Approving...' : 'Approve Plan'}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={driveConfirmOpen}
        title="Save Optimization Report to Google Drive"
        description={`This will upload "RebootEarth_Optimization_${objective}.csv" to your connected Google Drive account. Do you want to proceed?`}
        confirmLabel="Upload to Google Drive"
        busy={driveBusy}
        onConfirm={() => void handleUploadToDrive()}
        onCancel={() => setDriveConfirmOpen(false)}
      />
    </div>
  );
};
