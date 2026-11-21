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
  Compass,
  ExternalLink,
  Loader2,
  MapPin,
  Navigation,
  Search,
  Sparkles,
  Star,
} from 'lucide-react';
import type { Facility, FacilityReview } from '../types';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  fetchPublicFacilityReviews,
  subscribePublicFacilityReviews,
} from '../lib/firebase';
import { FacilityRating } from './FacilityRating';

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

interface DiscoveredPlace {
  id: string;
  displayName: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  googleMapsURI?: string;
}

interface FacilityMapProps {
  facilities: Facility[];
  selectedFacilityId?: number | null;
  onSelectFacility?: (facility: Facility) => void;
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

function MapInner({
  facilities,
  selectedFacility,
  onSelectFacility,
  userPos,
  discoveredPlaces,
  routeTarget,
  onRouteInfo,
  ratingSummaryByFacility,
}: {
  facilities: Facility[];
  selectedFacility: Facility | null;
  onSelectFacility: (f: Facility | null) => void;
  userPos: { lat: number; lng: number } | null;
  discoveredPlaces: DiscoveredPlace[];
  routeTarget: { lat: number; lng: number; name: string } | null;
  onRouteInfo: (info: string | null) => void;
  ratingSummaryByFacility: Record<number, { avg: number; count: number }>;
}) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes') as any;
  const [selectedDiscovered, setSelectedDiscovered] = useState<DiscoveredPlace | null>(null);

  useEffect(() => {
    if (!map || !selectedFacility) return;
    map.panTo({ lat: selectedFacility.lat, lng: selectedFacility.lng });
  }, [map, selectedFacility]);

