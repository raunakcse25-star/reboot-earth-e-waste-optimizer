import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Cable,
  CheckCircle2,
  Cpu,
  Edit3,
  Fan,
  Gift,
  HardDrive,
  Inbox,
  Keyboard,
  Loader2,
  MapPin,
  Monitor,
  Package,
  Plus,
  Recycle,
  Repeat,
  Search,
  Send,
  Sparkles,
  Trash2,
  UserCheck,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  createMarketplaceListing,
  createMarketplaceRequest,
  deleteMarketplaceListing,
  subscribeMarketplaceListings,
  subscribeUserMarketplaceRequests,
  updateMarketplaceListingDetails,
  updateMarketplaceListingStatus,
  updateMarketplaceRequestStatus,
} from '../lib/firebase';
import {
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_CONDITIONS,
  MARKETPLACE_HANDOFF_METHODS,
  type MarketplaceComponentCategory,
  type MarketplaceCondition,
  type MarketplaceHandoffMethod,
  type MarketplaceListing,
  type MarketplaceListingType,
  type MarketplaceRequest,
  type PickupRequest,
} from '../types';

interface CircularMarketplaceProps {
  pickups: PickupRequest[];
}

interface QuickSalvageTemplate {
  label: string;
  title: string;
  componentCategory: MarketplaceComponentCategory;
  listingType: MarketplaceListingType;
  condition: MarketplaceCondition;
  quantity: number;
  estimatedWeightKg: number;
  salvagedFrom: string;
  tradePreference: string;
  description: string;
}

const SALVAGE_TEMPLATES: QuickSalvageTemplate[] = [
  {
    label: '65W USB-C Charger',
    title: '65W USB-C PD Laptop Charger (Tested)',
    componentCategory: 'Chargers & Power',
    listingType: 'Donate',
    condition: 'Tested Working',
    quantity: 1,
    estimatedWeightKg: 0.35,
    salvagedFrom: 'Retired office ultrabook lot',
    tradePreference: 'Free for students or repair hobbyists',
    description:
      'Original 65W USB-C power brick salvaged before laptop recycling. Output voltage tested stable across 5V/9V/15V/20V profiles; cable insulation fully intact.',
  },
  {
    label: 'Braided HDMI + DP Cables',
    title: 'Bundle of 3 Tested HDMI & DisplayPort Cables (1.8m)',
    componentCategory: 'Cables & Adapters',
    listingType: 'Trade',
    condition: 'Like New',
    quantity: 3,
    estimatedWeightKg: 0.45,
    salvagedFrom: 'Decommissioned studio monitors',
    tradePreference: 'Looking for USB-C to Ethernet adapter or SATA data cables',
    description:
      'Three gold-plated display cables (2x HDMI 2.0, 1x DisplayPort 1.4) cleaned and continuity-tested at 4K 60Hz with zero signal flicker.',
  },
  {
    label: '8GB DDR4 SO-DIMM RAM',
    title: '8GB DDR4-2666 Laptop SO-DIMM Memory Module',
    componentCategory: 'RAM & Storage',
    listingType: 'Trade',
    condition: 'Tested Working',
    quantity: 1,
    estimatedWeightKg: 0.1,
    salvagedFrom: 'Non-working laptop motherboard (screen/chassis damaged)',
    tradePreference: 'Open to trading for a 2.5" SATA SSD enclosure or 120mm PWM fan',
    description:
      'Passed 2 full MemTest86 passes with zero errors. Stored in an anti-static sleeve ready for reuse in an upgrade or community repair project.',
  },
  {
    label: '120mm Cooling Fan',
    title: '120mm 4-Pin PWM Brushless Case Fan',
    componentCategory: 'Fans & Thermal',
    listingType: 'Donate',
    condition: 'Tested Working',
    quantity: 2,
    estimatedWeightKg: 0.3,
    salvagedFrom: 'Retired desktop workstation tower',
    tradePreference: 'Free donation to local makers or refurbishers',
    description:
      'Quiet 12V DC brushless fans dusted and tested at full and low PWM duty cycles. Smooth bearing operation with intact 4-pin header.',
  },
];

function getCategoryIcon(category: MarketplaceComponentCategory) {
  switch (category) {
    case 'Cables & Adapters':
      return Cable;
    case 'Chargers & Power':
      return Zap;
    case 'RAM & Storage':
      return HardDrive;
    case 'Fans & Thermal':
      return Fan;
    case 'Displays & Panels':
      return Monitor;
    case 'Peripherals':
      return Keyboard;
    case 'Networking & Audio':
      return Wifi;
    default:
      return Cpu;
  }
}

function formatFirestoreTime(ts: any): string {
  const millis = ts?.toMillis?.();
  if (!millis) return 'Just now';
  const d = new Date(millis);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function parseFriendlyFirestoreError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('permission-denied') || raw.includes('PERMISSION_DENIED')) {
    return 'Permission denied. Please ensure you are signed in with a verified email account (such as Google Sign-In) and try again.';
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error) {
      if (String(parsed.error).includes('permission-denied')) {
        return 'Permission denied. Please verify your email or sign in with Google to publish and exchange items.';
      }
      return String(parsed.error);
    }
  } catch {
    // Plain error string
  }
  return raw || fallback;
}

