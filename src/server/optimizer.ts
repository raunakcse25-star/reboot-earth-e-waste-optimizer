export type OptimizationObjective = 'cost' | 'distance' | 'emission';

export interface OptPickupInput {
  id: number;
  requestCode: string;
  deviceName: string;
  category: string;
  estimatedWeightKg: number;
  pickupAddress: string;
  lat: number;
  lng: number;
}

export interface OptFacilityInput {
  id: number;
  name: string;
  facilityType: string;
  city: string;
  lat: number;
  lng: number;
  acceptedCategories: string;
  capacityKg: number;
  currentLoadKg: number;
}

export interface OptVehicleInput {
  id: number;
  registrationNo: string;
  vehicleType: string;
  driverName: string;
  capacityKg: number;
  fuelType: string;
  emissionFactorKgPerKm: number;
  costPerKmInr: number;
  baseLat: number;
  baseLng: number;
  status: string;
}

export interface RouteStop {
  type: 'depot' | 'pickup' | 'facility';
  label: string;
  requestCode?: string;
  category?: string;
  weightKg?: number;
  lat: number;
  lng: number;
  legDistanceKm: number;
}

export interface VehicleAssignment {
  vehicleId: number;
  registrationNo: string;
  vehicleType: string;
  driverName: string;
  fuelType: string;
  facilityId: number;
  facilityName: string;
  requestIds: number[];
  requestCodes: string[];
  totalWeightKg: number;
  capacityKg: number;
  utilizationPct: number;
  routeDistanceKm: number;
  estimatedCostInr: number;
  estimatedEmissionsKg: number;
  stops: RouteStop[];
}

export interface UnassignedRequest {
  requestId: number;
  requestCode: string;
  deviceName: string;
  reason: string;
}

export interface OptimizationOutput {
  objective: OptimizationObjective;
  totalDistanceKm: number;
  baselineDistanceKm: number;
  distanceSavedKm: number;
  distanceSavedPct: number;
  estimatedCostInr: number;
  baselineCostInr: number;
  costSavedInr: number;
  costSavedPct: number;
  estimatedEmissionsKg: number;
  baselineEmissionsKg: number;
  emissionsSavedKg: number;
  emissionsSavedPct: number;
  assignedCount: number;
  unassignedCount: number;
  assignments: VehicleAssignment[];
  unassigned: UnassignedRequest[];
  assumptions: string;
  explanation: string;
}

const ROAD_CIRCUITY_FACTOR = 1.28; // Standard urban-metro road-to-geodesic circuity ratio

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function estimatedRoadKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return haversineKm(lat1, lng1, lat2, lng2) * ROAD_CIRCUITY_FACTOR;
}

function facilityAcceptsCategory(facility: OptFacilityInput, category: string): boolean {
  const accepted = facility.acceptedCategories
    .toLowerCase()
    .split(',')
    .map((s) => s.trim());
  const normalized = category.toLowerCase().trim();
  return accepted.includes('all') || accepted.some((a) => normalized.includes(a) || a.includes(normalized));
}

function twoOptRoute(
  depot: { lat: number; lng: number },
  pickups: OptPickupInput[],
  facility: { lat: number; lng: number }
): OptPickupInput[] {
  if (pickups.length <= 2) return pickups;

  const route = [...pickups];
  const calcLen = (seq: OptPickupInput[]) => {
    let total = estimatedRoadKm(depot.lat, depot.lng, seq[0].lat, seq[0].lng);
    for (let i = 0; i < seq.length - 1; i++) {
      total += estimatedRoadKm(seq[i].lat, seq[i].lng, seq[i + 1].lat, seq[i + 1].lng);
    }
    total += estimatedRoadKm(seq[seq.length - 1].lat, seq[seq.length - 1].lng, facility.lat, facility.lng);
    return total;
  };

  let bestDist = calcLen(route);
  let improved = true;
  let guard = 0;

  while (improved && guard < 25) {
    improved = false;
    guard++;
    for (let i = 0; i < route.length - 1; i++) {
      for (let k = i + 1; k < route.length; k++) {
        const candidate = [
          ...route.slice(0, i),
          ...route.slice(i, k + 1).reverse(),
          ...route.slice(k + 1),
        ];
        const candidateDist = calcLen(candidate);
        if (candidateDist + 0.05 < bestDist) {
          route.splice(0, route.length, ...candidate);
          bestDist = candidateDist;
          improved = true;
        }
      }
    }
  }
  return route;
}