  // Modern Routes API (Route.computeRoutes) — zero legacy DirectionsService
  useEffect(() => {
    if (!map || !routesLib || !routeTarget) return;
    let active = true;
    const polylines: { setMap: (m: any) => void }[] = [];

    const origin = userPos || { lat: 28.6139, lng: 77.209 };

    async function computeModernRoute() {
      try {
        if (routesLib.Route && typeof routesLib.Route.computeRoutes === 'function') {
          const { routes } = await routesLib.Route.computeRoutes({
            origin,
            destination: { lat: routeTarget!.lat, lng: routeTarget!.lng },
            travelMode: 'DRIVING',
            fields: ['path', 'distanceMeters', 'durationMillis'],
          });
          if (!active) return;
          const route = routes?.[0];
          if (route && typeof route.createPolylines === 'function') {
            const lines: { setMap: (m: any) => void }[] = route.createPolylines({
              polylineOptions: {
                strokeColor: '#10B981',
                strokeWeight: 5,
                strokeOpacity: 0.9,
              },
            });
            lines.forEach((l) => {
              l.setMap(map);
              polylines.push(l);
            });
            const km = route.distanceMeters ? (route.distanceMeters / 1000).toFixed(1) : '?';
            const mins = route.durationMillis ? Math.round(route.durationMillis / 60000) : '?';
            onRouteInfo(`Road route to ${routeTarget!.name}: ${km} km (~${mins} min)`);
          }
        }
      } catch (err: any) {
        const msg = String(err?.message || err);
        if (msg.includes('OVER_QUERY_LIMIT') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        onRouteInfo(
          `Direct distance estimate to ${routeTarget!.name}: ${haversineKm(
            origin.lat,
            origin.lng,
            routeTarget!.lat,
            routeTarget!.lng
          ).toFixed(1)} km (open Google Maps for live turn-by-turn navigation)`
        );
      }
    }

    void computeModernRoute();
    return () => {
      active = false;
      polylines.forEach((p) => p.setMap(null));
    };
  }, [map, routesLib, routeTarget, userPos, onRouteInfo]);

  return (
    <>
      {userPos && (
        <AdvancedMarker position={userPos} title="Your Location">
          <Pin background="#0EA5E9" borderColor="#E0F2FE" glyphColor="#FFFFFF" />
        </AdvancedMarker>
      )}

      {facilities.map((facility) => (
        <AdvancedMarker
          key={`fac-${facility.id}`}
          position={{ lat: facility.lat, lng: facility.lng }}
          title={facility.name}
          onClick={() => {
            setSelectedDiscovered(null);
            onSelectFacility(facility);
          }}
        >
          <Pin
            background={facility.verified ? '#10B981' : '#F59E0B'}
            borderColor="#04100C"
            glyphColor="#04100C"
          />
        </AdvancedMarker>
      ))}

      {discoveredPlaces.map((place) => (
        <AdvancedMarker
          key={`place-${place.id}`}
          position={{ lat: place.lat, lng: place.lng }}
          title={place.displayName}
          onClick={() => {
            onSelectFacility(null);
            setSelectedDiscovered(place);
          }}
        >
          <Pin background="#34D399" borderColor="#064E3B" glyphColor="#04100C" />
        </AdvancedMarker>
      ))}

      {selectedFacility && (
        <InfoWindow
          position={{ lat: selectedFacility.lat, lng: selectedFacility.lng }}
          onCloseClick={() => onSelectFacility(null)}
        >
          <div className="text-slate-900 max-w-xs p-1 space-y-1.5">
            <h4 className="font-semibold text-sm">{selectedFacility.name}</h4>
            <p className="text-xs text-slate-600">{selectedFacility.address}</p>
            <p className="text-xs text-slate-700">
              Type: {selectedFacility.facilityType.replace('_', ' ')} · {selectedFacility.operatingHours}
            </p>
            <p className="text-xs text-emerald-800 font-medium">
              {selectedFacility.verified ? 'Verified Network Partner' : 'Pending Verification'}
            </p>
            {selectedFacility.verified && (
              <p className="text-[11px] text-amber-700 font-medium">
                {ratingSummaryByFacility[selectedFacility.id]
                  ? `★ ${ratingSummaryByFacility[selectedFacility.id].avg.toFixed(1)} (${ratingSummaryByFacility[selectedFacility.id].count} review${ratingSummaryByFacility[selectedFacility.id].count === 1 ? '' : 's'})`
                  : 'Verified centre — be the first to rate below'}
              </p>
            )}
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${selectedFacility.lat},${selectedFacility.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline pt-1"
            >
              Open Directions in Google Maps
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </InfoWindow>
      )}

      {selectedDiscovered && (
        <InfoWindow
          position={{ lat: selectedDiscovered.lat, lng: selectedDiscovered.lng }}
          onCloseClick={() => setSelectedDiscovered(null)}
        >
          <div className="text-slate-900 max-w-xs p-1 space-y-1.5">
            <h4 className="font-semibold text-sm">{selectedDiscovered.displayName}</h4>
            <p className="text-xs text-slate-600">{selectedDiscovered.formattedAddress}</p>
            <p className="text-[11px] text-slate-500">Live result via Google Maps Places API</p>
            {selectedDiscovered.googleMapsURI && (
              <a
                href={selectedDiscovered.googleMapsURI}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
              >
                View on Google Maps
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </InfoWindow>
      )}
    </>
  );
}

function PlacesSearchTrigger({
  queryText,
  triggerCount,
  onResults,
  onError,
}: {
  queryText: string;
  triggerCount: number;
  onResults: (places: DiscoveredPlace[]) => void;
  onError: (msg: string | null) => void;
}) {
  const placesLib = useMapsLibrary('places') as any;
  const map = useMap();

  useEffect(() => {
    if (triggerCount === 0 || !placesLib || !queryText.trim()) return;
    let active = true;

    async function searchPlacesNew() {
      onError(null);
      try {
        const PlaceClass = placesLib.Place;
        if (!PlaceClass || typeof PlaceClass.searchByText !== 'function') {
          onError('Places API (New) library is still initializing.');
          return;
        }
        const { places } = await PlaceClass.searchByText({
          textQuery: `${queryText.trim()} e-waste recycling center`,
          fields: ['id', 'displayName', 'formattedAddress', 'location', 'googleMapsURI'],
          maxResultCount: 8,
        });
        if (!active) return;
        const mapped: DiscoveredPlace[] = (places || [])
          .filter((p: any) => p.location)
          .map((p: any) => ({
            id: p.id || Math.random().toString(36).slice(2),
            displayName: p.displayName || 'E-Waste Facility',
            formattedAddress: p.formattedAddress || '',
            lat: typeof p.location.lat === 'function' ? p.location.lat() : p.location.lat,
            lng: typeof p.location.lng === 'function' ? p.location.lng() : p.location.lng,
            googleMapsURI: p.googleMapsURI,
          }));
        onResults(mapped);
        if (mapped.length > 0 && map) {
          map.panTo({ lat: mapped[0].lat, lng: mapped[0].lng });
          map.setZoom(11);
        }
      } catch (err: any) {
        const msg = String(err?.message || err);
        if (msg.includes('OVER_QUERY_LIMIT') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        onError('Unable to fetch live Places results right now. Use AI Maps Grounding or directory search below.');
      }
    }

    void searchPlacesNew();
    return () => {
      active = false;
    };
  }, [triggerCount, placesLib, queryText, map, onResults, onError]);

  return null;
}

export const FacilityMap: React.FC<FacilityMapProps> = ({
  facilities,
  selectedFacilityId,
  onSelectFacility,
}) => {
  const { firebaseUser, authReady } = useAuth();
  const [searchCity, setSearchCity] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [placesTrigger, setPlacesTrigger] = useState(0);
  const [discoveredPlaces, setDiscoveredPlaces] = useState<DiscoveredPlace[]>([]);
  const [placesError, setPlacesError] = useState<string | null>(null);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [activeFacility, setActiveFacility] = useState<Facility | null>(null);
  const [routeTarget, setRouteTarget] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [routeInfo, setRouteInfo] = useState<string | null>(null);

  // Community Ratings & Reviews live summary feed
  const [allReviews, setAllReviews] = useState<FacilityReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);

  // Gemini Google Maps Grounding state
  const [groundingQuery, setGroundingQuery] = useState('');
  const [groundingLoading, setGroundingLoading] = useState(false);
  const [groundingResult, setGroundingResult] = useState<{
    answer: string;
    places: { title: string; uri: string; snippet?: string }[];
  } | null>(null);
  const [groundingError, setGroundingError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedFacilityId) {
      const found = facilities.find((f) => f.id === selectedFacilityId) || null;
      setActiveFacility(found);
    } else if (!activeFacility && facilities.length > 0) {
      const firstVerified = facilities.find((f) => f.verified) || facilities[0];
      setActiveFacility(firstVerified);
    }
  }, [selectedFacilityId, facilities, activeFacility]);

  // Load community reviews: realtime onSnapshot when signed in, one-time getDocs when signed out
  useEffect(() => {
    if (!authReady) return;
    let active = true;
    let unsub: (() => void) | undefined;

    if (firebaseUser) {
      setReviewsLoading(true);
      try {
        unsub = subscribePublicFacilityReviews((items) => {
          if (!active) return;
          setAllReviews(items);
          setReviewsLoading(false);
        });
      } catch (err) {
        console.error('Review subscription error:', err);
        setReviewsLoading(false);
      }
    } else {
      setReviewsLoading(true);
      void fetchPublicFacilityReviews()
        .then((items) => {
          if (active) setAllReviews(items);
        })
        .catch((err) => {
          console.error('Public review load error:', err);
        })
        .finally(() => {
          if (active) setReviewsLoading(false);
        });
    }

    return () => {
      active = false;
      unsub?.();
    };
  }, [authReady, firebaseUser]);

  const ratingSummaryByFacility = useMemo(() => {
    const acc: Record<number, { total: number; count: number }> = {};
    for (const r of allReviews) {
      if (!acc[r.facilityId]) acc[r.facilityId] = { total: 0, count: 0 };
      acc[r.facilityId].total += r.rating;
      acc[r.facilityId].count += 1;
    }
    const summary: Record<number, { avg: number; count: number }> = {};
    for (const [idStr, v] of Object.entries(acc)) {
      summary[Number(idStr)] = { avg: v.total / v.count, count: v.count };
    }
    return summary;
  }, [allReviews]);

  const activeFacilityReviews = useMemo(() => {
    if (!activeFacility) return [];
    return allReviews.filter((r) => r.facilityId === activeFacility.id);
  }, [allReviews, activeFacility]);

  const filteredFacilities = useMemo(() => {
    return facilities
      .filter((f) => {
        if (typeFilter !== 'all' && f.facilityType !== typeFilter) return false;
        if (
          categoryFilter !== 'all' &&
          !f.acceptedCategories.toLowerCase().includes(categoryFilter.toLowerCase()) &&
          f.acceptedCategories.toLowerCase() !== 'all'
        ) {
          return false;
        }
        if (searchCity.trim()) {
          const q = searchCity.toLowerCase();
          return (
            f.name.toLowerCase().includes(q) ||
            f.city.toLowerCase().includes(q) ||
            f.state.toLowerCase().includes(q) ||
            f.address.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .map((f) => ({
        ...f,
        distanceKm: userPos ? haversineKm(userPos.lat, userPos.lng, f.lat, f.lng) : null,
      }))
      .sort((a, b) => (a.distanceKm ?? 99999) - (b.distanceKm ?? 99999));
  }, [facilities, typeFilter, categoryFilter, searchCity, userPos]);

  const handleLocateMe = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setPlacesError('Location permission denied. Enter a city name to search.');
      }
    );
  };

  const handleMapsGrounding = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = groundingQuery.trim() || `Authorized e-waste recycling centres near ${searchCity || 'New Delhi'}`;
    setGroundingLoading(true);
    setGroundingError(null);
    try {
      const res = await apiFetch<{
        answer: string;
        places: { title: string; uri: string; snippet?: string }[];
      }>(
        '/api/ai/maps-grounding',
        {
          method: 'POST',
          body: JSON.stringify({
            query: q,
            lat: userPos?.lat,
            lng: userPos?.lng,
          }),
        },
        false
      );
      setGroundingResult(res);
    } catch (err: any) {
      setGroundingError(err?.message || 'Unable to run Google Maps grounded search.');
    } finally {
      setGroundingLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search & Filter Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-5 relative">
          <Search className="w-4 h-4 text-emerald-600 dark:text-emerald-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchCity}
            onChange={(e) => setSearchCity(e.target.value)}
            placeholder="Search by city, address, or facility name (e.g., Delhi, Noida, Bengaluru)"
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-white dark:bg-[#081C15] text-slate-900 dark:text-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="lg:col-span-2 px-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-white dark:bg-[#081C15] text-slate-900 dark:text-emerald-50"
        >
          <option value="all">All Facility Types</option>
          <option value="collection_centre">Collection Centres</option>
          <option value="recycler">Recyclers</option>
          <option value="refurbisher">Refurbishers</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="lg:col-span-2 px-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-white dark:bg-[#081C15] text-slate-900 dark:text-emerald-50"
        >
          <option value="all">All Waste Categories</option>
          <option value="IT & Telecom">IT &amp; Telecom</option>
          <option value="Consumer Electronics">Consumer Electronics</option>
          <option value="Large Appliances">Large Appliances</option>
          <option value="Batteries & Power">Batteries &amp; Power</option>
          <option value="PCB & Components">PCB &amp; Components</option>
        </select>
        <div className="lg:col-span-3 flex gap-2">
          <button
            type="button"
            onClick={() => setPlacesTrigger((c) => c + 1)}
            disabled={!MAPS_API_KEY}
            className="flex-1 px-3 py-2.5 text-xs font-semibold rounded-lg bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950 hover:bg-emerald-700 dark:hover:bg-emerald-400 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            Search Google Maps
          </button>
          <button
            type="button"
            onClick={handleLocateMe}
            title="Use current GPS location"
            className="px-3 py-2.5 rounded-lg border border-slate-300 dark:border-emerald-800 text-slate-700 dark:text-emerald-200 hover:bg-slate-100 dark:hover:bg-emerald-900/40 transition-colors"
          >
            <Compass className="w-4 h-4" />
          </button>
        </div>
      </div>

      {routeInfo && (
        <div className="px-4 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 text-xs text-emerald-900 dark:text-emerald-200 flex items-center justify-between gap-3">
          <span>{routeInfo}</span>
          <button
            type="button"
            onClick={() => {
              setRouteTarget(null);
              setRouteInfo(null);
            }}
            className="underline font-medium whitespace-nowrap"
          >
            Clear Route
          </button>
        </div>
      )}

      {placesError && (
        <p className="text-xs text-amber-700 dark:text-amber-300">{placesError}</p>
      )}

      {/* Map + Directory Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 rounded-xl overflow-hidden border border-slate-200 dark:border-emerald-900/70 bg-slate-100 dark:bg-[#071A14] h-[480px]">
          {MAPS_API_KEY ? (
            <APIProvider apiKey={MAPS_API_KEY} language="en" region="IN">
              <GoogleMap
                style={{ width: '100%', height: '100%' }}
                defaultCenter={{ lat: 28.58, lng: 77.22 }}
                defaultZoom={10}
                mapId="DEMO_MAP_ID"
                gestureHandling="greedy"
                internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              >
                <MapInner
                  facilities={filteredFacilities}
                  selectedFacility={activeFacility}
                  onSelectFacility={(f) => {
                    setActiveFacility(f);
                    if (f && onSelectFacility) onSelectFacility(f);
                  }}
                  userPos={userPos}
                  discoveredPlaces={discoveredPlaces}
                  routeTarget={routeTarget}
                  onRouteInfo={setRouteInfo}
                  ratingSummaryByFacility={ratingSummaryByFacility}
                />
                <PlacesSearchTrigger
                  queryText={searchCity || 'New Delhi'}
                  triggerCount={placesTrigger}
                  onResults={setDiscoveredPlaces}
                  onError={setPlacesError}
                />
              </GoogleMap>
            </APIProvider>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-2">
              <MapPin className="w-8 h-8 text-emerald-500" />
              <p className="text-sm font-medium text-slate-900 dark:text-emerald-50">
                Interactive Google Map requires VITE_GOOGLE_MAPS_API_KEY
              </p>
              <p className="text-xs text-slate-600 dark:text-emerald-200/70 max-w-md">
                Use the verified directory list or AI Google Maps Grounding below to discover e-waste drop-off facilities.
              </p>
            </div>
          )}
        </div>

        {/* Facility Directory List */}
        <div className="lg:col-span-5 h-[480px] overflow-y-auto pr-1 space-y-3">
          {filteredFacilities.length === 0 ? (
            <div className="p-6 rounded-xl border border-slate-200 dark:border-emerald-900/60 text-sm text-slate-600 dark:text-emerald-200/70">
              No network facilities matched your filters. Try clearing filters or searching Google Maps directly.
            </div>
          ) : (
            filteredFacilities.map((f) => {
              const utilPct = Math.min(100, Math.round((f.currentLoadKg / f.capacityKg) * 100));
              const isSelected = activeFacility?.id === f.id;
              return (
                <div
                  key={f.id}
                  onClick={() => {
                    setActiveFacility(f);
                    if (onSelectFacility) onSelectFacility(f);
                  }}
                  className={`p-4 rounded-xl border cursor-pointer transition-colors ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/50'
                      : 'border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#081D16] hover:border-emerald-600/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-semibold text-sm text-slate-900 dark:text-emerald-50">{f.name}</h4>
                    <span className="text-xs font-mono tabular-nums text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                      {f.distanceKm !== null ? `${f.distanceKm.toFixed(1)} km` : f.city}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-emerald-200/65">
                    <span>
                      {f.facilityType.replace('_', ' ')} · {f.verified ? 'Verified' : 'Pending verification'} · {f.operatingHours}
                    </span>
                    {f.verified && (
                      <span className="inline-flex items-center gap-1 font-mono tabular-nums text-amber-600 dark:text-amber-400 font-semibold">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        {ratingSummaryByFacility[f.id]
                          ? `${ratingSummaryByFacility[f.id].avg.toFixed(1)} (${ratingSummaryByFacility[f.id].count})`
                          : 'Rate'}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-slate-700 dark:text-emerald-100/80">{f.address}</p>
                  <p className="mt-1.5 text-xs text-slate-500 dark:text-emerald-200/65">
                    Accepts: {f.acceptedCategories}
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-emerald-200/70 mb-1">
                        <span>Capacity load</span>
                        <span>{f.currentLoadKg.toLocaleString()} / {f.capacityKg.toLocaleString()} kg ({utilPct}%)</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-200 dark:bg-emerald-950 overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${utilPct}%` }} />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRouteTarget({ lat: f.lat, lng: f.lng, name: f.name });
                      }}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-600/10 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-600/20 inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <Navigation className="w-3 h-3" />
                      Route
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Community Ratings & Reviews for Selected Collection Centre */}
      {activeFacility && (
        <FacilityRating
          facility={activeFacility}
          reviews={activeFacilityReviews}
          loading={reviewsLoading}
        />
      )}

      {/* Gemini Google Maps Grounding Explorer */}
      <div className="p-5 rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#081D16] space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-emerald-50 inline-flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-500" />
              Live Google Maps Grounded E-Waste Locator
            </h3>
            <p className="text-xs text-slate-600 dark:text-emerald-200/70 mt-0.5">
              Ask Gemini with real-time Google Maps grounding to find genuine local recycling drop-off points and open links directly in Google Maps.
            </p>
          </div>
        </div>

        <form onSubmit={handleMapsGrounding} className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            value={groundingQuery}
            onChange={(e) => setGroundingQuery(e.target.value)}
            placeholder="e.g., Where can I drop off old laptops and lithium batteries in Pune?"
            className="flex-1 px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
          />
          <button
            type="submit"
            disabled={groundingLoading}
            className="px-4 py-2.5 text-sm font-semibold rounded-lg bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950 hover:bg-emerald-700 dark:hover:bg-emerald-400 disabled:opacity-60 inline-flex items-center justify-center gap-2 whitespace-nowrap"
          >
            {groundingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
            Find Real Places
          </button>
        </form>

        {groundingError && (
          <p className="text-xs text-red-600 dark:text-red-400">{groundingError}</p>
        )}

        {groundingResult && (
          <div className="pt-3 border-t border-slate-200 dark:border-emerald-900/50 space-y-3">
            <div className="text-sm text-slate-700 dark:text-emerald-100/90 whitespace-pre-line leading-relaxed">
              {groundingResult.answer}
            </div>
            {groundingResult.places.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 dark:text-emerald-300/80">
                  Verified Google Maps Sources
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {groundingResult.places.map((p, idx) => (
                    <a
                      key={idx}
                      href={p.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3 rounded-lg border border-slate-200 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] hover:border-emerald-500 transition-colors flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-emerald-100 truncate">
                          {p.title}
                        </p>
                        {p.snippet && (
                          <p className="text-xs text-slate-500 dark:text-emerald-200/65 line-clamp-2 mt-0.5">
                            {p.snippet}
                          </p>
                        )}
                      </div>
                      <ExternalLink className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
