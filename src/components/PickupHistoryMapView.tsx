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
import {
  Building2,
  Calendar,
  CheckCircle2,
  ExternalLink,
  Leaf,
  List,
  Loader2,
  MapPin,
  Maximize2,
  RotateCcw,
  Scale,
} from 'lucide-react';
import type { Facility, PickupRequest } from '../types';
import { apiFetch } from '../lib/api';
import {
  COLLECTED_HISTORY_STATUSES,
  getEmissionFactorForCategory,
} from './CarbonSavedWidget';

const INITIAL_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

function hasValidCoordinates(p: PickupRequest): boolean {
  return (
    Number.isFinite(Number(p.lat)) &&
    Number.isFinite(Number(p.lng)) &&
    Math.abs(Number(p.lat)) <= 90 &&
    Math.abs(Number(p.lng)) <= 180 &&
    !(Number(p.lat) === 0 && Number(p.lng) === 0)
  );
}

interface MapCanvasInnerProps {
  pickups: PickupRequest[];
  selectedPickup: PickupRequest | null;
  onSelectPickup: (pickup: PickupRequest | null) => void;
  fitNonce: number;
  facilityNameById: Record<number, string>;
  getThumbnail: (pickup: PickupRequest) => string;
  onQuickReorder: (pickup: PickupRequest) => void;
  onInspectInList: (pickup: PickupRequest) => void;
}