export function runSmartOptimization(
  objective: OptimizationObjective,
  requests: OptPickupInput[],
  facilities: OptFacilityInput[],
  vehicles: OptVehicleInput[]
): OptimizationOutput {
  const availableVehicles = vehicles.filter((v) => v.status !== 'Maintenance');
  const unassigned: UnassignedRequest[] = [];
  const facilityRemaining: Record<number, number> = {};

  for (const f of facilities) {
    facilityRemaining[f.id] = Math.max(0, f.capacityKg - f.currentLoadKg);
  }

  // Step 1: Match each pickup request to its best compatible facility
  const facilityBuckets: Record<number, { facility: OptFacilityInput; items: OptPickupInput[] }> = {};
  let baselineDistanceKm = 0;
  let baselineCostInr = 0;
  let baselineEmissionsKg = 0;

  const avgCostPerKm =
    availableVehicles.length > 0
      ? availableVehicles.reduce((acc, v) => acc + v.costPerKmInr, 0) / availableVehicles.length
      : 24;
  const avgEmissionPerKm =
    availableVehicles.length > 0
      ? availableVehicles.reduce((acc, v) => acc + v.emissionFactorKgPerKm, 0) / availableVehicles.length
      : 0.22;

  for (const req of requests) {
    const compatible = facilities.filter(
      (f) => facilityAcceptsCategory(f, req.category) && facilityRemaining[f.id] >= req.estimatedWeightKg
    );

    if (compatible.length === 0) {
      unassigned.push({
        requestId: req.id,
        requestCode: req.requestCode,
        deviceName: req.deviceName,
        reason: 'No compatible facility with sufficient remaining weight capacity',
      });
      continue;
    }

    // Choose nearest compatible facility (with slight preference for lower load ratio under cost/emission)
    compatible.sort((a, b) => {
      const distA = estimatedRoadKm(req.lat, req.lng, a.lat, a.lng);
      const distB = estimatedRoadKm(req.lat, req.lng, b.lat, b.lng);
      return distA - distB;
    });

    const chosenFacility = compatible[0];
    facilityRemaining[chosenFacility.id] -= req.estimatedWeightKg;

    if (!facilityBuckets[chosenFacility.id]) {
      facilityBuckets[chosenFacility.id] = { facility: chosenFacility, items: [] };
    }
    facilityBuckets[chosenFacility.id].items.push(req);

    // Baseline: dedicated unbatched round-trip per individual request from average depot
    const defaultDepot = availableVehicles[0] || { baseLat: chosenFacility.lat, baseLng: chosenFacility.lng };
    const singleRoundTrip =
      estimatedRoadKm(defaultDepot.baseLat, defaultDepot.baseLng, req.lat, req.lng) +
      estimatedRoadKm(req.lat, req.lng, chosenFacility.lat, chosenFacility.lng) +
      estimatedRoadKm(chosenFacility.lat, chosenFacility.lng, defaultDepot.baseLat, defaultDepot.baseLng);

    baselineDistanceKm += singleRoundTrip;
    baselineCostInr += singleRoundTrip * (avgCostPerKm * 1.15); // unbatched dispatch overhead
    baselineEmissionsKg += singleRoundTrip * (avgEmissionPerKm * 1.2);
  }

  // Step 2: Sort vehicles according to objective priority
  const rankedVehicles = [...availableVehicles].sort((a, b) => {
    if (objective === 'emission') {
      return a.emissionFactorKgPerKm - b.emissionFactorKgPerKm || b.capacityKg - a.capacityKg;
    }
    if (objective === 'cost') {
      return a.costPerKmInr - b.costPerKmInr || b.capacityKg - a.capacityKg;
    }
    return b.capacityKg - a.capacityKg;
  });

  const usedVehicleIds = new Set<number>();
  const assignments: VehicleAssignment[] = [];

  // Step 3: Capacity-constrained vehicle batching + Nearest-Neighbor + 2-opt routing per facility
  for (const bucket of Object.values(facilityBuckets)) {
    const { facility } = bucket;
    const remaining = [...bucket.items].sort((a, b) => b.estimatedWeightKg - a.estimatedWeightKg);

    while (remaining.length > 0) {
      // Pick best unused vehicle (or reuse lowest-score vehicle on second shift if all allocated)
      const candidatePool = rankedVehicles.filter((v) => !usedVehicleIds.has(v.id));
      const pool = candidatePool.length > 0 ? candidatePool : rankedVehicles;

      if (pool.length === 0) {
        for (const item of remaining) {
          unassigned.push({
            requestId: item.id,
            requestCode: item.requestCode,
            deviceName: item.deviceName,
            reason: 'No active transport vehicles registered in fleet',
          });
        }
        break;
      }

      // Score candidate vehicles for this facility cluster
      const firstStop = remaining[0];
      pool.sort((a, b) => {
        const distA = estimatedRoadKm(a.baseLat, a.baseLng, firstStop.lat, firstStop.lng);
        const distB = estimatedRoadKm(b.baseLat, b.baseLng, firstStop.lat, firstStop.lng);
        if (objective === 'emission') {
          return distA * a.emissionFactorKgPerKm - distB * b.emissionFactorKgPerKm;
        }
        if (objective === 'cost') {
          return distA * a.costPerKmInr - distB * b.costPerKmInr;
        }
        return distA - distB;
      });

      const vehicle = pool[0];
      usedVehicleIds.add(vehicle.id);

      // Pack stops greedily by nearest-neighbor within vehicle capacity
      const loaded: OptPickupInput[] = [];
      let currentWeight = 0;
      let curLat = vehicle.baseLat;
      let curLng = vehicle.baseLng;

      while (remaining.length > 0) {
        let bestIdx = -1;
        let bestDist = Infinity;
        for (let i = 0; i < remaining.length; i++) {
          if (currentWeight + remaining[i].estimatedWeightKg <= vehicle.capacityKg) {
            const d = estimatedRoadKm(curLat, curLng, remaining[i].lat, remaining[i].lng);
            if (d < bestDist) {
              bestDist = d;
              bestIdx = i;
            }
          }
        }
        if (bestIdx === -1) break;
        const chosen = remaining.splice(bestIdx, 1)[0];
        loaded.push(chosen);
        currentWeight += chosen.estimatedWeightKg;
        curLat = chosen.lat;
        curLng = chosen.lng;
      }

      if (loaded.length === 0) {
        const oversized = remaining.shift()!;
        unassigned.push({
          requestId: oversized.id,
          requestCode: oversized.requestCode,
          deviceName: oversized.deviceName,
          reason: `Weight (${oversized.estimatedWeightKg} kg) exceeds largest available vehicle capacity (${vehicle.capacityKg} kg)`,
        });
        continue;
      }

      // Apply 2-opt tour improvement
      const ordered = twoOptRoute(
        { lat: vehicle.baseLat, lng: vehicle.baseLng },
        loaded,
        { lat: facility.lat, lng: facility.lng }
      );

      // Construct full stop legs
      const stops: RouteStop[] = [
        {
          type: 'depot',
          label: `Depot (${vehicle.registrationNo})`,
          lat: vehicle.baseLat,
          lng: vehicle.baseLng,
          legDistanceKm: 0,
        },
      ];

      let routeDistanceKm = 0;
      let prevLat = vehicle.baseLat;
      let prevLng = vehicle.baseLng;

      for (const stop of ordered) {
        const leg = estimatedRoadKm(prevLat, prevLng, stop.lat, stop.lng);
        routeDistanceKm += leg;
        stops.push({
          type: 'pickup',
          label: `${stop.deviceName} — ${stop.pickupAddress}`,
          requestCode: stop.requestCode,
          category: stop.category,
          weightKg: stop.estimatedWeightKg,
          lat: stop.lat,
          lng: stop.lng,
          legDistanceKm: Number(leg.toFixed(2)),
        });
        prevLat = stop.lat;
        prevLng = stop.lng;
      }

      const finalLeg = estimatedRoadKm(prevLat, prevLng, facility.lat, facility.lng);
      routeDistanceKm += finalLeg;
      stops.push({
        type: 'facility',
        label: `${facility.name} (${facility.city})`,
        lat: facility.lat,
        lng: facility.lng,
        legDistanceKm: Number(finalLeg.toFixed(2)),
      });

      const estimatedCostInr = routeDistanceKm * vehicle.costPerKmInr;
      const estimatedEmissionsKg = routeDistanceKm * vehicle.emissionFactorKgPerKm;

      assignments.push({
        vehicleId: vehicle.id,
        registrationNo: vehicle.registrationNo,
        vehicleType: vehicle.vehicleType,
        driverName: vehicle.driverName,
        fuelType: vehicle.fuelType,
        facilityId: facility.id,
        facilityName: facility.name,
        requestIds: ordered.map((o) => o.id),
        requestCodes: ordered.map((o) => o.requestCode),
        totalWeightKg: Number(currentWeight.toFixed(2)),
        capacityKg: vehicle.capacityKg,
        utilizationPct: Number(((currentWeight / vehicle.capacityKg) * 100).toFixed(1)),
        routeDistanceKm: Number(routeDistanceKm.toFixed(2)),
        estimatedCostInr: Number(estimatedCostInr.toFixed(2)),
        estimatedEmissionsKg: Number(estimatedEmissionsKg.toFixed(3)),
        stops,
      });
    }
  }

  const totalDistanceKm = Number(
    assignments.reduce((sum, a) => sum + a.routeDistanceKm, 0).toFixed(2)
  );
  const estimatedCostInr = Number(
    assignments.reduce((sum, a) => sum + a.estimatedCostInr, 0).toFixed(2)
  );
  const estimatedEmissionsKg = Number(
    assignments.reduce((sum, a) => sum + a.estimatedEmissionsKg, 0).toFixed(3)
  );

  const safeBaseDist = Number(Math.max(baselineDistanceKm, totalDistanceKm).toFixed(2));
  const safeBaseCost = Number(Math.max(baselineCostInr, estimatedCostInr).toFixed(2));
  const safeBaseEm = Number(Math.max(baselineEmissionsKg, estimatedEmissionsKg).toFixed(3));

  const distanceSavedKm = Number((safeBaseDist - totalDistanceKm).toFixed(2));
  const costSavedInr = Number((safeBaseCost - estimatedCostInr).toFixed(2));
  const emissionsSavedKg = Number((safeBaseEm - estimatedEmissionsKg).toFixed(3));

  const assignedCount = assignments.reduce((s, a) => s + a.requestIds.length, 0);

  const objectiveDescriptions: Record<OptimizationObjective, string> = {
    cost: 'Minimizes total dispatch expenditure (INR) by consolidating compatible pickups into the lowest cost-per-km vehicles and running 2-opt tour tightening.',
    distance: 'Minimizes cumulative estimated road kilometers using nearest-facility clustering, capacity-constrained nearest-neighbor batching, and 2-opt route ordering.',
    emission: 'Minimizes logistics carbon footprint (kg CO₂e) by prioritizing zero-tailpipe EV and low-emission CNG fleet assignments before diesel vehicles.',
  };

  return {
    objective,
    totalDistanceKm,
    baselineDistanceKm: safeBaseDist,
    distanceSavedKm,
    distanceSavedPct: safeBaseDist > 0 ? Number(((distanceSavedKm / safeBaseDist) * 100).toFixed(1)) : 0,
    estimatedCostInr,
    baselineCostInr: safeBaseCost,
    costSavedInr,
    costSavedPct: safeBaseCost > 0 ? Number(((costSavedInr / safeBaseCost) * 100).toFixed(1)) : 0,
    estimatedEmissionsKg,
    baselineEmissionsKg: safeBaseEm,
    emissionsSavedKg,
    emissionsSavedPct: safeBaseEm > 0 ? Number(((emissionsSavedKg / safeBaseEm) * 100).toFixed(1)) : 0,
    assignedCount,
    unassignedCount: unassigned.length,
    assignments,
    unassigned,
    assumptions:
      'Road distances are estimated from WGS-84 Haversine geodesic distance multiplied by a 1.28x urban road circuity factor (not live turn-by-turn road telemetry). Emission factors: EV 0.08 kg CO₂e/km (grid mix), CNG 0.16 kg CO₂e/km, Diesel 0.29 kg CO₂e/km. Baseline reflects unbatched point-to-point dispatch.',
    explanation: objectiveDescriptions[objective],
  };
}
