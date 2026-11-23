import React, { useEffect, useMemo, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { Clock, IndianRupee, Leaf, MapPin, Navigation, Route, Truck } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type {
  OptimizationObjective,
  RouteStop,
  VehicleAssignment,
} from '../server/optimizer';

const INITIAL_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

const OBJECTIVE_ACCENT: Record<
  OptimizationObjective,
  { stroke: string; glow: string; pinBg: string; label: string }
> = {
  emission: {
    stroke: '#10B981',
    glow: 'rgba(16, 185, 129, 0.32)',
    pinBg: '#059669',
    label: 'Min Emissions Route',
  },
  distance: {
    stroke: '#0EA5E9',
    glow: 'rgba(14, 165, 233, 0.35)',
    pinBg: '#0284C7',
    label: 'Min Distance Route',
  },
  cost: {
    stroke: '#F59E0B',
    glow: 'rgba(245, 158, 11, 0.32)',
    pinBg: '#D97706',
    label: 'Min Cost Route',
  },
};

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

interface GoogleRouteInnerProps {
  assignments: VehicleAssignment[];
  selectedIdx: number;
  objective: OptimizationObjective;
  onSelectRoute: (idx: number) => void;
}

const GoogleRouteInner: React.FC<GoogleRouteInnerProps> = ({
  assignments,
  selectedIdx,
  objective,
  onSelectRoute,
}) => {
  const map = useMap();
  const routesLib = useMapsLibrary('routes') as any;
  const mapsLib = useMapsLibrary('maps') as any;
  const coreLib = useMapsLibrary('core') as any;

  const [activeStopKey, setActiveStopKey] = useState<string | null>(null);
  const accent = OBJECTIVE_ACCENT[objective];
  const activeRoute = assignments[selectedIdx] || assignments[0];

  // Auto-fit bounds whenever routes or selected route changes
  useEffect(() => {
    if (!map || !coreLib?.LatLngBounds || assignments.length === 0) return;
    const bounds = new coreLib.LatLngBounds();
    const stopsToFit = activeRoute ? activeRoute.stops : assignments.flatMap((a) => a.stops);
    stopsToFit.forEach((s) => bounds.extend({ lat: s.lat, lng: s.lng }));
    map.fitBounds(bounds, 64);
  }, [map, coreLib, assignments, activeRoute]);

  // Draw highlighted active route (via modern Routes API with polyline fallback) + muted secondary routes
  useEffect(() => {
    if (!map || assignments.length === 0) return;
    let cancelled = false;
    const drawnObjects: { setMap: (m: any) => void }[] = [];

    const drawDirectPolyline = (
      stops: RouteStop[],
      color: string,
      weight: number,
      opacity: number,
      zIndex: number
    ) => {
      if (!mapsLib?.Polyline || stops.length < 2) return;
      const line = new mapsLib.Polyline({
        path: stops.map((s) => ({ lat: s.lat, lng: s.lng })),
        strokeColor: color,
        strokeWeight: weight,
        strokeOpacity: opacity,
        zIndex,
        geodesic: true,
      });
      line.setMap(map);
      drawnObjects.push(line);
    };

    // Draw non-selected routes muted in background
    assignments.forEach((route, idx) => {
      if (idx === selectedIdx) return;
      drawDirectPolyline(route.stops, '#64748B', 3, 0.35, 1);
    });

    // Draw selected/best route highlighted using modern Route.computeRoutes (with clean fallback)
    async function renderPrimaryRoute() {
      if (!activeRoute || activeRoute.stops.length < 2) return;

      const stops = activeRoute.stops;
      const origin = { lat: stops[0].lat, lng: stops[0].lng };
      const destination = { lat: stops[stops.length - 1].lat, lng: stops[stops.length - 1].lng };
      const intermediates = stops.slice(1, -1).map((s) => ({
        location: { lat: s.lat, lng: s.lng },
      }));

      if (routesLib?.Route && typeof routesLib.Route.computeRoutes === 'function') {
        try {
          const { routes } = await routesLib.Route.computeRoutes({
            origin,
            destination,
            intermediates: intermediates.length > 0 ? intermediates : undefined,
            travelMode: 'DRIVING',
            fields: ['path'],
          });
          if (cancelled) return;
          const roadRoute = routes?.[0];
          if (roadRoute && typeof roadRoute.createPolylines === 'function') {
            // Soft outer halo polyline
            const haloLines: { setMap: (m: any) => void }[] = roadRoute.createPolylines({
              polylineOptions: {
                strokeColor: accent.stroke,
                strokeWeight: 10,
                strokeOpacity: 0.25,
                zIndex: 8,
              },
            });
            // Crisp foreground route line
            const mainLines: { setMap: (m: any) => void }[] = roadRoute.createPolylines({
              polylineOptions: {
                strokeColor: accent.stroke,
                strokeWeight: 5,
                strokeOpacity: 0.96,
                zIndex: 10,
              },
            });
            [...haloLines, ...mainLines].forEach((l) => {
              l.setMap(map);
              drawnObjects.push(l);
            });
            return;
          }
        } catch (err: any) {
          const msg = String(err?.message || err);
          if (
            msg.includes('OVER_QUERY_LIMIT') ||
            msg.includes('RESOURCE_EXHAUSTED') ||
            msg.includes('429')
          ) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          }
        }
      }

      if (!cancelled) {
        drawDirectPolyline(stops, accent.stroke, 10, 0.22, 8);
        drawDirectPolyline(stops, accent.stroke, 5, 0.95, 10);
      }
    }

    void renderPrimaryRoute();

    return () => {
      cancelled = true;
      drawnObjects.forEach((obj) => obj.setMap(null));
    };
  }, [map, routesLib, mapsLib, assignments, selectedIdx, activeRoute, accent.stroke]);

  return (
    <>
      {assignments.map((route, rIdx) => {
        const isPrimary = rIdx === selectedIdx;
        return route.stops.map((stop, sIdx) => {
          const key = `${rIdx}-${sIdx}`;
          const isDepot = stop.type === 'depot';
          const isFacility = stop.type === 'facility';
          const pinBg = isDepot
            ? '#334155'
            : isFacility
              ? '#0F766E'
              : isPrimary
                ? accent.pinBg
                : '#64748B';
          const glyph = isDepot ? 'D' : isFacility ? 'F' : String(sIdx);

          return (
            <React.Fragment key={key}>
              <AdvancedMarker
                position={{ lat: stop.lat, lng: stop.lng }}
                zIndex={isPrimary ? 20 + sIdx : 5}
                onClick={() => {
                  onSelectRoute(rIdx);
                  setActiveStopKey(key);
                }}
              >
                <Pin
                  background={pinBg}
                  borderColor="#ffffff"
                  glyphColor="#ffffff"
                  glyph={glyph}
                  scale={isPrimary ? 1.12 : 0.85}
                />
              </AdvancedMarker>

              {activeStopKey === key && (
                <InfoWindow
                  position={{ lat: stop.lat, lng: stop.lng }}
                  onCloseClick={() => setActiveStopKey(null)}
                >
                  <div className="max-w-[230px] p-1 space-y-1 text-slate-900">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                      {stop.type} · {route.registrationNo}
                    </p>
                    <p className="text-xs font-semibold leading-snug">{stop.label}</p>
                    <p className="text-[11px] font-mono text-slate-600">
                      {stop.legDistanceKm > 0
                        ? `+${stop.legDistanceKm} km · ~${stop.legMinutes} min`
                        : 'Route starting origin'}
                      {stop.weightKg ? ` · ${stop.weightKg} kg` : ''}
                    </p>
                  </div>
                </InfoWindow>
              )}
            </React.Fragment>
          );
        });
      })}
    </>
  );
};

