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
  legMinutes: number;
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
  estimatedTravelMinutes: number;
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
  estimatedTravelMinutes: number;
  baselineTravelMinutes: number;
  timeSavedMinutes: number;
  timeSavedPct: number;
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

const AVG_SPEED_KMH: Record<string, number> = {
  Electric: 29,
  CNG: 26,
  Diesel: 22,
};

const PICKUP_DWELL_MINUTES = 8; // Loading & digital manifest scan per pickup stop
const FACILITY_UNLOAD_MINUTES = 10; // Weigh-in & bay intake unloading at destination facility

const FIXED_DISPATCH_COST_INR: Record<string, number> = {
  Electric: 240,
  CNG: 260,
  Diesel: 320,
};

const COLD_START_EMISSIONS_KG: Record<string, number> = {
  Electric: 0,
  CNG: 0.35,
  Diesel: 1.45,
};

function getAvgSpeedKmh(fuelType: string): number {
  return AVG_SPEED_KMH[fuelType] ?? 25;
}

function getDispatchMobilizationCost(fuelType: string): number {
  return FIXED_DISPATCH_COST_INR[fuelType] ?? 260;
}

function getColdStartEmissionsKg(fuelType: string): number {
  return COLD_START_EMISSIONS_KG[fuelType] ?? 0.4;
}

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

function estimateLegMinutes(
  distanceKm: number,
  fuelType: string,
  dwellMinutes = 0
): number {
  const driveMins = (distanceKm / getAvgSpeedKmh(fuelType)) * 60;
  return Math.max(1, Math.round(driveMins + dwellMinutes));
}

function facilityAcceptsCategory(facility: OptFacilityInput, category: string): boolean {
  const accepted = facility.acceptedCategories
    .toLowerCase()
    .split(',')
    .map((s) => s.trim());
  const normalized = category.toLowerCase().trim();
  return (
    accepted.includes('all') ||
    accepted.some((a) => normalized.includes(a) || a.includes(normalized))
  );
}