const MapCanvasInner: React.FC<MapCanvasInnerProps> = ({
  pickups,
  selectedPickup,
  onSelectPickup,
  fitNonce,
  facilityNameById,
  getThumbnail,
  onQuickReorder,
  onInspectInList,
}) => {
  const map = useMap();
  const coreLib = useMapsLibrary('core') as any;

  // Auto-fit bounds to display all plotted successful pickup pins
  useEffect(() => {
    if (!map || !coreLib || pickups.length === 0) return;
    if (pickups.length === 1) {
      map.panTo({ lat: Number(pickups[0].lat), lng: Number(pickups[0].lng) });
      map.setZoom(13);
      return;
    }
    const bounds = new coreLib.LatLngBounds();
    for (const p of pickups) {
      bounds.extend({ lat: Number(p.lat), lng: Number(p.lng) });
    }
    map.fitBounds(bounds, 56);
  }, [map, coreLib, pickups, fitNonce]);

  // Smoothly pan to the selected pickup pin
  useEffect(() => {
    if (!map || !selectedPickup) return;
    map.panTo({ lat: Number(selectedPickup.lat), lng: Number(selectedPickup.lng) });
    const currentZoom = map.getZoom();
    if (typeof currentZoom === 'number' && currentZoom < 12) {
      map.setZoom(13);
    }
  }, [map, selectedPickup]);

  return (
    <>
      {pickups.map((pickup) => {
        const isSelected = selectedPickup?.id === pickup.id;
        const isCompleted = pickup.status === 'Completed';
        return (
          <AdvancedMarker
            key={`history-pin-${pickup.id}`}
            position={{ lat: Number(pickup.lat), lng: Number(pickup.lng) }}
            title={`${pickup.requestCode} — ${pickup.deviceName} (${pickup.estimatedWeightKg} kg)`}
            zIndex={isSelected ? 30 : isCompleted ? 20 : 10}
            onClick={() => onSelectPickup(pickup)}
          >
            <Pin
              background={isSelected ? '#0EA5E9' : isCompleted ? '#059669' : '#0284C7'}
              borderColor={isSelected ? '#FEF08A' : isCompleted ? '#A7F3D0' : '#BAE6FD'}
              glyphColor="#FFFFFF"
              scale={isSelected ? 1.25 : 1.0}
            />
          </AdvancedMarker>
        );
      })}

      {selectedPickup && (
        <InfoWindow
          position={{ lat: Number(selectedPickup.lat), lng: Number(selectedPickup.lng) }}
          onCloseClick={() => onSelectPickup(null)}
        >
          <div className="p-1 max-w-[260px] text-slate-900 space-y-2">
            <div className="flex items-start gap-2.5">
              <img
                src={getThumbnail(selectedPickup)}
                alt={selectedPickup.deviceName}
                className="w-12 h-12 rounded-md object-cover border border-slate-200 shrink-0"
              />
              <div className="min-w-0">
                <p className="font-mono text-[11px] font-bold text-sky-700">
                  {selectedPickup.requestCode}
                </p>
                <p className="text-xs font-bold leading-snug text-slate-900">
                  {selectedPickup.deviceName}
                </p>
                <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                  {selectedPickup.status}
                </span>
              </div>
            </div>

            <div className="text-[11px] text-slate-700 space-y-1">
              <p>
                <strong>Category:</strong> {selectedPickup.category}
              </p>
              <p>
                <strong>Collected:</strong> {selectedPickup.quantity} units ·{' '}
                {selectedPickup.estimatedWeightKg} kg (
                {(
                  Number(selectedPickup.estimatedWeightKg || 0) *
                  getEmissionFactorForCategory(selectedPickup.category).factorKgCo2PerKg
                ).toFixed(1)}{' '}
                kg CO₂e)
              </p>
              <p>
                <strong>Date:</strong> {selectedPickup.preferredDate} · {selectedPickup.timeSlot}
              </p>
              <p className="line-clamp-2">
                <strong>Location:</strong> {selectedPickup.pickupAddress}
              </p>
              {selectedPickup.assignedFacilityId &&
                facilityNameById[selectedPickup.assignedFacilityId] && (
                  <p>
                    <strong>Facility:</strong> {facilityNameById[selectedPickup.assignedFacilityId]}
                  </p>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-200">
              <button
                type="button"
                onClick={() => onQuickReorder(selectedPickup)}
                className="px-2 py-1 rounded text-[11px] font-semibold bg-sky-600 text-white hover:bg-sky-700 cursor-pointer"
              >
                Re-Order
              </button>
              <button
                type="button"
                onClick={() => onInspectInList(selectedPickup)}
                className="px-2 py-1 rounded text-[11px] font-semibold border border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Details
              </button>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${selectedPickup.lat},${selectedPickup.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-[11px] font-medium text-sky-700 hover:underline inline-flex items-center gap-0.5"
              >
                Maps
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

interface PickupHistoryMapViewProps {
  pickups: PickupRequest[];
  facilities: Facility[];
  getThumbnail: (pickup: PickupRequest) => string;
  onQuickReorder: (pickup: PickupRequest) => void;
  onInspectInList: (pickup: PickupRequest) => void;
}

export const PickupHistoryMapView: React.FC<PickupHistoryMapViewProps> = ({
  pickups,
  facilities,
  getThumbnail,
  onQuickReorder,
  onInspectInList,
}) => {
  const [mapsApiKey, setMapsApiKey] = useState(INITIAL_MAPS_API_KEY);
  const [checkingKey, setCheckingKey] = useState(!INITIAL_MAPS_API_KEY);
  const [scope, setScope] = useState<'successful' | 'completed_only'>('successful');
  const [selectedPickupId, setSelectedPickupId] = useState<number | null>(null);
  const [fitNonce, setFitNonce] = useState(0);

  useEffect(() => {
    if (mapsApiKey) return;
    let active = true;
    apiFetch<{ apiKey?: string }>('/api/config/maps', {}, false)
      .then((res) => {
        if (active && res.apiKey) setMapsApiKey(res.apiKey);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setCheckingKey(false);
      });
    return () => {
      active = false;
    };
  }, [mapsApiKey]);

  const facilityNameById = useMemo(() => {
    const dict: Record<number, string> = {};
    for (const f of facilities) {
      dict[f.id] = `${f.name} (${f.city})`;
    }
    return dict;
  }, [facilities]);

  const mappedPickups = useMemo(() => {
    return pickups.filter((p) => {
      if (!hasValidCoordinates(p)) return false;
      if (scope === 'completed_only') return p.status === 'Completed';
      return COLLECTED_HISTORY_STATUSES.has(p.status);
    });
  }, [pickups, scope]);

  const selectedPickup = useMemo(
    () => mappedPickups.find((p) => p.id === selectedPickupId) || null,
    [mappedPickups, selectedPickupId]
  );

  const summary = useMemo(() => {
    let totalWeightKg = 0;
    let totalCo2Kg = 0;
    for (const p of mappedPickups) {
      const w = Math.max(0, Number(p.estimatedWeightKg) || 0);
      totalWeightKg += w;
      totalCo2Kg += w * getEmissionFactorForCategory(p.category).factorKgCo2PerKg;
    }
    return {
      count: mappedPickups.length,
      totalWeightKg: Number(totalWeightKg.toFixed(1)),
      totalCo2Kg: Number(totalCo2Kg.toFixed(1)),
    };
  }, [mappedPickups]);

  const defaultCenter = useMemo(() => {
    if (mappedPickups.length > 0) {
      return {
        lat: Number(mappedPickups[0].lat),
        lng: Number(mappedPickups[0].lng),
      };
    }
    return { lat: 28.6139, lng: 77.209 };
  }, [mappedPickups]);

  return (
    <div className="space-y-4">
      {/* Map Controls & Scope Bar */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="inline-flex items-center gap-1.5 font-semibold text-slate-900 dark:text-sky-50">
            <MapPin className="w-4 h-4 text-emerald-500" />
            <span>
              {summary.count} Successful Pickup Location{summary.count === 1 ? '' : 's'}
            </span>
          </div>
          <span className="hidden sm:inline text-slate-300 dark:text-sky-800">|</span>
          <span className="inline-flex items-center gap-1 text-slate-600 dark:text-sky-200/80 font-mono tabular-nums">
            <Scale className="w-3.5 h-3.5 text-sky-500" />
            {summary.totalWeightKg.toLocaleString()} kg
          </span>
          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 font-mono tabular-nums font-semibold">
            <Leaf className="w-3.5 h-3.5" />
            {summary.totalCo2Kg.toLocaleString()} kg CO₂e saved
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-sky-900/70 p-0.5 bg-slate-50 dark:bg-[#061526] text-[11px]">
            <button
              type="button"
              onClick={() => setScope('successful')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                scope === 'successful'
                  ? 'bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950'
                  : 'text-slate-600 dark:text-sky-200/75 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All Collected &amp; Completed
            </button>
            <button
              type="button"
              onClick={() => setScope('completed_only')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                scope === 'completed_only'
                  ? 'bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950'
                  : 'text-slate-600 dark:text-sky-200/75 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Completed Only
            </button>
          </div>

          <button
            type="button"
            disabled={mappedPickups.length === 0}
            onClick={() => {
              setSelectedPickupId(null);
              setFitNonce((n) => n + 1);
            }}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-sky-800 text-[11px] font-medium text-slate-700 dark:text-sky-200 hover:border-sky-500 disabled:opacity-50 inline-flex items-center gap-1 cursor-pointer"
          >
            <Maximize2 className="w-3 h-3" />
            Fit All Pins
          </button>
        </div>
      </div>

      {/* Unified Map + Synchronized Location Directory */}
      {mappedPickups.length === 0 ? (
        <div className="p-10 rounded-xl border border-dashed border-slate-300 dark:border-sky-900/70 bg-white dark:bg-[#0B223B] text-center space-y-2">
          <MapPin className="w-8 h-8 text-slate-400 dark:text-sky-400/50 mx-auto" />
          <p className="text-sm font-semibold text-slate-900 dark:text-sky-50">
            No successful pickup locations match your current filters
          </p>
          <p className="text-xs text-slate-500 dark:text-sky-200/70 max-w-md mx-auto">
            Completed and collected e-waste pickups with GPS coordinates automatically appear on this unified map. Try switching to &ldquo;All Collected &amp; Completed&rdquo; or clearing search/category filters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* Interactive Google Map */}
          <div className="lg:col-span-8 rounded-xl overflow-hidden border border-slate-200 dark:border-sky-900/70 bg-slate-100 dark:bg-[#091E36] h-[480px] relative">
            {mapsApiKey ? (
              <APIProvider apiKey={mapsApiKey} language="en" region="IN">
                <GoogleMap
                  style={{ width: '100%', height: '100%' }}
                  defaultCenter={defaultCenter}
                  defaultZoom={11}
                  mapId="DEMO_MAP_ID"
                  gestureHandling="greedy"
                  internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                >
                  <MapCanvasInner
                    pickups={mappedPickups}
                    selectedPickup={selectedPickup}
                    onSelectPickup={(p) => setSelectedPickupId(p ? p.id : null)}
                    fitNonce={fitNonce}
                    facilityNameById={facilityNameById}
                    getThumbnail={getThumbnail}
                    onQuickReorder={onQuickReorder}
                    onInspectInList={onInspectInList}
                  />
                </GoogleMap>
              </APIProvider>
            ) : checkingKey ? (
              <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-2">
                <Loader2 className="w-7 h-7 text-sky-500 animate-spin" />
                <p className="text-sm font-medium text-slate-900 dark:text-sky-50">
                  Loading pickup history map...
                </p>
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-2">
                <MapPin className="w-8 h-8 text-sky-500" />
                <p className="text-sm font-semibold text-slate-900 dark:text-sky-50">
                  Interactive Map Unavailable
                </p>
                <p className="text-xs text-slate-600 dark:text-sky-200/75 max-w-sm">
                  Configure your Google Maps API key to render the live map canvas. You can still browse all {mappedPickups.length} geolocated pickups on the right.
                </p>
              </div>
            )}

            {/* Map Legend Overlay */}
            <div className="absolute bottom-3 left-3 z-10 px-3 py-1.5 rounded-lg bg-white/95 dark:bg-[#071A2E]/95 border border-slate-200 dark:border-sky-800 shadow-sm flex items-center gap-3 text-[11px] text-slate-700 dark:text-sky-100">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" />
                Completed
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-600 inline-block" />
                Collected / Processing
              </span>
            </div>
          </div>

          {/* Synchronized Side Location List */}
          <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] flex flex-col h-[480px] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-sky-900/60 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-900 dark:text-sky-50">
                Plotted Pickups ({mappedPickups.length})
              </p>
              <span className="text-[11px] text-slate-500 dark:text-sky-200/65">
                Click to locate pin
              </span>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-200 dark:divide-sky-900/50">
              {mappedPickups.map((pickup) => {
                const active = selectedPickupId === pickup.id;
                const facilityName = pickup.assignedFacilityId
                  ? facilityNameById[pickup.assignedFacilityId]
                  : undefined;

                return (
                  <div
                    key={pickup.id}
                    onClick={() => setSelectedPickupId(pickup.id)}
                    className={`p-3.5 transition-colors cursor-pointer space-y-2 ${
                      active
                        ? 'bg-sky-50/90 dark:bg-sky-900/40'
                        : 'hover:bg-slate-50 dark:hover:bg-[#071A2E]'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <img
                        src={getThumbnail(pickup)}
                        alt={pickup.deviceName}
                        className="w-11 h-11 rounded-lg object-cover border border-slate-200 dark:border-sky-900/70 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="font-mono text-[11px] font-semibold text-sky-700 dark:text-sky-400">
                            {pickup.requestCode}
                          </span>
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded inline-flex items-center gap-1 ${
                              pickup.status === 'Completed'
                                ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                                : 'bg-cyan-500/12 text-cyan-700 dark:text-cyan-300'
                            }`}
                          >
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            {pickup.status}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-slate-900 dark:text-sky-50 truncate mt-0.5">
                          {pickup.deviceName}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-sky-200/70 truncate">
                          {pickup.pickupAddress}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-sky-200/65">
                      <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                        <Calendar className="w-3 h-3 text-sky-500" />
                        {pickup.preferredDate} · {pickup.estimatedWeightKg} kg
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onQuickReorder(pickup);
                          }}
                          className="px-2 py-1 rounded text-[10px] font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 hover:bg-sky-700 dark:hover:bg-sky-400 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                          Re-Order
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onInspectInList(pickup);
                          }}
                          className="px-2 py-1 rounded text-[10px] font-medium border border-slate-200 dark:border-sky-800 text-slate-600 dark:text-sky-200 hover:border-sky-500 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <List className="w-2.5 h-2.5" />
                          Log
                        </button>
                      </div>
                    </div>

                    {facilityName && (
                      <p className="text-[10px] text-slate-500 dark:text-sky-300/65 inline-flex items-center gap-1 truncate max-w-full">
                        <Building2 className="w-3 h-3 text-sky-500 shrink-0" />
                        <span className="truncate">{facilityName}</span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