/**
 * Interactive coordinate-projected SVG route map fallback when Google Maps API key is absent.
 * Uses actual WGS-84 lat/lng coordinates from the computed optimization output.
 */
const ProjectedRouteSvgMap: React.FC<{
  assignments: VehicleAssignment[];
  selectedIdx: number;
  objective: OptimizationObjective;
  onSelectRoute: (idx: number) => void;
}> = ({ assignments, selectedIdx, objective, onSelectRoute }) => {
  const [hoveredStop, setHoveredStop] = useState<{
    routeReg: string;
    stop: RouteStop;
    stepNum: number;
  } | null>(null);

  const accent = OBJECTIVE_ACCENT[objective];

  const { project, allPoints } = useMemo(() => {
    const pts = assignments.flatMap((a) => a.stops);
    if (pts.length === 0) {
      return {
        allPoints: [],
        project: () => ({ x: 400, y: 180 }),
      };
    }
    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const latSpan = Math.max(0.04, maxLat - minLat);
    const lngSpan = Math.max(0.05, maxLng - minLng);

    const padX = 76;
    const padY = 54;
    const width = 800;
    const height = 340;

    return {
      allPoints: pts,
      project: (lat: number, lng: number) => ({
        x: padX + ((lng - minLng) / lngSpan) * (width - padX * 2),
        y: height - padY - ((lat - minLat) / latSpan) * (height - padY * 2),
      }),
    };
  }, [assignments]);

  if (allPoints.length === 0) return null;

  return (
    <div className="relative w-full h-[340px] bg-gradient-to-br from-[#EAF5FF] via-[#F2F9FF] to-[#E6F4F1] dark:from-[#04111E] dark:via-[#071D32] dark:to-[#06212C] overflow-hidden">
      <svg
        viewBox="0 0 800 340"
        className="w-full h-full"
        role="img"
        aria-label="Optimized e-waste logistics route map"
      >
        <defs>
          <pattern id="optGeoGrid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.09"
              strokeWidth="1"
            />
          </pattern>
          <filter id="routeGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width="800" height="340" fill="url(#optGeoGrid)" className="text-sky-700 dark:text-sky-300" />

        {/* Secondary (non-selected) routes */}
        {assignments.map((route, rIdx) => {
          if (rIdx === selectedIdx || route.stops.length < 2) return null;
          const d = route.stops
            .map((s, idx) => {
              const p = project(s.lat, s.lng);
              return `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
            })
            .join(' ');
          return (
            <path
              key={`bg-route-${rIdx}`}
              d={d}
              fill="none"
              stroke="#64748B"
              strokeWidth="2.5"
              strokeDasharray="6 6"
              strokeOpacity="0.45"
              className="cursor-pointer transition-opacity hover:opacity-80"
              onClick={() => onSelectRoute(rIdx)}
            />
          );
        })}

        {/* Primary Highlighted Route */}
        {assignments[selectedIdx] && assignments[selectedIdx].stops.length >= 2 && (() => {
          const route = assignments[selectedIdx];
          const d = route.stops
            .map((s, idx) => {
              const p = project(s.lat, s.lng);
              return `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
            })
            .join(' ');
          return (
            <g>
              <path
                d={d}
                fill="none"
                stroke={accent.stroke}
                strokeWidth="10"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity="0.2"
                filter="url(#routeGlow)"
              />
              <path
                d={d}
                fill="none"
                stroke={accent.stroke}
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={d}
                fill="none"
                stroke="#ffffff"
                strokeWidth="1.75"
                strokeDasharray="6 10"
                strokeOpacity="0.85"
              >
                <animate
                  attributeName="stroke-dashoffset"
                  from="32"
                  to="0"
                  dur="1.4s"
                  repeatCount="indefinite"
                />
              </path>
            </g>
          );
        })()}

        {/* Stop Markers */}
        {assignments.map((route, rIdx) => {
          const isPrimary = rIdx === selectedIdx;
          return route.stops.map((stop, sIdx) => {
            const pos = project(stop.lat, stop.lng);
            const isDepot = stop.type === 'depot';
            const isFacility = stop.type === 'facility';
            const fill = isDepot
              ? '#334155'
              : isFacility
                ? '#0F766E'
                : isPrimary
                  ? accent.pinBg
                  : '#64748B';
            const label = isDepot ? 'D' : isFacility ? 'F' : String(sIdx);
            const radius = isPrimary ? 13 : 9.5;

            return (
              <g
                key={`pin-${rIdx}-${sIdx}`}
                transform={`translate(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})`}
                className="cursor-pointer"
                onClick={() => onSelectRoute(rIdx)}
                onMouseEnter={() =>
                  setHoveredStop({ routeReg: route.registrationNo, stop, stepNum: sIdx })
                }
                onMouseLeave={() => setHoveredStop(null)}
              >
                {isPrimary && (
                  <circle r={radius + 5} fill={accent.stroke} fillOpacity="0.18" />
                )}
                <circle
                  r={radius}
                  fill={fill}
                  stroke="#ffffff"
                  strokeWidth="2.5"
                />
                <text
                  textAnchor="middle"
                  dy="0.35em"
                  fill="#ffffff"
                  fontSize={isPrimary ? '10.5' : '8.5'}
                  fontWeight="700"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {label}
                </text>
              </g>
            );
          });
        })}
      </svg>

      {/* Interactive Stop Tooltip Overlay */}
      {hoveredStop && (
        <div className="pointer-events-none absolute top-3 left-3 max-w-xs rounded-lg border border-sky-200 dark:border-sky-800 bg-white/95 dark:bg-[#081C32]/95 backdrop-blur-md px-3 py-2 shadow-lg text-xs">
          <p className="font-mono text-[10px] font-semibold uppercase text-sky-700 dark:text-sky-400">
            {hoveredStop.stop.type} · {hoveredStop.routeReg}
          </p>
          <p className="font-medium text-slate-900 dark:text-sky-50 leading-snug mt-0.5">
            {hoveredStop.stop.label}
          </p>
          <p className="font-mono tabular-nums text-[11px] text-slate-600 dark:text-sky-200/75 mt-1">
            {hoveredStop.stop.legDistanceKm > 0
              ? `+${hoveredStop.stop.legDistanceKm} km · ~${hoveredStop.stop.legMinutes} min`
              : 'Origin depot'}
            {hoveredStop.stop.weightKg ? ` · ${hoveredStop.stop.weightKg} kg` : ''}
          </p>
        </div>
      )}

      {/* Map Legend */}
      <div className="absolute bottom-3 right-3 rounded-lg border border-sky-200/80 dark:border-sky-900/70 bg-white/90 dark:bg-[#071A2E]/90 backdrop-blur-sm px-3 py-1.5 flex items-center gap-3 text-[11px] text-slate-700 dark:text-sky-100/85">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-700" /> Depot (D)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: accent.pinBg }} /> Pickups
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-teal-700" /> Facility (F)
        </span>
      </div>
    </div>
  );
};

interface OptimizerRouteMapProps {
  assignments: VehicleAssignment[];
  objective: OptimizationObjective;
  selectedRouteIndex: number;
  onSelectRouteIndex: (idx: number) => void;
}

export const OptimizerRouteMap: React.FC<OptimizerRouteMapProps> = ({
  assignments,
  objective,
  selectedRouteIndex,
  onSelectRouteIndex,
}) => {
  const [mapsApiKey, setMapsApiKey] = useState<string>(INITIAL_MAPS_API_KEY);
  const [mapFailed, setMapFailed] = useState(false);

  useEffect(() => {
    if (mapsApiKey) return;
    let mounted = true;
    apiFetch<{ apiKey?: string }>('/api/config/maps', {}, false)
      .then((cfg) => {
        if (mounted && cfg?.apiKey) setMapsApiKey(cfg.apiKey);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [mapsApiKey]);

  const safeIdx =
    selectedRouteIndex >= 0 && selectedRouteIndex < assignments.length ? selectedRouteIndex : 0;
  const activeRoute = assignments[safeIdx];
  const accent = OBJECTIVE_ACCENT[objective];

  const defaultCenter = useMemo(() => {
    if (activeRoute && activeRoute.stops.length > 0) {
      return { lat: activeRoute.stops[0].lat, lng: activeRoute.stops[0].lng };
    }
    return { lat: 28.58, lng: 77.22 };
  }, [activeRoute]);

  if (assignments.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-sky-200/80 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] overflow-hidden">
      {/* Header Bar + Route Tabs */}
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-sky-900/60 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0"
            style={{ backgroundColor: accent.pinBg }}
          >
            <Navigation className="w-4 h-4" />
          </span>
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50">
              Highlighted Optimized Route Map · {accent.label}
            </h4>
            <p className="text-xs text-slate-500 dark:text-sky-200/70">
              Click any route tab or vehicle card below to highlight its computed road path and stops.
            </p>
          </div>
        </div>

        {/* Route Selector Buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          {assignments.map((a, idx) => {
            const active = idx === safeIdx;
            return (
              <button
                key={`${a.vehicleId}-${idx}`}
                type="button"
                onClick={() => onSelectRouteIndex(idx)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-[#061526] text-slate-600 dark:text-sky-200/75 hover:text-slate-900 dark:hover:text-white'
                }`}
                style={active ? { backgroundColor: accent.pinBg } : undefined}
              >
                <Truck className="w-3.5 h-3.5" />
                <span>
                  Route {idx + 1}: {a.registrationNo}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Map Viewport */}
      <div className="relative w-full h-[340px]">
        {mapsApiKey && !mapFailed ? (
          <APIProvider
            apiKey={mapsApiKey}
            onError={() => setMapFailed(true)}
          >
            <GoogleMap
              defaultCenter={defaultCenter}
              defaultZoom={11}
              mapId="reboot-earth-optimizer-route-map"
              gestureHandling="cooperative"
              disableDefaultUI={false}
              className="w-full h-full"
            >
              <GoogleRouteInner
                assignments={assignments}
                selectedIdx={safeIdx}
                objective={objective}
                onSelectRoute={onSelectRouteIndex}
              />
            </GoogleMap>
          </APIProvider>
        ) : (
          <ProjectedRouteSvgMap
            assignments={assignments}
            selectedIdx={safeIdx}
            objective={objective}
            onSelectRoute={onSelectRouteIndex}
          />
        )}
      </div>

      {/* Active Route Summary Strip */}
      {activeRoute && (
        <div className="px-5 py-3 bg-slate-50/90 dark:bg-[#061526] border-t border-slate-200 dark:border-sky-900/60 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2 text-slate-700 dark:text-sky-100">
            <MapPin className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
            <span className="font-semibold">{activeRoute.registrationNo}</span>
            <span className="text-slate-400" aria-hidden="true">·</span>
            <span>{activeRoute.fuelType}</span>
            <span className="text-slate-400" aria-hidden="true">·</span>
            <span>
              {activeRoute.requestCodes.length} pickup{activeRoute.requestCodes.length === 1 ? '' : 's'} → {activeRoute.facilityName}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums text-slate-800 dark:text-sky-100">
            <span className="inline-flex items-center gap-1">
              <Route className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              {activeRoute.routeDistanceKm} km
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              {formatDuration(activeRoute.estimatedTravelMinutes)}
            </span>
            <span className="inline-flex items-center gap-1">
              <IndianRupee className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              ₹{activeRoute.estimatedCostInr.toLocaleString()}
            </span>
            <span className="inline-flex items-center gap-1">
              <Leaf className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              {activeRoute.estimatedEmissionsKg} kg CO₂e
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