function twoOptRoute(
  depot: { lat: number; lng: number },
  pickups: OptPickupInput[],
  facility: { lat: number; lng: number }
): OptPickupInput[] {
  if (pickups.length <= 1) return pickups;

  const route = [...pickups];
  const calcLen = (seq: OptPickupInput[]) => {
    let total = estimatedRoadKm(depot.lat, depot.lng, seq[0].lat, seq[0].lng);
    for (let i = 0; i < seq.length - 1; i++) {
      total += estimatedRoadKm(seq[i].lat, seq[i].lng, seq[i + 1].lat, seq[i + 1].lng);
    }
    total += estimatedRoadKm(
      seq[seq.length - 1].lat,
      seq[seq.length - 1].lng,
      facility.lat,
      facility.lng
    );
    return total;
  };

  let bestDist = calcLen(route);
  let improved = true;
  let guard = 0;

  while (improved && guard < 30) {
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

function computeRouteDistance(
  origin: { lat: number; lng: number },
  ordered: OptPickupInput[],
  facility: { lat: number; lng: number }
): number {
  if (ordered.length === 0) return 0;
  let dist = estimatedRoadKm(origin.lat, origin.lng, ordered[0].lat, ordered[0].lng);
  for (let i = 0; i < ordered.length - 1; i++) {
    dist += estimatedRoadKm(ordered[i].lat, ordered[i].lng, ordered[i + 1].lat, ordered[i + 1].lng);
  }
  dist += estimatedRoadKm(
    ordered[ordered.length - 1].lat,
    ordered[ordered.length - 1].lng,
    facility.lat,
    facility.lng
  );
  return dist;
}

function computeRouteTravelMinutes(
  origin: { lat: number; lng: number },
  ordered: OptPickupInput[],
  facility: { lat: number; lng: number },
  fuelType: string
): number {
  if (ordered.length === 0) return 0;
  let mins = 0;
  let prevLat = origin.lat;
  let prevLng = origin.lng;
  for (const stop of ordered) {
    const leg = estimatedRoadKm(prevLat, prevLng, stop.lat, stop.lng);
    mins += estimateLegMinutes(leg, fuelType, PICKUP_DWELL_MINUTES);
    prevLat = stop.lat;
    prevLng = stop.lng;
  }
  const finalLeg = estimatedRoadKm(prevLat, prevLng, facility.lat, facility.lng);
  mins += estimateLegMinutes(finalLeg, fuelType, FACILITY_UNLOAD_MINUTES);
  return mins;
}

/**
 * Evaluates a candidate assignment of clusters to vehicles and returns the best plan
 * for the active objective (`emission`, `distance`, or `cost`) using real geodesic/road math.
 */
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

  let baselineDistanceKm = 0;
  let baselineCostInr = 0;
  let baselineEmissionsKg = 0;
  let baselineTravelMinutes = 0;

  const avgCostPerKm =
    availableVehicles.length > 0
      ? availableVehicles.reduce((acc, v) => acc + v.costPerKmInr, 0) / availableVehicles.length
      : 24;
  const avgEmissionPerKm =
    availableVehicles.length > 0
      ? availableVehicles.reduce((acc, v) => acc + v.emissionFactorKgPerKm, 0) /
        availableVehicles.length
      : 0.22;

  // Step 1: Match each pickup request to its optimal compatible facility
  // - Min Distance & Min Emissions: nearest compatible facility to minimize leg distance
  // - Min Cost: prefer consolidating compatible requests into shared high-capacity hubs if
  //   detour is small enough to avoid deploying an extra vehicle mobilization fee
  const facilityBuckets: Record<number, { facility: OptFacilityInput; items: OptPickupInput[] }> =
    {};

  for (const req of requests) {
    const compatible = facilities.filter(
      (f) =>
        facilityAcceptsCategory(f, req.category) && facilityRemaining[f.id] >= req.estimatedWeightKg
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

    compatible.sort((a, b) => {
      const distA = estimatedRoadKm(req.lat, req.lng, a.lat, a.lng);
      const distB = estimatedRoadKm(req.lat, req.lng, b.lat, b.lng);
      if (objective === 'cost') {
        // Reward consolidating into an already-active facility when extra road cost < mobilization fee
        const activeBonusA = facilityBuckets[a.id] ? -8 : 0;
        const activeBonusB = facilityBuckets[b.id] ? -8 : 0;
        return distA + activeBonusA - (distB + activeBonusB);
      }
      return distA - distB;
    });

    const chosenFacility = compatible[0];
    facilityRemaining[chosenFacility.id] -= req.estimatedWeightKg;

    if (!facilityBuckets[chosenFacility.id]) {
      facilityBuckets[chosenFacility.id] = { facility: chosenFacility, items: [] };
    }
    facilityBuckets[chosenFacility.id].items.push(req);

    // Baseline: dedicated unbatched round-trip per individual request from average depot
    const defaultDepot = availableVehicles[0] || {
      baseLat: chosenFacility.lat,
      baseLng: chosenFacility.lng,
    };
    const singleRoundTrip =
      estimatedRoadKm(defaultDepot.baseLat, defaultDepot.baseLng, req.lat, req.lng) +
      estimatedRoadKm(req.lat, req.lng, chosenFacility.lat, chosenFacility.lng) +
      estimatedRoadKm(
        chosenFacility.lat,
        chosenFacility.lng,
        defaultDepot.baseLat,
        defaultDepot.baseLng
      );

    baselineDistanceKm += singleRoundTrip;
    baselineCostInr += singleRoundTrip * (avgCostPerKm * 1.15) + 260;
    baselineEmissionsKg += singleRoundTrip * (avgEmissionPerKm * 1.2) + 0.55;
    baselineTravelMinutes += Math.round((singleRoundTrip / 24) * 60 + PICKUP_DWELL_MINUTES + FACILITY_UNLOAD_MINUTES);
  }

  // Step 2: Order facility clusters
  const orderedBuckets = Object.values(facilityBuckets).sort((a, b) => {
    const weightDiff =
      b.items.reduce((s, i) => s + i.estimatedWeightKg, 0) -
      a.items.reduce((s, i) => s + i.estimatedWeightKg, 0);
    if (Math.abs(weightDiff) > 0.01) return weightDiff;
    return a.facility.id - b.facility.id;
  });

  // Track where each deployed vehicle currently sits (depot initially, last unloading facility on continuation shifts)
  const vehicleLocations = new Map<number, { lat: number; lng: number; label: string }>();
  const usedVehicleIds = new Set<number>();
  const assignments: VehicleAssignment[] = [];

  for (const bucket of orderedBuckets) {
    const { facility } = bucket;
    const remaining = [...bucket.items].sort((a, b) => b.estimatedWeightKg - a.estimatedWeightKg);

    while (remaining.length > 0) {
      if (availableVehicles.length === 0) {
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

      // Evaluate EVERY candidate vehicle by simulating its actual route from its live position
      const candidates = availableVehicles
        .filter((v) => remaining.some((r) => r.estimatedWeightKg <= v.capacityKg))
        .map((v) => {
          const isContinuationShift = usedVehicleIds.has(v.id);
          const origin = vehicleLocations.get(v.id) ?? {
            lat: v.baseLat,
            lng: v.baseLng,
            label: `Depot (${v.registrationNo})`,
          };

          // Greedy capacity-aware stop packing from current vehicle origin
          const tempRemaining = [...remaining];
          const loaded: OptPickupInput[] = [];
          let weight = 0;
          let curLat = origin.lat;
          let curLng = origin.lng;

          while (tempRemaining.length > 0) {
            let bestIdx = -1;
            let bestDist = Infinity;
            for (let i = 0; i < tempRemaining.length; i++) {
              if (weight + tempRemaining[i].estimatedWeightKg <= v.capacityKg) {
                const d = estimatedRoadKm(
                  curLat,
                  curLng,
                  tempRemaining[i].lat,
                  tempRemaining[i].lng
                );
                if (d < bestDist) {
                  bestDist = d;
                  bestIdx = i;
                }
              }
            }
            if (bestIdx === -1) break;
            const picked = tempRemaining.splice(bestIdx, 1)[0];
            loaded.push(picked);
            weight += picked.estimatedWeightKg;
            curLat = picked.lat;
            curLng = picked.lng;
          }

          const ordered = twoOptRoute(
            { lat: origin.lat, lng: origin.lng },
            loaded,
            { lat: facility.lat, lng: facility.lng }
          );
          const routeDistanceKm = computeRouteDistance(
            { lat: origin.lat, lng: origin.lng },
            ordered,
            { lat: facility.lat, lng: facility.lng }
          );
          const estimatedTravelMinutes = computeRouteTravelMinutes(
            { lat: origin.lat, lng: origin.lng },
            ordered,
            { lat: facility.lat, lng: facility.lng },
            v.fuelType
          );

          // Already-mobilized vehicles incur zero duplicate fixed dispatch or cold-start overhead on continuation shifts
          const mobilizationCost = isContinuationShift
            ? 0
            : getDispatchMobilizationCost(v.fuelType);
          const coldStartKg = isContinuationShift ? 0 : getColdStartEmissionsKg(v.fuelType);
          const estimatedCostInr = routeDistanceKm * v.costPerKmInr + mobilizationCost;
          const estimatedEmissionsKg = routeDistanceKm * v.emissionFactorKgPerKm + coldStartKg;

          const coverage = Math.max(1, loaded.length);
          let objectiveScore: number;
          if (objective === 'emission') {
            objectiveScore = estimatedEmissionsKg / coverage;
          } else if (objective === 'cost') {
            objectiveScore = estimatedCostInr / coverage;
          } else {
            objectiveScore = routeDistanceKm / coverage;
          }

          return {
            vehicle: v,
            origin,
            loaded,
            ordered,
            weight,
            routeDistanceKm,
            estimatedTravelMinutes,
            estimatedCostInr,
            estimatedEmissionsKg,
            objectiveScore,
          };
        });

      if (candidates.length === 0) {
        const oversized = remaining.shift()!;
        const maxCap = Math.max(...availableVehicles.map((v) => v.capacityKg));
        unassigned.push({
          requestId: oversized.id,
          requestCode: oversized.requestCode,
          deviceName: oversized.deviceName,
          reason: `Weight (${oversized.estimatedWeightKg} kg) exceeds largest available vehicle capacity (${maxCap} kg)`,
        });
        continue;
      }

      candidates.sort((a, b) => a.objectiveScore - b.objectiveScore);
      const best = candidates[0];
      const {
        vehicle,
        origin,
        ordered,
        weight: currentWeight,
        routeDistanceKm,
        estimatedTravelMinutes,
        estimatedCostInr,
        estimatedEmissionsKg,
      } = best;

      usedVehicleIds.add(vehicle.id);
      vehicleLocations.set(vehicle.id, {
        lat: facility.lat,
        lng: facility.lng,
        label: `Continuation from ${facility.name} (${vehicle.registrationNo})`,
      });

      // Remove assigned pickups from remaining pool
      const assignedIds = new Set(ordered.map((o) => o.id));
      for (let i = remaining.length - 1; i >= 0; i--) {
        if (assignedIds.has(remaining[i].id)) {
          remaining.splice(i, 1);
        }
      }

      // Construct full stop legs starting from vehicle's live origin
      const stops: RouteStop[] = [
        {
          type: 'depot',
          label: origin.label,
          lat: origin.lat,
          lng: origin.lng,
          legDistanceKm: 0,
          legMinutes: 0,
        },
      ];

      let prevLat = origin.lat;
      let prevLng = origin.lng;

      for (const stop of ordered) {
        const leg = estimatedRoadKm(prevLat, prevLng, stop.lat, stop.lng);
        const legMins = estimateLegMinutes(leg, vehicle.fuelType, PICKUP_DWELL_MINUTES);
        stops.push({
          type: 'pickup',
          label: `${stop.deviceName} — ${stop.pickupAddress}`,
          requestCode: stop.requestCode,
          category: stop.category,
          weightKg: stop.estimatedWeightKg,
          lat: stop.lat,
          lng: stop.lng,
          legDistanceKm: Number(leg.toFixed(2)),
          legMinutes: legMins,
        });
        prevLat = stop.lat;
        prevLng = stop.lng;
      }

      const finalLeg = estimatedRoadKm(prevLat, prevLng, facility.lat, facility.lng);
      const finalMins = estimateLegMinutes(finalLeg, vehicle.fuelType, FACILITY_UNLOAD_MINUTES);
      stops.push({
        type: 'facility',
        label: `${facility.name} (${facility.city})`,
        lat: facility.lat,
        lng: facility.lng,
        legDistanceKm: Number(finalLeg.toFixed(2)),
        legMinutes: finalMins,
      });

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
        estimatedTravelMinutes,
        estimatedCostInr: Number(estimatedCostInr.toFixed(2)),
        estimatedEmissionsKg: Number(estimatedEmissionsKg.toFixed(3)),
        stops,
      });
    }
  }

  const totalDistanceKm = Number(
    assignments.reduce((sum, a) => sum + a.routeDistanceKm, 0).toFixed(2)
  );
  const estimatedTravelMinutes = Math.round(
    assignments.reduce((sum, a) => sum + a.estimatedTravelMinutes, 0)
  );
  const estimatedCostInr = Number(
    assignments.reduce((sum, a) => sum + a.estimatedCostInr, 0).toFixed(2)
  );
  const estimatedEmissionsKg = Number(
    assignments.reduce((sum, a) => sum + a.estimatedEmissionsKg, 0).toFixed(3)
  );

  const safeBaseDist = Number(Math.max(baselineDistanceKm, totalDistanceKm).toFixed(2));
  const safeBaseTime = Math.max(baselineTravelMinutes, estimatedTravelMinutes);
  const safeBaseCost = Number(Math.max(baselineCostInr, estimatedCostInr).toFixed(2));
  const safeBaseEm = Number(Math.max(baselineEmissionsKg, estimatedEmissionsKg).toFixed(3));

  const distanceSavedKm = Number((safeBaseDist - totalDistanceKm).toFixed(2));
  const timeSavedMinutes = Math.max(0, safeBaseTime - estimatedTravelMinutes);
  const costSavedInr = Number((safeBaseCost - estimatedCostInr).toFixed(2));
  const emissionsSavedKg = Number((safeBaseEm - estimatedEmissionsKg).toFixed(3));

  const assignedCount = assignments.reduce((s, a) => s + a.requestIds.length, 0);

  const objectiveDescriptions: Record<OptimizationObjective, string> = {
    cost: 'Minimizes total dispatch expenditure (INR) by consolidating nearby compatible pickups into shared hubs and reusing already-mobilized low-cost vehicles on continuation shifts where cheaper than deploying another truck, refined with 2-opt tour tightening.',
    distance:
      'Minimizes cumulative estimated road kilometers and transit time by dispatching each local depot vehicle directly to its nearest compatible cluster, refined with 2-opt stop ordering.',
    emission:
      'Minimizes logistics carbon footprint (kg CO₂e) by prioritizing zero-tailpipe EV and low-emission CNG continuation shifts over high-emission heavy diesel cold starts.',
  };

  return {
    objective,
    totalDistanceKm,
    baselineDistanceKm: safeBaseDist,
    distanceSavedKm,
    distanceSavedPct:
      safeBaseDist > 0 ? Number(((distanceSavedKm / safeBaseDist) * 100).toFixed(1)) : 0,
    estimatedTravelMinutes,
    baselineTravelMinutes: safeBaseTime,
    timeSavedMinutes,
    timeSavedPct:
      safeBaseTime > 0 ? Number(((timeSavedMinutes / safeBaseTime) * 100).toFixed(1)) : 0,
    estimatedCostInr,
    baselineCostInr: safeBaseCost,
    costSavedInr,
    costSavedPct:
      safeBaseCost > 0 ? Number(((costSavedInr / safeBaseCost) * 100).toFixed(1)) : 0,
    estimatedEmissionsKg,
    baselineEmissionsKg: safeBaseEm,
    emissionsSavedKg,
    emissionsSavedPct:
      safeBaseEm > 0 ? Number(((emissionsSavedKg / safeBaseEm) * 100).toFixed(1)) : 0,
    assignedCount,
    unassignedCount: unassigned.length,
    assignments,
    unassigned,
    assumptions:
      'Road distances use WGS-84 Haversine distance multiplied by a 1.28x urban road circuity factor. Travel times combine vehicle speed profiles (EV 29 km/h, CNG 26 km/h, Diesel 22 km/h) with 8 min pickup loading and 10 min facility unloading dwell. Costs combine variable ₹/km rates with daily mobilization (EV ₹240, CNG ₹260, Diesel ₹320; ₹0 additional fee on continuation shifts). Emissions combine driving factors (EV 0.08, CNG 0.16, Diesel 0.29 kg CO₂e/km) with cold-start idle (EV 0, CNG 0.35, Diesel 1.45 kg CO₂e).',
    explanation: objectiveDescriptions[objective],
  };
}