export const CircularMarketplace: React.FC<CircularMarketplaceProps> = ({ pickups }) => {
  const { firebaseUser, dbUser, firestoreProfile, pushNotification } = useAuth();
  const currentUid = firebaseUser?.uid || '';
  const currentUserName =
    dbUser?.fullName ||
    firestoreProfile?.fullName ||
    firebaseUser?.displayName ||
    firebaseUser?.email?.split('@')[0] ||
    'Community Member';
  const defaultCity = firestoreProfile?.city || dbUser?.city || '';

  const [subTab, setSubTab] = useState<'browse' | 'my_listings' | 'requests'>('browse');
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [requests, setRequests] = useState<MarketplaceRequest[]>([]);
  const [loadingListings, setLoadingListings] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Browse filters
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'Donate' | 'Trade'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'Available' | 'all' | 'Completed'>('Available');

  // Create / Edit Listing Modal State
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingListing, setEditingListing] = useState<MarketplaceListing | null>(null);
  const [title, setTitle] = useState('');
  const [componentCategory, setComponentCategory] =
    useState<MarketplaceComponentCategory>('Chargers & Power');
  const [listingType, setListingType] = useState<MarketplaceListingType>('Donate');
  const [condition, setCondition] = useState<MarketplaceCondition>('Tested Working');
  const [quantity, setQuantity] = useState<number>(1);
  const [estimatedWeightKg, setEstimatedWeightKg] = useState<number>(0.4);
  const [salvagedFrom, setSalvagedFrom] = useState('');
  const [tradePreference, setTradePreference] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState(defaultCity);
  const [handoffMethod, setHandoffMethod] = useState<MarketplaceHandoffMethod>('Local Pickup');
  const [submittingListing, setSubmittingListing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Claim / Trade Offer Modal State
  const [claimTarget, setClaimTarget] = useState<MarketplaceListing | null>(null);
  const [offerItem, setOfferItem] = useState('');
  const [claimMessage, setClaimMessage] = useState('');
  const [contactNote, setContactNote] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  // Busy indicator for request/listing actions
  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUid) {
      setLoadingListings(false);
      return;
    }
    setLoadingListings(true);
    setSyncError(null);

    const unsubListings = subscribeMarketplaceListings(
      (items) => {
        setListings(items);
        setLoadingListings(false);
      },
      (err) => {
        setSyncError(parseFriendlyFirestoreError(err, 'Unable to load community marketplace listings.'));
        setLoadingListings(false);
      }
    );

    const unsubRequests = subscribeUserMarketplaceRequests(
      currentUid,
      (items) => setRequests(items),
      () => {}
    );

    return () => {
      unsubListings();
      unsubRequests();
    };
  }, [currentUid]);

  // Extract unique past pickup devices so users can quickly list salvaged accessories/parts from them
  const salvageableFromHistory = useMemo(() => {
    const seen = new Set<string>();
    const list: PickupRequest[] = [];
    for (const p of pickups) {
      if (p.status === 'Cancelled') continue;
      const key = p.deviceName.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      list.push(p);
      if (list.length >= 4) break;
    }
    return list;
  }, [pickups]);

  const myListings = useMemo(
    () => listings.filter((l) => l.ownerId === currentUid),
    [listings, currentUid]
  );

  const incomingRequests = useMemo(
    () => requests.filter((r) => r.ownerId === currentUid),
    [requests, currentUid]
  );

  const outgoingRequests = useMemo(
    () => requests.filter((r) => r.requesterId === currentUid),
    [requests, currentUid]
  );

  const pendingIncomingCount = useMemo(
    () => incomingRequests.filter((r) => r.status === 'Pending').length,
    [incomingRequests]
  );

  const activeOutgoingByListingId = useMemo(() => {
    const map = new Map<string, MarketplaceRequest>();
    for (const req of outgoingRequests) {
      if (req.status === 'Pending' || req.status === 'Accepted') {
        map.set(req.listingId, req);
      }
    }
    return map;
  }, [outgoingRequests]);

  const filteredListings = useMemo(() => {
    return listings.filter((item) => {
      if (statusFilter === 'Available' && item.status !== 'Available') return false;
      if (statusFilter === 'Completed' && item.status !== 'Completed') return false;
      if (typeFilter !== 'all' && item.listingType !== typeFilter) return false;
      if (categoryFilter !== 'all' && item.componentCategory !== categoryFilter) return false;
      if (searchText.trim()) {
        const q = searchText.toLowerCase();
        return (
          item.title.toLowerCase().includes(q) ||
          item.componentCategory.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.salvagedFrom.toLowerCase().includes(q) ||
          item.city.toLowerCase().includes(q) ||
          item.ownerName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [listings, statusFilter, typeFilter, categoryFilter, searchText]);

  const stats = useMemo(() => {
    const available = listings.filter((l) => l.status === 'Available');
    const donations = available.filter((l) => l.listingType === 'Donate').length;
    const trades = available.filter((l) => l.listingType === 'Trade').length;
    const totalCirculatedKg = listings.reduce(
      (sum, l) => sum + (Number(l.estimatedWeightKg) || 0),
      0
    );
    const completedExchanges = listings.filter((l) => l.status === 'Completed').length;
    return {
      availableCount: available.length,
      donations,
      trades,
      totalCirculatedKg: Number(totalCirculatedKg.toFixed(1)),
      completedExchanges,
    };
  }, [listings]);

  const showToast = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 4500);
  };

  const openCreateModal = (template?: QuickSalvageTemplate, fromPickup?: PickupRequest) => {
    setEditingListing(null);
    setFormError(null);
    if (template) {
      setTitle(template.title);
      setComponentCategory(template.componentCategory);
      setListingType(template.listingType);
      setCondition(template.condition);
      setQuantity(template.quantity);
      setEstimatedWeightKg(template.estimatedWeightKg);
      setSalvagedFrom(template.salvagedFrom);
      setTradePreference(template.tradePreference);
      setDescription(template.description);
    } else if (fromPickup) {
      setTitle(`Working Power Adapter & Cables from ${fromPickup.deviceName}`.slice(0, 120));
      setComponentCategory('Cables & Adapters');
      setListingType('Donate');
      setCondition('Tested Working');
      setQuantity(1);
      setEstimatedWeightKg(0.4);
      setSalvagedFrom(`${fromPickup.deviceName} (${fromPickup.requestCode})`);
      setTradePreference('Free to community members or open to cable swap');
      setDescription(
        `Functional accessories and spare components salvaged before recycling ${fromPickup.deviceName}. Clean, tested, and ready for reuse.`
      );
    } else {
      setTitle('');
      setComponentCategory('Chargers & Power');
      setListingType('Donate');
      setCondition('Tested Working');
      setQuantity(1);
      setEstimatedWeightKg(0.35);
      setSalvagedFrom('');
      setTradePreference('');
      setDescription('');
    }
    setCity(defaultCity || 'Bengaluru');
    setHandoffMethod('Local Pickup');
    setComposerOpen(true);
  };

  const openEditModal = (listing: MarketplaceListing) => {
    setEditingListing(listing);
    setFormError(null);
    setTitle(listing.title);
    setComponentCategory(listing.componentCategory);
    setListingType(listing.listingType);
    setCondition(listing.condition);
    setQuantity(listing.quantity);
    setEstimatedWeightKg(listing.estimatedWeightKg);
    setSalvagedFrom(listing.salvagedFrom);
    setTradePreference(listing.tradePreference);
    setDescription(listing.description);
    setCity(listing.city);
    setHandoffMethod(listing.handoffMethod);
    setComposerOpen(true);
  };

  const handleSubmitListing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUid) {
      setFormError('Please sign in to publish a component listing.');
      return;
    }
    setSubmittingListing(true);
    setFormError(null);
    try {
      if (editingListing) {
        await updateMarketplaceListingDetails(editingListing.id, {
          title,
          componentCategory,
          listingType,
          condition,
          quantity,
          estimatedWeightKg,
          salvagedFrom,
          tradePreference,
          description,
          city,
          handoffMethod,
        });
        showToast(`Updated "${title.trim()}" on the Circular Marketplace.`);
      } else {
        await createMarketplaceListing(currentUid, {
          ownerName: currentUserName,
          title,
          componentCategory,
          listingType,
          condition,
          quantity,
          estimatedWeightKg,
          salvagedFrom,
          tradePreference,
          description,
          city,
          handoffMethod,
        });
        void pushNotification({
          title: `Component Listed (${listingType})`,
          message: `"${title.trim()}" (${quantity} unit${quantity === 1 ? '' : 's'}, ${estimatedWeightKg} kg) is now live on the Circular Marketplace.`,
          category: 'system',
        }).catch(() => {});
        showToast(`Published "${title.trim()}" to the Circular Marketplace.`);
      }
      setComposerOpen(false);
      setEditingListing(null);
    } catch (err) {
      setFormError(parseFriendlyFirestoreError(err, 'Could not save your marketplace listing.'));
    } finally {
      setSubmittingListing(false);
    }
  };

  const openClaimModal = (listing: MarketplaceListing) => {
    setClaimTarget(listing);
    setOfferItem('');
    setClaimMessage(
      listing.listingType === 'Donate'
        ? `Hi ${listing.ownerName}, I would love to reuse this ${listing.title} for a repair/upgrade project. I can coordinate via ${listing.handoffMethod}.`
        : `Hi ${listing.ownerName}, I am interested in trading for your ${listing.title}. Let me know if my offered component works for you!`
    );
    setContactNote('');
    setRequestError(null);
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimTarget || !currentUid) return;
    if (claimTarget.listingType === 'Trade' && offerItem.trim().length < 2) {
      setRequestError('Please specify the functional component you are offering in trade.');
      return;
    }
    setSubmittingRequest(true);
    setRequestError(null);
    try {
      await createMarketplaceRequest(currentUid, {
        listingId: claimTarget.id,
        listingTitle: claimTarget.title,
        listingType: claimTarget.listingType,
        ownerId: claimTarget.ownerId,
        ownerName: claimTarget.ownerName,
        requesterName: currentUserName,
        offerItem: claimTarget.listingType === 'Trade' ? offerItem.trim() : '',
        message: claimMessage.trim(),
        contactNote: contactNote.trim(),
      });
      void pushNotification({
        title: `${claimTarget.listingType === 'Trade' ? 'Trade Offer' : 'Donation Claim'} Sent`,
        message: `Your request for "${claimTarget.title}" has been sent to ${claimTarget.ownerName}.`,
        category: 'system',
      }).catch(() => {});
      showToast(
        `${claimTarget.listingType === 'Trade' ? 'Trade offer' : 'Donation claim'} sent to ${claimTarget.ownerName}.`
      );
      setClaimTarget(null);
    } catch (err) {
      setRequestError(parseFriendlyFirestoreError(err, 'Could not submit your request.'));
    } finally {
      setSubmittingRequest(false);
    }
  };

  const handleOwnerRespondRequest = async (
    req: MarketplaceRequest,
    decision: 'Accepted' | 'Declined' | 'Completed'
  ) => {
    setBusyActionId(req.id);
    setSyncError(null);
    try {
      await updateMarketplaceRequestStatus(req.id, decision);
      if (decision === 'Accepted') {
        await updateMarketplaceListingStatus(
          req.listingId,
          'Reserved',
          req.requesterId,
          req.requesterName
        );
        showToast(`Accepted ${req.requesterName}'s request and marked "${req.listingTitle}" as Reserved.`);
      } else if (decision === 'Completed') {
        await updateMarketplaceListingStatus(
          req.listingId,
          'Completed',
          req.requesterId,
          req.requesterName
        );
        void pushNotification({
          title: 'Circular Exchange Completed',
          message: `"${req.listingTitle}" was successfully exchanged with ${req.requesterName}.`,
          category: 'goal',
        }).catch(() => {});
        showToast(`Marked exchange for "${req.listingTitle}" as Completed!`);
      } else {
        // If declining an already-accepted request, make the listing available again
        if (req.status === 'Accepted') {
          await updateMarketplaceListingStatus(req.listingId, 'Available', '', '');
        }
        showToast(`Declined request from ${req.requesterName}.`);
      }
    } catch (err) {
      setSyncError(parseFriendlyFirestoreError(err, 'Could not update request status.'));
    } finally {
      setBusyActionId(null);
    }
  };

  const handleRequesterUpdateRequest = async (
    req: MarketplaceRequest,
    nextStatus: 'Cancelled' | 'Completed'
  ) => {
    setBusyActionId(req.id);
    setSyncError(null);
    try {
      await updateMarketplaceRequestStatus(req.id, nextStatus);
      showToast(
        nextStatus === 'Completed'
          ? `Confirmed receipt of "${req.listingTitle}".`
          : `Cancelled your request for "${req.listingTitle}".`
      );
    } catch (err) {
      setSyncError(parseFriendlyFirestoreError(err, 'Could not update your request.'));
    } finally {
      setBusyActionId(null);
    }
  };

  const handleChangeListingStatus = async (
    listing: MarketplaceListing,
    nextStatus: 'Available' | 'Completed'
  ) => {
    setBusyActionId(listing.id);
    setSyncError(null);
    try {
      await updateMarketplaceListingStatus(
        listing.id,
        nextStatus,
        nextStatus === 'Available' ? '' : listing.claimedByUid,
        nextStatus === 'Available' ? '' : listing.claimedByName
      );
      showToast(`"${listing.title}" marked as ${nextStatus}.`);
    } catch (err) {
      setSyncError(parseFriendlyFirestoreError(err, 'Could not update listing status.'));
    } finally {
      setBusyActionId(null);
    }
  };

  const handleDeleteListing = async (listing: MarketplaceListing) => {
    setBusyActionId(listing.id);
    setSyncError(null);
    try {
      await deleteMarketplaceListing(listing.id);
      showToast(`Removed "${listing.title}" from the Circular Marketplace.`);
    } catch (err) {
      setSyncError(parseFriendlyFirestoreError(err, 'Could not delete listing.'));
    } finally {
      setBusyActionId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-sky-50 inline-flex items-center gap-2">
            <Repeat className="w-5 h-5 text-emerald-500" />
            Circular Component Marketplace
          </h3>
          <p className="text-xs text-slate-600 dark:text-sky-200/70 mt-0.5">
            Trade or donate functional cables, chargers, memory modules, cooling fans, and spare parts salvaged from e-waste with registered community members.
          </p>
        </div>

        <button
          type="button"
          onClick={() => openCreateModal()}
          className="px-4 py-2.5 rounded-lg text-xs font-semibold bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950 hover:bg-emerald-700 dark:hover:bg-emerald-400 inline-flex items-center gap-1.5 shadow-sm transition-colors self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          List Salvaged Component
        </button>
      </div>

      {/* Feedback Banners */}
      {notice && (
        <div
          role="status"
          className="px-4 py-3 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-between gap-3 text-xs text-emerald-900 dark:text-emerald-100"
        >
          <span className="inline-flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            {notice}
          </span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-emerald-700 dark:text-emerald-300 cursor-pointer"
            aria-label="Dismiss notice"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {syncError && (
        <div className="p-3.5 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300 flex items-center justify-between gap-2">
          <span>{syncError}</span>
          <button
            type="button"
            onClick={() => setSyncError(null)}
            className="text-red-500 cursor-pointer"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B]">
          <p className="text-[11px] font-medium text-slate-500 dark:text-sky-200/65">
            Available Parts
          </p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50 mt-1">
            {stats.availableCount}
          </p>
          <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
            {stats.donations} free donations · {stats.trades} trade offers
          </p>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B]">
          <p className="text-[11px] font-medium text-slate-500 dark:text-sky-200/65">
            Salvaged Mass Circulated
          </p>
          <p className="text-2xl font-bold font-mono tabular-nums text-sky-700 dark:text-sky-400 mt-1">
            {stats.totalCirculatedKg} kg
          </p>
          <p className="text-[11px] text-slate-500 dark:text-sky-200/60 mt-0.5">
            {stats.completedExchanges} completed handoff{stats.completedExchanges === 1 ? '' : 's'}
          </p>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B]">
          <p className="text-[11px] font-medium text-slate-500 dark:text-sky-200/65">
            Your Listings
          </p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50 mt-1">
            {myListings.length}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-sky-200/60 mt-0.5">
            {myListings.filter((l) => l.status === 'Available').length} active on board
          </p>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B]">
          <p className="text-[11px] font-medium text-slate-500 dark:text-sky-200/65">
            Exchange Requests
          </p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-sky-50 mt-1">
            {requests.length}
          </p>
          <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
            {pendingIncomingCount} incoming pending review
          </p>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap rounded-xl border border-slate-200 dark:border-sky-900/70 p-1 bg-white dark:bg-[#0B223B] gap-1">
          <button
            type="button"
            onClick={() => setSubTab('browse')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
              subTab === 'browse'
                ? 'bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950'
                : 'text-slate-600 dark:text-sky-200/80 hover:bg-slate-100 dark:hover:bg-sky-900/40'
            }`}
          >
            <Recycle className="w-3.5 h-3.5" />
            Community Board ({listings.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('my_listings')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
              subTab === 'my_listings'
                ? 'bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950'
                : 'text-slate-600 dark:text-sky-200/80 hover:bg-slate-100 dark:hover:bg-sky-900/40'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            My Listings ({myListings.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('requests')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
              subTab === 'requests'
                ? 'bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950'
                : 'text-slate-600 dark:text-sky-200/80 hover:bg-slate-100 dark:hover:bg-sky-900/40'
            }`}
          >
            <Inbox className="w-3.5 h-3.5" />
            Trade &amp; Claim Requests
            {pendingIncomingCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500 text-white">
                {pendingIncomingCount}
              </span>
            )}
          </button>
        </div>

        {/* Quick salvage from user's own pickup log */}
        {salvageableFromHistory.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-500 dark:text-sky-200/65 inline-flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-emerald-500" />
              Salvage parts from your pickups:
            </span>
            {salvageableFromHistory.slice(0, 2).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => openCreateModal(undefined, p)}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-emerald-300/70 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 hover:border-emerald-500 transition-colors cursor-pointer truncate max-w-[180px]"
                title={`List functional cables, charger, or parts salvaged from ${p.deviceName}`}
              >
                + {p.deviceName}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* TAB 1: COMMUNITY BOARD                                            */}
      {/* ================================================================= */}
      {subTab === 'browse' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search chargers, HDMI cables, RAM, fans, city, or member name..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-sky-900/70 bg-white dark:bg-[#0B223B] text-slate-900 dark:text-sky-50"
              />
            </div>

            <div className="inline-flex rounded-lg border border-slate-200 dark:border-sky-900/70 p-1 bg-white dark:bg-[#0B223B] self-start">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'Donate', label: 'Free Donate' },
                  { id: 'Trade', label: 'Trade / Swap' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTypeFilter(opt.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    typeFilter === opt.id
                      ? 'bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950 font-semibold'
                      : 'text-slate-600 dark:text-sky-200/75 hover:bg-slate-100 dark:hover:bg-sky-900/40'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Filter by component category"
              className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-sky-900/70 bg-white dark:bg-[#0B223B] text-slate-900 dark:text-sky-50"
            >
              <option value="all">All Component Types</option>
              {MARKETPLACE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'Available' | 'all' | 'Completed')}
              aria-label="Filter by listing availability"
              className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-sky-900/70 bg-white dark:bg-[#0B223B] text-slate-900 dark:text-sky-50"
            >
              <option value="Available">Available Only</option>
              <option value="all">All Statuses</option>
              <option value="Completed">Completed Exchanges</option>
            </select>
          </div>

          {loadingListings ? (
            <div className="p-12 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-sky-200/70">
              <Loader2 className="w-4 h-4 animate-spin text-sky-500" />
              Loading live community components...
            </div>
          ) : filteredListings.length === 0 ? (
            <div className="p-8 rounded-2xl border border-dashed border-slate-300 dark:border-sky-800/80 bg-white dark:bg-[#0B223B] text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
                <Repeat className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <p className="text-sm font-semibold text-slate-900 dark:text-sky-50">
                  {listings.length === 0
                    ? 'Be the first to share salvaged components with the community'
                    : 'No components match your current filters'}
                </p>
                <p className="text-xs text-slate-500 dark:text-sky-200/70">
                  Got working USB-C chargers, HDMI cables, laptop RAM, or cooling fans from retired electronics? List them for free donation or community swap in seconds.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {SALVAGE_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.label}
                    type="button"
                    onClick={() => openCreateModal(tpl)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-sky-800 bg-slate-50 dark:bg-[#061526] text-slate-700 dark:text-sky-200 hover:border-emerald-500 transition-colors cursor-pointer"
                  >
                    + Quick List: {tpl.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredListings.map((item) => {
                const Icon = getCategoryIcon(item.componentCategory);
                const isOwner = item.ownerId === currentUid;
                const myExistingReq = activeOutgoingByListingId.get(item.id);

                return (
                  <article
                    key={item.id}
                    className="rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] p-5 flex flex-col justify-between gap-4 hover:border-sky-400/70 dark:hover:border-sky-700 transition-colors"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                              item.listingType === 'Donate'
                                ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
                                : 'bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300'
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-medium text-slate-500 dark:text-sky-300/75 truncate">
                              {item.componentCategory}
                            </p>
                            <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50 leading-snug line-clamp-2">
                              {item.title}
                            </h4>
                          </div>
                        </div>

                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-semibold shrink-0 border ${
                            item.listingType === 'Donate'
                              ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                              : 'bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/30'
                          }`}
                        >
                          {item.listingType === 'Donate' ? 'Donate' : 'Trade'}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 dark:text-sky-100/80 leading-relaxed line-clamp-3">
                        {item.description}
                      </p>

                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-[#061526] border border-slate-200 dark:border-sky-900/60 text-slate-700 dark:text-sky-200 font-medium">
                          {item.condition}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-[#061526] border border-slate-200 dark:border-sky-900/60 font-mono text-slate-700 dark:text-sky-200">
                          {item.quantity} unit{item.quantity === 1 ? '' : 's'} · {item.estimatedWeightKg} kg
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded font-semibold ${
                            item.status === 'Available'
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                              : item.status === 'Reserved'
                                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                : 'bg-slate-200 dark:bg-sky-950 text-slate-600 dark:text-sky-300/70'
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>

                      {item.salvagedFrom && (
                        <p className="text-[11px] text-slate-500 dark:text-sky-200/65">
                          <strong className="text-slate-700 dark:text-sky-200">Salvaged from:</strong>{' '}
                          {item.salvagedFrom}
                        </p>
                      )}

                      {item.tradePreference && (
                        <p className="text-[11px] text-sky-800 dark:text-sky-200/85 bg-sky-50/70 dark:bg-[#061526] px-2.5 py-1.5 rounded-lg border border-sky-200/70 dark:border-sky-900/60">
                          <strong>
                            {item.listingType === 'Trade' ? 'Looking for:' : 'Donation note:'}
                          </strong>{' '}
                          {item.tradePreference}
                        </p>
                      )}
                    </div>

                    <div className="pt-3 border-t border-slate-200/80 dark:border-sky-900/60 space-y-2.5">
                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-sky-200/65">
                        <span className="inline-flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3 text-sky-500 shrink-0" />
                          {item.city} · {item.handoffMethod}
                        </span>
                        <span className="truncate shrink-0">
                          by <strong className="text-slate-700 dark:text-sky-100">{item.ownerName}</strong>
                        </span>
                      </div>

                      {isOwner ? (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium text-sky-700 dark:text-sky-300">
                            Your Listing · {formatFirestoreTime(item.createdAt)}
                          </span>
                          <button
                            type="button"
                            onClick={() => setSubTab('my_listings')}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 dark:border-sky-800 text-slate-700 dark:text-sky-200 hover:border-sky-500 cursor-pointer"
                          >
                            Manage
                          </button>
                        </div>
                      ) : myExistingReq ? (
                        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 text-xs">
                          <span className="font-medium text-sky-800 dark:text-sky-200">
                            Request {myExistingReq.status}
                          </span>
                          <button
                            type="button"
                            onClick={() => setSubTab('requests')}
                            className="text-sky-700 dark:text-sky-300 font-semibold hover:underline cursor-pointer"
                          >
                            View Status →
                          </button>
                        </div>
                      ) : item.status === 'Available' ? (
                        <button
                          type="button"
                          onClick={() => openClaimModal(item)}
                          className={`w-full py-2 px-3 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                            item.listingType === 'Donate'
                              ? 'bg-emerald-600 dark:bg-emerald-500 hover:bg-emerald-700 dark:hover:bg-emerald-400 text-white dark:text-emerald-950'
                              : 'bg-sky-600 dark:bg-sky-500 hover:bg-sky-700 dark:hover:bg-sky-400 text-white dark:text-sky-950'
                          }`}
                        >
                          {item.listingType === 'Donate' ? (
                            <>
                              <Gift className="w-3.5 h-3.5" />
                              Claim Free Donation
                            </>
                          ) : (
                            <>
                              <ArrowLeftRight className="w-3.5 h-3.5" />
                              Propose Component Trade
                            </>
                          )}
                        </button>
                      ) : (
                        <div className="text-center py-1.5 rounded-lg bg-slate-100 dark:bg-[#061526] text-[11px] font-medium text-slate-500 dark:text-sky-300/70">
                          {item.status === 'Reserved'
                            ? `Reserved for ${item.claimedByName || 'a community member'}`
                            : 'Exchange Completed'}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 2: MY LISTINGS                                                */}
      {/* ================================================================= */}
      {subTab === 'my_listings' && (
        <div className="space-y-4">
          {myListings.length === 0 ? (
            <div className="p-8 rounded-xl border border-dashed border-slate-300 dark:border-sky-800 bg-white dark:bg-[#0B223B] text-center space-y-3">
              <p className="text-sm font-semibold text-slate-900 dark:text-sky-50">
                You haven&apos;t listed any salvaged components yet
              </p>
              <p className="text-xs text-slate-500 dark:text-sky-200/70 max-w-md mx-auto">
                Keep working chargers, cables, fans, and spare parts out of shredders by donating or swapping them with verified Reboot Earth members.
              </p>
              <button
                type="button"
                onClick={() => openCreateModal()}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Create Your First Listing
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {myListings.map((item) => {
                const reqCount = incomingRequests.filter(
                  (r) => r.listingId === item.id && r.status === 'Pending'
                ).length;
                const busy = busyActionId === item.id;
                return (
                  <div
                    key={item.id}
                    className="p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            item.listingType === 'Donate'
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                          }`}
                        >
                          {item.listingType}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-[#061526] text-[11px] font-semibold text-slate-700 dark:text-sky-200">
                          {item.status}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-sky-200/65">
                          {item.componentCategory} · {item.condition}
                        </span>
                        {reqCount > 0 && (
                          <button
                            type="button"
                            onClick={() => setSubTab('requests')}
                            className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[11px] font-semibold hover:underline cursor-pointer"
                          >
                            {reqCount} pending request{reqCount === 1 ? '' : 's'}
                          </button>
                        )}
                      </div>
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50">
                        {item.title}
                      </h4>
                      <p className="text-xs text-slate-600 dark:text-sky-200/75 line-clamp-2">
                        {item.description}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-sky-200/65">
                        {item.quantity} unit{item.quantity === 1 ? '' : 's'} · {item.estimatedWeightKg} kg · {item.city} ({item.handoffMethod})
                        {item.claimedByName ? ` · Reserved for ${item.claimedByName}` : ''}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {item.status === 'Available' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => openEditModal(item)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-sky-800 text-slate-700 dark:text-sky-200 hover:border-sky-500 inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Edit
                        </button>
                      )}
                      {item.status === 'Reserved' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleChangeListingStatus(item, 'Available')}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-amber-400 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 cursor-pointer"
                        >
                          Re-open Available
                        </button>
                      )}
                      {item.status !== 'Completed' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleChangeListingStatus(item, 'Completed')}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950 hover:bg-emerald-700 dark:hover:bg-emerald-400 inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Mark Completed
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleDeleteListing(item)}
                        className="p-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-500/10 cursor-pointer"
                        title="Remove listing"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 3: TRADE & CLAIM REQUESTS                                     */}
      {/* ================================================================= */}
      {subTab === 'requests' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Incoming Requests */}
          <div className="p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50 inline-flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-500" />
                Incoming Requests ({incomingRequests.length})
              </h4>
              <span className="text-[11px] text-slate-500 dark:text-sky-200/65">
                On your listed components
              </span>
            </div>

            {incomingRequests.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-sky-200/65 py-6 text-center border border-dashed border-slate-200 dark:border-sky-900/70 rounded-xl">
                No incoming trade offers or donation claims yet.
              </p>
            ) : (
              <div className="space-y-3">
                {incomingRequests.map((req) => {
                  const busy = busyActionId === req.id;
                  return (
                    <div
                      key={req.id}
                      className="p-4 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-slate-50/70 dark:bg-[#061526] space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-slate-900 dark:text-sky-50">
                            {req.listingTitle}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-sky-200/70">
                            From <strong>{req.requesterName}</strong> · {formatFirestoreTime(req.createdAt)}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            req.status === 'Pending'
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                              : req.status === 'Accepted'
                                ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                                : req.status === 'Completed'
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {req.status}
                        </span>
                      </div>

                      {req.offerItem && (
                        <p className="text-xs text-sky-800 dark:text-sky-300 bg-sky-500/10 px-2.5 py-1.5 rounded-lg">
                          <strong>Offered in Trade:</strong> {req.offerItem}
                        </p>
                      )}

                      <p className="text-xs text-slate-700 dark:text-sky-100/85 leading-relaxed">
                        {req.message}
                      </p>

                      {req.contactNote && (
                        <p className="text-[11px] text-slate-600 dark:text-sky-200/75 font-mono">
                          Handoff / Contact: {req.contactNote}
                        </p>
                      )}

                      {req.status === 'Pending' && (
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleOwnerRespondRequest(req, 'Accepted')}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950 hover:bg-emerald-700 dark:hover:bg-emerald-400 cursor-pointer disabled:opacity-50"
                          >
                            Accept &amp; Reserve
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleOwnerRespondRequest(req, 'Declined')}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-sky-800 text-slate-600 dark:text-sky-200 hover:border-red-400 hover:text-red-500 cursor-pointer disabled:opacity-50"
                          >
                            Decline
                          </button>
                        </div>
                      )}

                      {req.status === 'Accepted' && (
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleOwnerRespondRequest(req, 'Completed')}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 hover:bg-sky-700 dark:hover:bg-sky-400 cursor-pointer disabled:opacity-50"
                          >
                            Confirm Handoff Completed
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleOwnerRespondRequest(req, 'Declined')}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-sky-800 text-slate-600 dark:text-sky-200 cursor-pointer disabled:opacity-50"
                          >
                            Release Reservation
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Outgoing Requests */}
          <div className="p-5 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-white dark:bg-[#0B223B] space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-sky-50 inline-flex items-center gap-2">
                <Send className="w-4 h-4 text-sky-500" />
                Your Sent Claims &amp; Offers ({outgoingRequests.length})
              </h4>
              <span className="text-[11px] text-slate-500 dark:text-sky-200/65">
                Community requests you sent
              </span>
            </div>

            {outgoingRequests.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-sky-200/65 py-6 text-center border border-dashed border-slate-200 dark:border-sky-900/70 rounded-xl">
                You haven&apos;t claimed a donation or proposed a trade yet.
              </p>
            ) : (
              <div className="space-y-3">
                {outgoingRequests.map((req) => {
                  const busy = busyActionId === req.id;
                  return (
                    <div
                      key={req.id}
                      className="p-4 rounded-xl border border-slate-200 dark:border-sky-900/60 bg-slate-50/70 dark:bg-[#061526] space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-slate-900 dark:text-sky-50">
                            {req.listingTitle}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-sky-200/70">
                            Owner: <strong>{req.ownerName}</strong> · {formatFirestoreTime(req.createdAt)}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            req.status === 'Pending'
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                              : req.status === 'Accepted'
                                ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                                : req.status === 'Completed'
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {req.status}
                        </span>
                      </div>

                      {req.offerItem && (
                        <p className="text-xs text-sky-800 dark:text-sky-300 bg-sky-500/10 px-2.5 py-1.5 rounded-lg">
                          <strong>Your Trade Offer:</strong> {req.offerItem}
                        </p>
                      )}

                      <p className="text-xs text-slate-700 dark:text-sky-100/85 leading-relaxed">
                        {req.message}
                      </p>

                      {(req.status === 'Pending' || req.status === 'Accepted') && (
                        <div className="flex items-center gap-2 pt-1">
                          {req.status === 'Accepted' && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleRequesterUpdateRequest(req, 'Completed')}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950 cursor-pointer disabled:opacity-50"
                            >
                              Confirm Received
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleRequesterUpdateRequest(req, 'Cancelled')}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-sky-800 text-slate-600 dark:text-sky-200 hover:border-red-400 hover:text-red-500 cursor-pointer disabled:opacity-50"
                          >
                            Cancel Request
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* CREATE / EDIT LISTING MODAL                                       */}
      {/* ================================================================= */}
      {composerOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editingListing ? 'Edit Component Listing' : 'List Salvaged Component'}
        >
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-sky-800 bg-white dark:bg-[#0B223B] shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-sky-900/60 flex items-center justify-between gap-2 sticky top-0 bg-white dark:bg-[#0B223B] z-10">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-sky-50">
                  {editingListing ? 'Edit Component Listing' : 'List a Functional Salvaged Component'}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-sky-200/70">
                  Zero personal contact details are published publicly — handoff notes are shared privately upon request.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitListing} className="p-5 space-y-4">
              {!editingListing && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium text-slate-500 dark:text-sky-200/65">
                    Quick-fill common salvaged parts:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {SALVAGE_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.label}
                        type="button"
                        onClick={() => {
                          setTitle(tpl.title);
                          setComponentCategory(tpl.componentCategory);
                          setListingType(tpl.listingType);
                          setCondition(tpl.condition);
                          setQuantity(tpl.quantity);
                          setEstimatedWeightKg(tpl.estimatedWeightKg);
                          setSalvagedFrom(tpl.salvagedFrom);
                          setTradePreference(tpl.tradePreference);
                          setDescription(tpl.description);
                        }}
                        className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-slate-200 dark:border-sky-800 bg-slate-50 dark:bg-[#061526] text-slate-700 dark:text-sky-200 hover:border-emerald-500 cursor-pointer"
                      >
                        {tpl.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Donate vs Trade toggle */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setListingType('Donate')}
                  className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                    listingType === 'Donate'
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-100'
                      : 'border-slate-200 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-600 dark:text-sky-200/75'
                  }`}
                >
                  <p className="text-xs font-bold inline-flex items-center gap-1.5">
                    <Gift className="w-3.5 h-3.5 text-emerald-500" />
                    Donate (Free)
                  </p>
                  <p className="text-[11px] opacity-75 mt-0.5">
                    Give away to repairers, students, or neighbors
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setListingType('Trade')}
                  className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                    listingType === 'Trade'
                      ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/60 text-sky-900 dark:text-sky-100'
                      : 'border-slate-200 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-600 dark:text-sky-200/75'
                  }`}
                >
                  <p className="text-xs font-bold inline-flex items-center gap-1.5">
                    <ArrowLeftRight className="w-3.5 h-3.5 text-sky-500" />
                    Trade / Swap
                  </p>
                  <p className="text-[11px] opacity-75 mt-0.5">
                    Exchange for another salvaged cable or part
                  </p>
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-sky-200 mb-1">
                  Component Title *
                </label>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., 65W USB-C Laptop Charger, HDMI 2.1 Cable, 8GB DDR4 RAM"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-sky-200 mb-1">
                    Category
                  </label>
                  <select
                    value={componentCategory}
                    onChange={(e) =>
                      setComponentCategory(e.target.value as MarketplaceComponentCategory)
                    }
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
                  >
                    {MARKETPLACE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-sky-200 mb-1">
                    Functional Condition
                  </label>
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value as MarketplaceCondition)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
                  >
                    {MARKETPLACE_CONDITIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-sky-200 mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-sky-200 mb-1">
                    Weight (kg)
                  </label>
                  <input
                    type="number"
                    min={0.05}
                    max={200}
                    step={0.05}
                    required
                    value={estimatedWeightKg}
                    onChange={(e) =>
                      setEstimatedWeightKg(Math.max(0.05, Number(e.target.value) || 0.1))
                    }
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-sky-200 mb-1">
                    City *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={80}
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g., Bengaluru"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-sky-200 mb-1">
                    Handoff
                  </label>
                  <select
                    value={handoffMethod}
                    onChange={(e) => setHandoffMethod(e.target.value as MarketplaceHandoffMethod)}
                    className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
                  >
                    {MARKETPLACE_HANDOFF_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-sky-200 mb-1">
                    Salvaged From (Optional)
                  </label>
                  <input
                    type="text"
                    maxLength={100}
                    value={salvagedFrom}
                    onChange={(e) => setSalvagedFrom(e.target.value)}
                    placeholder="e.g., Retired Dell Latitude laptop"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-sky-200 mb-1">
                    {listingType === 'Trade' ? 'Looking to Trade For' : 'Donation Preference'}
                  </label>
                  <input
                    type="text"
                    maxLength={160}
                    value={tradePreference}
                    onChange={(e) => setTradePreference(e.target.value)}
                    placeholder={
                      listingType === 'Trade'
                        ? 'e.g., SATA SSD, USB-C hub, or DisplayPort cable'
                        : 'e.g., Free for students or repair labs'
                    }
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-sky-200 mb-1">
                  Description &amp; Functional Test Notes *
                </label>
                <textarea
                  rows={3}
                  required
                  minLength={5}
                  maxLength={600}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Share connector specs, wattage/voltage, testing results, and any cosmetic notes..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
                />
              </div>

              {formError && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                  {formError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setComposerOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-sky-200/75 hover:underline cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingListing}
                  className="px-5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950 hover:bg-emerald-700 dark:hover:bg-emerald-400 disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {submittingListing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {editingListing ? 'Save Changes' : 'Publish to Marketplace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* CLAIM DONATION / PROPOSE TRADE MODAL                              */}
      {/* ================================================================= */}
      {claimTarget && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Send Marketplace Request"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-sky-800 bg-white dark:bg-[#0B223B] shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-sky-900/60 flex items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-sky-50">
                  {claimTarget.listingType === 'Donate'
                    ? 'Claim Free Salvaged Component'
                    : 'Propose Component Trade'}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-sky-200/70">
                  {claimTarget.title} · Listed by {claimTarget.ownerName} ({claimTarget.city})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setClaimTarget(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitRequest} className="p-5 space-y-4">
              {claimTarget.tradePreference && (
                <div className="p-3 rounded-lg bg-sky-50 dark:bg-[#061526] border border-sky-200 dark:border-sky-900/60 text-xs text-sky-900 dark:text-sky-200">
                  <strong>
                    {claimTarget.listingType === 'Trade' ? "Owner's trade preference:" : "Owner's note:"}
                  </strong>{' '}
                  {claimTarget.tradePreference}
                </div>
              )}

              {claimTarget.listingType === 'Trade' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-sky-200 mb-1">
                    Component You Are Offering in Trade *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={160}
                    value={offerItem}
                    onChange={(e) => setOfferItem(e.target.value)}
                    placeholder="e.g., Tested 2m DisplayPort 1.4 cable + USB-C adapter"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-sky-200 mb-1">
                  Message to {claimTarget.ownerName} *
                </label>
                <textarea
                  rows={3}
                  required
                  minLength={3}
                  maxLength={500}
                  value={claimMessage}
                  onChange={(e) => setClaimMessage(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-sky-200 mb-1">
                  Private Handoff / Contact Note (Shared Only With Owner)
                </label>
                <input
                  type="text"
                  maxLength={120}
                  value={contactNote}
                  onChange={(e) => setContactNote(e.target.value)}
                  placeholder="e.g., Available Sat 10AM-1PM near Indiranagar Metro or facility drop-off"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-sky-900/70 bg-slate-50 dark:bg-[#061526] text-slate-900 dark:text-sky-50"
                />
              </div>

              {requestError && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                  {requestError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setClaimTarget(null)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-sky-200/75 hover:underline cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingRequest}
                  className="px-5 py-2 rounded-lg text-xs font-semibold bg-sky-600 dark:bg-sky-500 text-white dark:text-sky-950 hover:bg-sky-700 dark:hover:bg-sky-400 disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {submittingRequest ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  Send Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
