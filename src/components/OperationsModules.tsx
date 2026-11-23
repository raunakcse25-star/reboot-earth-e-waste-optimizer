import React, { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CheckCircle2,
  Download,
  Package,
  Plus,
  Printer,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  saveInventoryBatchToFirestore,
  subscribeUserInventoryBatches,
} from '../lib/firebase';
import {
  EWASTE_CATEGORIES,
  ROLE_LABELS,
  type AnalyticsSummary,
  type DbUser,
  type Facility,
  type FirestoreInventoryBatch,
  type InventoryBatch,
  type UserRole,
  type Vehicle,
} from '../types';

const PIE_COLORS = ['#0EA5E9', '#0EA5E9', '#F59E0B', '#A855F7', '#64748B'];

/* -------------------- Inventory & Material Processing -------------------- */
export const InventoryModule: React.FC<{
  facilities: Facility[];
  onDataChanged?: () => void;
}> = ({ facilities, onDataChanged }) => {
  const { authReady, firebaseUser, dbUser } = useAuth();
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [firestoreBatches, setFirestoreBatches] = useState<FirestoreInventoryBatch[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [facilityId, setFacilityId] = useState(facilities[0]?.id || 1);
  const [category, setCategory] = useState<string>(EWASTE_CATEGORIES[0]);
  const [deviceSummary, setDeviceSummary] = useState('');
  const [quantity, setQuantity] = useState(10);
  const [weightKg, setWeightKg] = useState(45);
  const [storageZone, setStorageZone] = useState('Bay A-2');
  const [processingStage, setProcessingStage] = useState('Dismantling');
  const [recoveredCopperKg, setRecoveredCopperKg] = useState(4.2);
  const [recoveredAluminumKg, setRecoveredAluminumKg] = useState(8.5);
  const [recoveredPlasticsKg, setRecoveredPlasticsKg] = useState(18);
  const [recoveredPreciousGrams, setRecoveredPreciousGrams] = useState(3.2);
  const [reusableUnits, setReusableUnits] = useState(2);
  const [residueKg, setResidueKg] = useState(2.8);

  const canCreate = Boolean(
    dbUser && ['collection_centre', 'recycler', 'refurbisher', 'admin'].includes(dbUser.role)
  );

  const loadBatches = useCallback(async () => {
    try {
      const rows = await apiFetch<InventoryBatch[]>('/api/inventory');
      setBatches(rows);
    } catch (err: any) {
      setError(err?.message || 'Unable to load inventory records.');
    }
  }, []);

  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);

  useEffect(() => {
    if (!authReady || !firebaseUser) {
      setFirestoreBatches([]);
      return;
    }
    let unsub: (() => void) | undefined;
    try {
      unsub = subscribeUserInventoryBatches(firebaseUser.uid, (items) => {
        setFirestoreBatches(items);
      });
    } catch (err) {
      console.error('Inventory batch Firestore listener failed:', err);
    }
    return () => unsub?.();
  }, [authReady, firebaseUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const computedStatus = processingStage === 'Recycled' ? 'Completed' : 'In Processing';
    try {
      const created = await apiFetch<InventoryBatch>('/api/inventory', {
        method: 'POST',
        body: JSON.stringify({
          facilityId,
          category,
          deviceSummary,
          quantity,
          weightKg,
          storageZone,
          status: computedStatus,
          processingStage,
          recoveredCopperKg,
          recoveredAluminumKg,
          recoveredPlasticsKg,
          recoveredPreciousGrams,
          reusableUnits,
          residueKg,
        }),
      });
      if (firebaseUser && firebaseUser.emailVerified) {
        void saveInventoryBatchToFirestore(firebaseUser.uid, {
          batchCode: created?.batchCode,
          facilityId,
          category,
          deviceSummary,
          quantity,
          weightKg,
          storageZone,
          status: computedStatus,
          processingStage,
          recoveredCopperKg,
          recoveredAluminumKg,
          recoveredPlasticsKg,
          recoveredPreciousGrams,
          reusableUnits,
          residueKg,
        }).catch((fsErr) => {
          console.warn('Could not persist inventory batch to Firestore:', fsErr);
        });
      }
      setShowForm(false);
      setDeviceSummary('');
      await loadBatches();
      onDataChanged?.();
    } catch (err: any) {
      setError(err?.message || 'Failed to record batch.');
    }
  };

  const mergedBatches: Array<{
    key: string;
    batchCode: string;
    storageZone: string;
    deviceSummary: string;
    category: string;
    processingStage: string;
    weightKg: number;
    recoveredCopperKg: number;
    recoveredAluminumKg: number;
    recoveredPlasticsKg: number;
    recoveredPreciousGrams: number;
    reusableUnits: number;
    residueKg: number;
  }> = (() => {
    const seen = new Set<string>();
    const list: Array<{
      key: string;
      batchCode: string;
      storageZone: string;
      deviceSummary: string;
      category: string;
      processingStage: string;
      weightKg: number;
      recoveredCopperKg: number;
      recoveredAluminumKg: number;
      recoveredPlasticsKg: number;
      recoveredPreciousGrams: number;
      reusableUnits: number;
      residueKg: number;
    }> = [];
    for (const b of batches) {
      seen.add(b.batchCode);
      list.push({
        key: `srv_${b.id}`,
        batchCode: b.batchCode,
        storageZone: b.storageZone,
        deviceSummary: b.deviceSummary,
        category: b.category,
        processingStage: b.processingStage,
        weightKg: b.weightKg,
        recoveredCopperKg: b.recoveredCopperKg,
        recoveredAluminumKg: b.recoveredAluminumKg,
        recoveredPlasticsKg: b.recoveredPlasticsKg,
        recoveredPreciousGrams: b.recoveredPreciousGrams,
        reusableUnits: b.reusableUnits,
        residueKg: b.residueKg,
      });
    }
    for (const fb of firestoreBatches) {
      if (seen.has(fb.batchCode)) continue;
      seen.add(fb.batchCode);
      list.push({
        key: `fs_${fb.id}`,
        batchCode: fb.batchCode,
        storageZone: fb.storageZone,
        deviceSummary: fb.deviceSummary,
        category: fb.category,
        processingStage: fb.processingStage,
        weightKg: fb.weightKg,
        recoveredCopperKg: fb.recoveredCopperKg,
        recoveredAluminumKg: fb.recoveredAluminumKg,
        recoveredPlasticsKg: fb.recoveredPlasticsKg,
        recoveredPreciousGrams: fb.recoveredPreciousGrams,
        reusableUnits: fb.reusableUnits,
        residueKg: fb.residueKg,
      });
    }
    return list;
  })();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-sky-50">
            Facility Inventory &amp; Material Recovery
          </h3>
          <p className="text-xs text-slate-600 dark:text-sky-200/70">
            Track dismantling batches, recovered copper, aluminum, plastics, precious metals, and refurbished units.
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 inline-flex items-center gap-1.5 self-start"
          >
            <Plus className="w-4 h-4" />
            {showForm ? 'Close Form' : 'Log Processing Batch'}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          <div>
            <label className="block text-xs text-slate-600 dark:text-sky-200/75 mb-1">Facility</label>
            <select
              value={facilityId}
              onChange={(e) => setFacilityId(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
            >
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-600 dark:text-sky-200/75 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
            >
              {EWASTE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-600 dark:text-sky-200/75 mb-1">Processing Stage</label>
            <select
              value={processingStage}
              onChange={(e) => setProcessingStage(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
            >
              <option>Inspection</option>
              <option>Dismantling</option>
              <option>Refurbishment</option>
              <option>Material Recovery</option>
              <option>Recycled</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-slate-600 dark:text-sky-200/75 mb-1">Batch Summary *</label>
            <input
              type="text"
              required
              value={deviceSummary}
              onChange={(e) => setDeviceSummary(e.target.value)}
              placeholder="e.g., 14 Decommissioned Blade Servers + Power Supplies"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600 dark:text-sky-200/75 mb-1">Storage Zone</label>
            <input
              type="text"
              value={storageZone}
              onChange={(e) => setStorageZone(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600 dark:text-sky-200/75 mb-1">Total Weight (kg)</label>
            <input
              type="number"
              step="0.1"
              value={weightKg}
              onChange={(e) => setWeightKg(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600 dark:text-sky-200/75 mb-1">Units / Reusable Units</label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                placeholder="Qty"
                className="px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
              />
              <input
                type="number"
                value={reusableUnits}
                onChange={(e) => setReusableUnits(Number(e.target.value))}
                placeholder="Reusable"
                className="px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-600 dark:text-sky-200/75 mb-1">
              Copper / Al / Plastics (kg)
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              <input
                type="number"
                step="0.1"
                value={recoveredCopperKg}
                onChange={(e) => setRecoveredCopperKg(Number(e.target.value))}
                className="px-2 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
              />
              <input
                type="number"
                step="0.1"
                value={recoveredAluminumKg}
                onChange={(e) => setRecoveredAluminumKg(Number(e.target.value))}
                className="px-2 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
              />
              <input
                type="number"
                step="0.1"
                value={recoveredPlasticsKg}
                onChange={(e) => setRecoveredPlasticsKg(Number(e.target.value))}
                className="px-2 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-600 dark:text-sky-200/75 mb-1">
              Precious Metals (g) / Residue (kg)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                step="0.1"
                value={recoveredPreciousGrams}
                onChange={(e) => setRecoveredPreciousGrams(Number(e.target.value))}
                className="px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
              />
              <input
                type="number"
                step="0.1"
                value={residueKg}
                onChange={(e) => setResidueKg(Number(e.target.value))}
                className="px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
              />
            </div>
          </div>
          <div className="md:col-span-2 flex items-end justify-end">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950"
            >
              Save Inventory Batch
            </button>
          </div>
        </form>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-[#061526] text-slate-500 dark:text-sky-200/70">
            <tr>
              <th className="px-4 py-3 font-medium">Batch</th>
              <th className="px-4 py-3 font-medium">Summary &amp; Category</th>
              <th className="px-4 py-3 font-medium">Stage</th>
              <th className="px-4 py-3 font-medium">Input Mass</th>
              <th className="px-4 py-3 font-medium">Recovered Metals / Plastics</th>
              <th className="px-4 py-3 font-medium">Refurbished</th>
              <th className="px-4 py-3 font-medium">Residue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-sky-900/50">
            {mergedBatches.map((b) => (
              <tr key={b.key} className="text-slate-700 dark:text-sky-100/90">
                <td className="px-4 py-3 font-mono font-semibold text-sky-700 dark:text-sky-400">
                  {b.batchCode}
                  <span className="block text-[10px] font-sans font-normal text-slate-500 dark:text-sky-200/60">
                    {b.storageZone}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900 dark:text-sky-50">{b.deviceSummary}</p>
                  <p className="text-[11px] text-slate-500 dark:text-sky-200/65">{b.category}</p>
                </td>
                <td className="px-4 py-3">{b.processingStage}</td>
                <td className="px-4 py-3 font-mono tabular-nums">{b.weightKg} kg</td>
                <td className="px-4 py-3 font-mono tabular-nums">
                  Cu {b.recoveredCopperKg}kg · Al {b.recoveredAluminumKg}kg · Pl {b.recoveredPlasticsKg}kg · Au/Ag {b.recoveredPreciousGrams}g
                </td>
                <td className="px-4 py-3 font-mono tabular-nums">{b.reusableUnits} units</td>
                <td className="px-4 py-3 font-mono tabular-nums">{b.residueKg} kg</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* -------------------- Fleet & Transportation -------------------- */
export const FleetModule: React.FC<{
  vehicles: Vehicle[];
  onRefresh: () => void;
}> = ({ vehicles, onRefresh }) => {
  const { dbUser } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [registrationNo, setRegistrationNo] = useState('');
  const [vehicleType, setVehicleType] = useState('Electric Cargo Van');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [capacityKg, setCapacityKg] = useState(800);
  const [fuelType, setFuelType] = useState('Electric');
  const [error, setError] = useState<string | null>(null);

  const canManage = Boolean(
    dbUser && ['transporter', 'collection_centre', 'admin'].includes(dbUser.role)
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const emissionFactorKgPerKm = fuelType === 'Electric' ? 0.08 : fuelType === 'CNG' ? 0.16 : 0.29;
    const costPerKmInr = fuelType === 'Electric' ? 15 : fuelType === 'CNG' ? 21 : 29;
    try {
      await apiFetch('/api/vehicles', {
        method: 'POST',
        body: JSON.stringify({
          registrationNo,
          vehicleType,
          driverName,
          driverPhone,
          capacityKg,
          fuelType,
          emissionFactorKgPerKm,
          costPerKmInr,
        }),
      });
      setShowAdd(false);
      setRegistrationNo('');
      setDriverName('');
      setDriverPhone('');
      onRefresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to register vehicle.');
    }
  };

  const handleStatusChange = async (id: number, status: string) => {
    try {
      await apiFetch(`/api/vehicles/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      onRefresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to update status.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-sky-50">
            Fleet &amp; Transport Capacity
          </h3>
          <p className="text-xs text-slate-600 dark:text-sky-200/70">
            Vehicles feed directly into the Smart Logistics Optimizer. Live GPS telematics is shown only when external vehicle hardware is connected.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 inline-flex items-center gap-1.5 self-start"
          >
            <Plus className="w-4 h-4" />
            {showAdd ? 'Close' : 'Register Vehicle'}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {showAdd && (
        <form
          onSubmit={handleCreate}
          className="p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          <input
            type="text"
            required
            value={registrationNo}
            onChange={(e) => setRegistrationNo(e.target.value)}
            placeholder="Reg No. (e.g., DL-01-EV-9021)"
            className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
          />
          <input
            type="text"
            required
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value)}
            placeholder="Vehicle Type"
            className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
          />
          <select
            value={fuelType}
            onChange={(e) => setFuelType(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
          >
            <option value="Electric">Electric (0.08 kg CO₂e/km)</option>
            <option value="CNG">CNG (0.16 kg CO₂e/km)</option>
            <option value="Diesel">Diesel (0.29 kg CO₂e/km)</option>
          </select>
          <input
            type="text"
            required
            value={driverName}
            onChange={(e) => setDriverName(e.target.value)}
            placeholder="Driver Full Name"
            className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
          />
          <input
            type="tel"
            required
            value={driverPhone}
            onChange={(e) => setDriverPhone(e.target.value)}
            placeholder="Driver Phone"
            className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
          />
          <div className="flex gap-2">
            <input
              type="number"
              min={50}
              value={capacityKg}
              onChange={(e) => setCapacityKg(Number(e.target.value))}
              placeholder="Capacity kg"
              className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950"
            >
              Add
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {vehicles.map((v) => (
          <div
            key={v.id}
            className="p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <h4 className="font-mono text-sm font-semibold text-slate-900 dark:text-sky-50">
                  {v.registrationNo}
                </h4>
              </div>
              <span className="text-xs font-medium text-sky-700 dark:text-sky-400">
                {v.status}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-sky-200/75">
              {v.vehicleType} · {v.fuelType}
            </p>
            <p className="text-xs text-slate-500 dark:text-sky-200/65">
              Driver: {v.driverName} ({v.driverPhone})
            </p>
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-sky-900/50 text-xs font-mono tabular-nums">
              <div>
                <span className="block text-[10px] font-sans text-slate-500 dark:text-sky-200/60">Capacity</span>
                {v.capacityKg} kg
              </div>
              <div>
                <span className="block text-[10px] font-sans text-slate-500 dark:text-sky-200/60">Cost/km</span>
                ₹{v.costPerKmInr}
              </div>
              <div>
                <span className="block text-[10px] font-sans text-slate-500 dark:text-sky-200/60">CO₂e/km</span>
                {v.emissionFactorKgPerKm} kg
              </div>
            </div>
            {canManage && (
              <div className="flex gap-1.5 pt-1">
                {(['Available', 'On Route', 'Maintenance'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => void handleStatusChange(v.id, st)}
                    className={`flex-1 py-1.5 rounded text-[11px] font-medium border ${
                      v.status === st
                        ? 'border-sky-500 bg-sky-500/15 text-sky-700 dark:text-sky-300'
                        : 'border-slate-200 dark:border-sky-900 text-slate-500 dark:text-sky-200/65'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

/* -------------------- Environmental Analytics -------------------- */
export const EnvironmentalAnalyticsModule: React.FC<{ analytics: AnalyticsSummary | null }> = ({
  analytics,
}) => {
  if (!analytics) {
    return (
      <div className="p-8 text-center text-sm text-slate-500 dark:text-sky-200/70">
        Computing environmental analytics from platform records...
      </div>
    );
  }

  const recoveryPie = [
    { name: 'Plastics (kg)', value: analytics.recoveredPlasticsKg },
    { name: 'Aluminum (kg)', value: analytics.recoveredAluminumKg },
    { name: 'Copper (kg)', value: analytics.recoveredCopperKg },
    { name: 'Residue (kg)', value: analytics.totalResidueKg },
  ].filter((d) => d.value > 0);

  const exportCsv = () => {
    const lines = [
      'Metric,Value',
      `Total Collected (kg),${analytics.totalCollectedKg}`,
      `Total Processed (kg),${analytics.totalProcessedKg}`,
      `Landfill Diversion (%),${analytics.landfillDiversionPct}`,
      `Estimated CO2e Avoided (kg),${analytics.estimatedCo2AvoidedKg}`,
      `Recovered Copper (kg),${analytics.recoveredCopperKg}`,
      `Recovered Aluminum (kg),${analytics.recoveredAluminumKg}`,
      `Recovered Plastics (kg),${analytics.recoveredPlasticsKg}`,
      `Recovered Precious Metals (g),${analytics.recoveredPreciousGrams}`,
      `Reusable Devices Refurbished,${analytics.reusableDevices}`,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reboot-earth-esg-impact-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-sky-50">
            Environmental Impact &amp; ESG Analytics
          </h3>
          <p className="text-xs text-slate-600 dark:text-sky-200/70">
            All metrics are aggregated directly from recorded collection requests, dismantling batches, and optimization runs.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-300 dark:border-sky-800 text-slate-700 dark:text-sky-100 inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 inline-flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Report
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B]">
          <p className="text-xs text-slate-500 dark:text-sky-200/70">Total E-Waste Tracked</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50 mt-1">
            {analytics.totalCollectedKg.toLocaleString()} kg
          </p>
          <p className="text-xs text-slate-500 dark:text-sky-200/65 mt-1">
            {analytics.totalPickups} collection requests
          </p>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B]">
          <p className="text-xs text-slate-500 dark:text-sky-200/70">Estimated CO₂e Avoided</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-sky-700 dark:text-sky-400 mt-1">
            {analytics.estimatedCo2AvoidedKg.toLocaleString()} kg
          </p>
          <p className="text-xs text-slate-500 dark:text-sky-200/65 mt-1">
            +{analytics.transportEmissionsSavedKg} kg from route batching
          </p>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B]">
          <p className="text-xs text-slate-500 dark:text-sky-200/70">Landfill Diversion Rate</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50 mt-1">
            {analytics.landfillDiversionPct}%
          </p>
          <p className="text-xs text-slate-500 dark:text-sky-200/65 mt-1">
            {analytics.totalProcessedKg.toLocaleString()} kg processed in batches
          </p>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B]">
          <p className="text-xs text-slate-500 dark:text-sky-200/70">Refurbished &amp; Precious Metals</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50 mt-1">
            {analytics.reusableDevices} units
          </p>
          <p className="text-xs font-mono text-sky-700 dark:text-sky-400 mt-1">
            {analytics.recoveredPreciousGrams} g Au/Ag/Pd recovered
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B]">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50 mb-4">
            Collected Weight by E-Waste Category (kg)
          </h4>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.byCategory} margin={{ top: 8, right: 16, left: 0, bottom: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(16, 185, 129, 0.15)" />
                <XAxis dataKey="category" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#081C32',
                    borderColor: '#0369A1',
                    color: '#E0F2FE',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="weightKg" fill="#0EA5E9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B]">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50 mb-4">
            Material Recovery Breakdown (kg)
          </h4>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={recoveryPie}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={82}
                  label={({ name, value }) => `${String(name ?? '').split(' ')[0]}: ${value}kg`}
                >
                  {recoveryPie.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="p-4 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-slate-50 dark:bg-[#061526] text-xs text-slate-600 dark:text-sky-200/75 leading-relaxed">
        <strong className="text-slate-900 dark:text-sky-100">Calculation Methodology: </strong>
        {analytics.calculationMethodology}
      </div>
    </div>
  );
};

/* -------------------- Admin Governance Module -------------------- */
export const AdminGovernanceModule: React.FC<{
  facilities: Facility[];
  onFacilitiesChanged: () => void;
}> = ({ facilities, onFacilitiesChanged }) => {
  const [users, setUsers] = useState<DbUser[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAdmin = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ users: DbUser[]; tickets: any[]; auditLogs: any[] }>(
        '/api/admin/overview'
      );
      setUsers(res.users);
      setTickets(res.tickets);
      setAuditLogs(res.auditLogs);
    } catch (err: any) {
      setError(err?.message || 'Admin access required.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAdmin();
  }, [loadAdmin]);

  const handleRoleUpdate = async (uid: string, role: UserRole) => {
    try {
      await apiFetch(`/api/admin/users/${uid}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role, approved: true }),
      });
      await loadAdmin();
    } catch (err: any) {
      setError(err?.message || 'Failed to assign role.');
    }
  };

  const handleToggleFacilityVerify = async (facility: Facility) => {
    try {
      await apiFetch(`/api/facilities/${facility.id}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({ verified: !facility.verified }),
      });
      onFacilitiesChanged();
      await loadAdmin();
    } catch (err: any) {
      setError(err?.message || 'Failed to update facility verification.');
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500 dark:text-sky-200/70">Loading governance records...</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-sky-50 inline-flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-sky-500" />
          Platform Governance &amp; Audit Controls
        </h3>
        <p className="text-xs text-slate-600 dark:text-sky-200/70">
          Approve privileged role applications, verify recycling facilities, review support tickets, and inspect immutable audit logs.
        </p>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {/* Users & Role Approval */}
      <div className="rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-sky-900/60">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50">
            Accounts &amp; Role-Based Access Control ({users.length})
          </h4>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-[#061526] text-slate-500 dark:text-sky-200/70">
            <tr>
              <th className="px-4 py-2.5 font-medium">User</th>
              <th className="px-4 py-2.5 font-medium">Current Role</th>
              <th className="px-4 py-2.5 font-medium">Requested Upgrade</th>
              <th className="px-4 py-2.5 font-medium text-right">Assign Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-sky-900/50">
            {users.map((u) => (
              <tr key={u.uid} className="text-slate-700 dark:text-sky-100/90">
                <td className="px-4 py-2.5">
                  <p className="font-medium text-slate-900 dark:text-sky-50">{u.fullName}</p>
                  <p className="text-[11px] text-slate-500 dark:text-sky-200/65">{u.email}</p>
                </td>
                <td className="px-4 py-2.5">{ROLE_LABELS[u.role]}</td>
                <td className="px-4 py-2.5 text-amber-700 dark:text-amber-300">
                  {u.requestedRole ? ROLE_LABELS[u.requestedRole as UserRole] || u.requestedRole : '—'}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <select
                    value={u.role}
                    onChange={(e) => void handleRoleUpdate(u.uid, e.target.value as UserRole)}
                    className="px-2.5 py-1 text-xs rounded border border-slate-300 dark:border-sky-800 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
                  >
                    {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Facility Verification */}
      <div className="rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-sky-900/60">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50">
            Facility Verification Registry ({facilities.length})
          </h4>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-[#061526] text-slate-500 dark:text-sky-200/70">
            <tr>
              <th className="px-4 py-2.5 font-medium">Facility</th>
              <th className="px-4 py-2.5 font-medium">City</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-sky-900/50">
            {facilities.map((f) => (
              <tr key={f.id} className="text-slate-700 dark:text-sky-100/90">
                <td className="px-4 py-2.5 font-medium">{f.name}</td>
                <td className="px-4 py-2.5">{f.city}, {f.state}</td>
                <td className="px-4 py-2.5">
                  {f.verified ? (
                    <span className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                    </span>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-300">Pending</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => void handleToggleFacilityVerify(f)}
                    className="px-3 py-1 rounded text-xs font-medium border border-slate-300 dark:border-sky-800 hover:bg-sky-500/10"
                  >
                    {f.verified ? 'Revoke' : 'Approve & Verify'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Audit Logs & Support Tickets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-3">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50">
            Recent Support Inquiries ({tickets.length})
          </h4>
          {tickets.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-sky-200/65">No support tickets logged yet.</p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-sky-900/50 max-h-64 overflow-y-auto">
              {tickets.map((t) => (
                <div key={t.id} className="py-2.5 space-y-1 text-xs">
                  <p className="font-semibold text-slate-900 dark:text-sky-50">{t.subject}</p>
                  <p className="text-[11px] text-slate-500 dark:text-sky-200/65">
                    {t.name} ({t.email}) · {t.category}
                  </p>
                  <p className="text-slate-600 dark:text-sky-100/80">{t.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-3">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50 inline-flex items-center gap-1.5">
            <Package className="w-4 h-4 text-sky-500" />
            Immutable Audit Trail ({auditLogs.length})
          </h4>
          {auditLogs.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-sky-200/65">No audit events recorded yet.</p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-sky-900/50 max-h-64 overflow-y-auto">
              {auditLogs.slice(0, 15).map((log) => (
                <div key={log.id} className="py-2 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="font-mono font-semibold text-sky-700 dark:text-sky-400">
                      {log.action}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-sky-200/60">
                      {log.actorEmail}
                    </span>
                  </div>
                  <p className="text-slate-600 dark:text-sky-100/80 mt-0.5">{log.details}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
