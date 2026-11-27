import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  BUYBACK_CATEGORY_IDS,
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_CONDITIONS,
  MARKETPLACE_HANDOFF_METHODS,
  PICKUP_TIME_SLOTS,
  type BuyBackAlertCondition,
  type BuyBackCategoryId,
  type CommunicationChannel,
  type EcoChatMessage,
  type FacilityReview,
  type FirestoreInventoryBatch,
  type FirestoreNotification,
  type FirestoreOptimizationRun,
  type FirestoreUserProfile,
  type MarketPriceAlert,
  type MarketplaceComponentCategory,
  type MarketplaceCondition,
  type MarketplaceHandoffMethod,
  type MarketplaceListing,
  type MarketplaceListingStatus,
  type MarketplaceListingType,
  type MarketplaceRequest,
  type MarketplaceRequestStatus,
  type MonthlyRecyclingTarget,
  type OrganizationType,
  type PickupTimeSlot,
  type ScheduledPickupBooking,
} from '../types';

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/chat.spaces.readonly',
  'https://www.googleapis.com/auth/chat.messages.create',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.acls',
  'https://www.googleapis.com/auth/calendar.acls.readonly',
  'https://www.googleapis.com/auth/calendar.app.created',
  'https://www.googleapis.com/auth/calendar.calendarlist',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.calendars',
  'https://www.googleapis.com/auth/calendar.calendars.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.events.freebusy',
  'https://www.googleapis.com/auth/calendar.events.owned',
  'https://www.googleapis.com/auth/calendar.events.owned.readonly',
  'https://www.googleapis.com/auth/calendar.events.public.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/calendar.freebusy',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.settings.readonly',
];

const app = initializeApp(firebaseConfig);
const firestoreDatabaseId =
  (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ||
  'ai-studio-49f9b08e-f98e-41a1-a2f5-95ff57ff621e';
export const db = getFirestore(app, firestoreDatabaseId);
export const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
for (const scope of WORKSPACE_SCOPES) {
  googleProvider.addScope(scope);
}
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Keep Google Workspace OAuth access token strictly in memory (never localStorage/sessionStorage)
let cachedWorkspaceAccessToken: string | null = null;
let isSigningIn = false;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export function subscribeAuthState(
  onUpdate: (user: User | null, workspaceToken: string | null) => void
) {
  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      cachedWorkspaceAccessToken = null;
      onUpdate(null, null);
    } else if (!isSigningIn) {
      onUpdate(user, cachedWorkspaceAccessToken);
    }
  });
}

export async function signInWithGooglePopup(): Promise<{
  user: User;
  workspaceToken: string | null;
}> {
  isSigningIn = true;
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    cachedWorkspaceAccessToken = credential?.accessToken ?? null;
    return { user: result.user, workspaceToken: cachedWorkspaceAccessToken };
  } finally {
    isSigningIn = false;
  }
}

export async function registerWithEmailPassword(
  email: string,
  password: string,
  fullName: string
): Promise<User> {
  isSigningIn = true;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (fullName.trim()) {
      await updateProfile(cred.user, { displayName: fullName.trim() });
      await cred.user.getIdToken(true);
    }
    return cred.user;
  } finally {
    isSigningIn = false;
  }
}

export async function signInWithEmailPassword(
  email: string,
  password: string
): Promise<User> {
  isSigningIn = true;
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  } finally {
    isSigningIn = false;
  }
}

export async function resetUserPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

export function getCachedWorkspaceToken(): string | null {
  return cachedWorkspaceAccessToken;
}

export async function logoutUser() {
  cachedWorkspaceAccessToken = null;
  await fbSignOut(auth);
}

// --- Firestore Collections (Blueprint-Compliant Payloads) ---

export async function loadUserPreferences(uid: string) {
  const path = `userPreferences/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'userPreferences', uid));
    return snap.exists() ? (snap.data() as { theme: 'dark' | 'light' | 'system'; language: 'en' | 'hi' | 'hinglish'; emailAlerts: boolean }) : null;
  } catch (error) {
    console.warn('Could not read user preferences:', error);
    return null;
  }
}

export async function saveUserPreferences(
  uid: string,
  prefs: { theme: 'dark' | 'light' | 'system'; language: 'en' | 'hi' | 'hinglish'; emailAlerts: boolean }
) {
  const path = `userPreferences/${uid}`;
  try {
    const ref = doc(db, 'userPreferences', uid);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      await updateDoc(ref, {
        theme: prefs.theme,
        language: prefs.language,
        emailAlerts: Boolean(prefs.emailAlerts),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        userId: uid,
        theme: prefs.theme,
        language: prefs.language,
        emailAlerts: Boolean(prefs.emailAlerts),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeUserNotifications(
  uid: string,
  onData: (items: FirestoreNotification[]) => void
) {
  const path = 'notifications';
  const q = query(collection(db, path), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list: FirestoreNotification[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<FirestoreNotification, 'id'>),
      }));
      list.sort((a, b) => {
        const tA = a.createdAt?.toMillis?.() ?? 0;
        const tB = b.createdAt?.toMillis?.() ?? 0;
        return tB - tA;
      });
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function createUserNotification(
  uid: string,
  payload: {
    title: string;
    message: string;
    category: 'pickup' | 'optimization' | 'facility' | 'goal' | 'market' | 'system';
  }
) {
  const notifId = `ntf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const path = `notifications/${notifId}`;
  try {
    await setDoc(doc(db, 'notifications', notifId), {
      userId: uid,
      title: payload.title.slice(0, 140),
      message: payload.message.slice(0, 500),
      category: payload.category,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function markNotificationAsRead(notificationId: string) {
  const path = `notifications/${notificationId}`;
  try {
    await updateDoc(doc(db, 'notifications', notificationId), { read: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteUserNotification(notificationId: string) {
  const safeId = notificationId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  const path = `notifications/${safeId}`;
  try {
    await deleteDoc(doc(db, 'notifications', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveEcoBotSession(
  uid: string,
  sessionId: string,
  language: 'en' | 'hi' | 'hinglish',
  messages: EcoChatMessage[]
) {
  const safeSessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120) || `chat_${uid.slice(0, 16)}`;
  const path = `chatSessions/${safeSessionId}`;
  const trimmedMessages = messages.slice(-30).map((m) => ({
    role: m.role,
    text: m.text.slice(0, 1200),
  }));
  const title = (trimmedMessages.find((m) => m.role === 'user')?.text || 'EcoBot Session').slice(0, 110);

  try {
    const ref = doc(db, 'chatSessions', safeSessionId);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      await updateDoc(ref, {
        title,
        language,
        messages: trimmedMessages,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        userId: uid,
        title,
        language,
        messages: trimmedMessages,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// --- Verified Collection Centre Ratings & Reviews ---

function sortReviewsDesc(list: FacilityReview[]): FacilityReview[] {
  return [...list].sort((a, b) => {
    const tA = a.updatedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0;
    const tB = b.updatedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0;
    return tB - tA;
  });
}

export async function fetchPublicFacilityReviews(): Promise<FacilityReview[]> {
  const path = 'facilityReviews';
  try {
    const q = query(collection(db, path), where('visibility', '==', 'public'));
    const snap = await getDocs(q);
    const list: FacilityReview[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<FacilityReview, 'id'>),
    }));
    return sortReviewsDesc(list);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export function subscribePublicFacilityReviews(
  onData: (items: FacilityReview[]) => void
) {
  const path = 'facilityReviews';
  const q = query(collection(db, path), where('visibility', '==', 'public'));
  return onSnapshot(
    q,
    (snap) => {
      const list: FacilityReview[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<FacilityReview, 'id'>),
      }));
      onData(sortReviewsDesc(list));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function saveFacilityReview(params: {
  facilityId: number;
  facilityName: string;
  userId: string;
  authorName: string;
  rating: number;
  comment: string;
}) {
  const safeFacilityId = Math.max(1, Math.min(1000000, Math.floor(params.facilityId)));
  const safeUserId = params.userId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
  const reviewId = `rev_f${safeFacilityId}_${safeUserId}`;
  const path = `facilityReviews/${reviewId}`;

  const cleanAuthor = (params.authorName.trim() || 'Community Member').slice(0, 80);
  const cleanFacilityName = (params.facilityName.trim() || 'Collection Centre').slice(0, 140);
  const cleanRating = Math.max(1, Math.min(5, Math.round(params.rating)));
  const cleanComment = params.comment.trim().slice(0, 600);

  if (cleanComment.length < 3) {
    throw new Error('Please write at least 3 characters for your review comment.');
  }

  try {
    const ref = doc(db, 'facilityReviews', reviewId);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      await updateDoc(ref, {
        authorName: cleanAuthor,
        rating: cleanRating,
        comment: cleanComment,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        facilityId: safeFacilityId,
        facilityName: cleanFacilityName,
        userId: safeUserId,
        authorName: cleanAuthor,
        rating: cleanRating,
        comment: cleanComment,
        visibility: 'public',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteFacilityReview(reviewId: string) {
  const safeId = reviewId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  const path = `facilityReviews/${safeId}`;
  try {
    await deleteDoc(doc(db, 'facilityReviews', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- Scheduled E-Waste Pickup Time-Slot Bookings (Owner-Scoped PII) ---

function normalizeTimeSlot(slot: string): PickupTimeSlot {
  return (PICKUP_TIME_SLOTS as readonly string[]).includes(slot)
    ? (slot as PickupTimeSlot)
    : '10:00 AM - 01:00 PM';
}

export function subscribeUserScheduledPickups(
  uid: string,
  onData: (items: ScheduledPickupBooking[]) => void
) {
  const path = 'scheduledPickups';
  const q = query(collection(db, path), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list: ScheduledPickupBooking[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ScheduledPickupBooking, 'id'>),
      }));
      list.sort((a, b) => {
        const tA = a.updatedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0;
        const tB = b.updatedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0;
        return tB - tA;
      });
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function createScheduledPickup(
  uid: string,
  payload: {
    requestCode: string;
    deviceName: string;
    category: string;
    quantity: number;
    estimatedWeightKg: number;
    condition: string;
    pickupAddress: string;
    lat: number;
    lng: number;
    preferredDate: string;
    timeSlot: string;
    contactName: string;
    contactPhone: string;
    instructions?: string;
  }
): Promise<string> {
  const safeCode = payload.requestCode
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 32) || `RBE-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const bookingId = `pkp_${safeCode.replace(/-/g, '_')}_${Date.now().toString(36)}`
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 120);
  const path = `scheduledPickups/${bookingId}`;

  const cleanDate = /^\d{4}-\d{2}-\d{2}$/.test(payload.preferredDate)
    ? payload.preferredDate
    : new Date(Date.now() + 86400_000).toISOString().slice(0, 10);

  const cleanLat = Number.isFinite(payload.lat) ? Math.max(-90, Math.min(90, Number(payload.lat))) : 28.6139;
  const cleanLng = Number.isFinite(payload.lng) ? Math.max(-180, Math.min(180, Number(payload.lng))) : 77.209;
  const cleanQty = Math.max(1, Math.min(5000, Math.round(Number(payload.quantity) || 1)));
  const cleanWeight = Math.max(0.1, Math.min(50000, Number(payload.estimatedWeightKg) || 1));

  try {
    await setDoc(doc(db, 'scheduledPickups', bookingId), {
      userId: uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128),
      requestCode: safeCode,
      deviceName: (payload.deviceName.trim() || 'Electronic Waste Item').slice(0, 140),
      category: (payload.category.trim() || 'IT & Telecom').slice(0, 60),
      quantity: cleanQty,
      estimatedWeightKg: cleanWeight,
      condition: (payload.condition.trim() || 'Non-working').slice(0, 60),
      pickupAddress: (payload.pickupAddress.trim() || 'Address Pending').slice(0, 300),
      lat: cleanLat,
      lng: cleanLng,
      preferredDate: cleanDate,
      timeSlot: normalizeTimeSlot(payload.timeSlot),
      contactName: (payload.contactName.trim() || 'Account Holder').slice(0, 120),
      contactPhone: (payload.contactPhone.trim() || '0000000000').slice(0, 40),
      instructions: (payload.instructions || '').trim().slice(0, 500),
      status: 'Submitted',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return bookingId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function rescheduleScheduledPickup(
  bookingId: string,
  preferredDate: string,
  timeSlot: string,
  instructions?: string
) {
  const safeId = bookingId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  const path = `scheduledPickups/${safeId}`;
  const cleanDate = /^\d{4}-\d{2}-\d{2}$/.test(preferredDate)
    ? preferredDate
    : new Date(Date.now() + 86400_000).toISOString().slice(0, 10);

  const patch: Record<string, unknown> = {
    preferredDate: cleanDate,
    timeSlot: normalizeTimeSlot(timeSlot),
    updatedAt: serverTimestamp(),
  };
  if (instructions !== undefined) {
    patch.instructions = instructions.trim().slice(0, 500);
  }

  try {
    await updateDoc(doc(db, 'scheduledPickups', safeId), patch);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function cancelScheduledPickup(bookingId: string) {
  const safeId = bookingId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  const path = `scheduledPickups/${safeId}`;
  try {
    await updateDoc(doc(db, 'scheduledPickups', safeId), {
      status: 'Cancelled',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// --- Persistent User Profile (Owner-Scoped PII) ---

export async function loadUserProfile(uid: string): Promise<FirestoreUserProfile | null> {
  const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  if (!safeUid) return null;
  const path = `userProfiles/${safeUid}`;
  try {
    const snap = await getDoc(doc(db, 'userProfiles', safeUid));
    return snap.exists() ? (snap.data() as FirestoreUserProfile) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

const VALID_ORG_TYPES: readonly OrganizationType[] = [
  'individual',
  'corporate',
  'educational',
  'government',
  'healthcare',
  'retail_oem',
  'recycler_partner',
  'ngo_community',
];

const VALID_COMM_CHANNELS: readonly CommunicationChannel[] = [
  'email',
  'sms',
  'whatsapp',
  'in_app',
];

export async function saveUserProfile(
  uid: string,
  profile: {
    email: string;
    fullName: string;
    organizationName?: string | null;
    organizationType?: OrganizationType;
    phone?: string | null;
    city?: string | null;
    preferredChannel?: CommunicationChannel;
    emailAlerts?: boolean;
    pickupReminders?: boolean;
    goalMilestoneAlerts?: boolean;
    weeklyImpactDigest?: boolean;
    regulatoryUpdates?: boolean;
  }
): Promise<void> {
  const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  if (!safeUid) return;
  const path = `userProfiles/${safeUid}`;

  const cleanEmail = (profile.email.trim().toLowerCase() || 'user@rebootearth.app').slice(0, 160);
  const cleanFullName = (profile.fullName.trim() || cleanEmail.split('@')[0] || 'User').slice(0, 120);
  const cleanOrg = (profile.organizationName || '').trim().slice(0, 140);
  const cleanOrgType: OrganizationType =
    profile.organizationType && VALID_ORG_TYPES.includes(profile.organizationType)
      ? profile.organizationType
      : 'individual';
  const cleanPhone = (profile.phone || '').trim().slice(0, 40);
  const cleanCity = (profile.city || '').trim().slice(0, 80);
  const cleanChannel: CommunicationChannel =
    profile.preferredChannel && VALID_COMM_CHANNELS.includes(profile.preferredChannel)
      ? profile.preferredChannel
      : 'email';
  const cleanEmailAlerts = profile.emailAlerts !== undefined ? Boolean(profile.emailAlerts) : true;
  const cleanPickupReminders =
    profile.pickupReminders !== undefined ? Boolean(profile.pickupReminders) : true;
  const cleanGoalAlerts =
    profile.goalMilestoneAlerts !== undefined ? Boolean(profile.goalMilestoneAlerts) : true;
  const cleanWeeklyDigest =
    profile.weeklyImpactDigest !== undefined ? Boolean(profile.weeklyImpactDigest) : false;
  const cleanRegulatoryUpdates =
    profile.regulatoryUpdates !== undefined ? Boolean(profile.regulatoryUpdates) : true;

  try {
    const ref = doc(db, 'userProfiles', safeUid);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      await updateDoc(ref, {
        fullName: cleanFullName,
        organizationName: cleanOrg,
        organizationType: cleanOrgType,
        phone: cleanPhone,
        city: cleanCity,
        preferredChannel: cleanChannel,
        emailAlerts: cleanEmailAlerts,
        pickupReminders: cleanPickupReminders,
        goalMilestoneAlerts: cleanGoalAlerts,
        weeklyImpactDigest: cleanWeeklyDigest,
        regulatoryUpdates: cleanRegulatoryUpdates,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        userId: safeUid,
        email: cleanEmail,
        fullName: cleanFullName,
        organizationName: cleanOrg,
        organizationType: cleanOrgType,
        phone: cleanPhone,
        city: cleanCity,
        preferredChannel: cleanChannel,
        emailAlerts: cleanEmailAlerts,
        pickupReminders: cleanPickupReminders,
        goalMilestoneAlerts: cleanGoalAlerts,
        weeklyImpactDigest: cleanWeeklyDigest,
        regulatoryUpdates: cleanRegulatoryUpdates,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// --- Route Optimization Run History (Owner-Scoped Real-Time Sync) ---

export function subscribeUserOptimizationRuns(
  uid: string,
  onData: (items: FirestoreOptimizationRun[]) => void
) {
  const path = 'optimizationRuns';
  const q = query(collection(db, path), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list: FirestoreOptimizationRun[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<FirestoreOptimizationRun, 'id'>),
      }));
      list.sort((a, b) => {
        const tA = a.createdAt?.toMillis?.() ?? 0;
        const tB = b.createdAt?.toMillis?.() ?? 0;
        return tB - tA;
      });
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function saveOptimizationRunToFirestore(
  uid: string,
  payload: {
    runCode?: string;
    objective: 'emission' | 'distance' | 'cost';
    totalDistanceKm: number;
    estimatedTravelMinutes: number;
    estimatedCostInr: number;
    estimatedEmissionsKg: number;
    assignedCount: number;
    unassignedCount: number;
  }
): Promise<string> {
  const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  const rawCode = (payload.runCode || `OPT-${Date.now().toString(36).toUpperCase()}`)
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 32);
  const safeRunCode = rawCode.length >= 4 ? rawCode : `OPT-${Math.floor(1000 + Math.random() * 9000)}`;
  const runId = `opt_${safeRunCode.replace(/-/g, '_')}_${Date.now().toString(36)}`
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 120);
  const path = `optimizationRuns/${runId}`;

  const safeObjective: 'emission' | 'distance' | 'cost' =
    payload.objective === 'distance' || payload.objective === 'cost' ? payload.objective : 'emission';

  const clampNum = (v: number, max: number) =>
    Number.isFinite(v) ? Math.max(0, Math.min(max, Number(v.toFixed(3)))) : 0;
  const clampInt = (v: number, max: number) =>
    Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0;

  try {
    await setDoc(doc(db, 'optimizationRuns', runId), {
      userId: safeUid,
      runCode: safeRunCode,
      objective: safeObjective,
      totalDistanceKm: clampNum(payload.totalDistanceKm, 500000),
      estimatedTravelMinutes: clampInt(payload.estimatedTravelMinutes, 100000),
      estimatedCostInr: clampNum(payload.estimatedCostInr, 100000000),
      estimatedEmissionsKg: clampNum(payload.estimatedEmissionsKg, 500000),
      assignedCount: clampInt(payload.assignedCount, 10000),
      unassignedCount: clampInt(payload.unassignedCount, 10000),
      approved: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return runId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// --- Facility Inventory & Material Recovery Batches (Owner-Scoped Sync) ---

const VALID_BATCH_STATUSES = [
  'Received',
  'In Processing',
  'Inspected',
  'Dismantling',
  'Refurbished',
  'Recycled',
  'Completed',
  'Dispatched',
] as const;

const VALID_PROCESSING_STAGES = [
  'Inspection',
  'Dismantling',
  'Refurbishment',
  'Material Recovery',
  'Recycled',
] as const;

export function subscribeUserInventoryBatches(
  uid: string,
  onData: (items: FirestoreInventoryBatch[]) => void
) {
  const path = 'inventoryBatches';
  const q = query(collection(db, path), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list: FirestoreInventoryBatch[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<FirestoreInventoryBatch, 'id'>),
      }));
      list.sort((a, b) => {
        const tA = a.createdAt?.toMillis?.() ?? 0;
        const tB = b.createdAt?.toMillis?.() ?? 0;
        return tB - tA;
      });
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function saveInventoryBatchToFirestore(
  uid: string,
  payload: {
    batchCode?: string;
    facilityId: number;
    category: string;
    deviceSummary: string;
    quantity: number;
    weightKg: number;
    storageZone: string;
    status: string;
    processingStage: string;
    recoveredCopperKg: number;
    recoveredAluminumKg: number;
    recoveredPlasticsKg: number;
    recoveredPreciousGrams: number;
    reusableUnits: number;
    residueKg: number;
  }
): Promise<string> {
  const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  const rawCode = (payload.batchCode || `BAT-${Date.now().toString(36).toUpperCase()}`)
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 32);
  const safeBatchCode = rawCode.length >= 4 ? rawCode : `BAT-${Math.floor(1000 + Math.random() * 9000)}`;
  const batchId = `inv_${safeBatchCode.replace(/-/g, '_')}_${Date.now().toString(36)}`
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 120);
  const path = `inventoryBatches/${batchId}`;

  const clampNum = (v: number, min: number, max: number) =>
    Number.isFinite(v) ? Math.max(min, Math.min(max, Number(v.toFixed(3)))) : min;
  const clampInt = (v: number, min: number, max: number) =>
    Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : min;

  const safeStatus = (VALID_BATCH_STATUSES as readonly string[]).includes(payload.status)
    ? payload.status
    : 'In Processing';
  const safeStage = (VALID_PROCESSING_STAGES as readonly string[]).includes(payload.processingStage)
    ? payload.processingStage
    : 'Dismantling';

  try {
    await setDoc(doc(db, 'inventoryBatches', batchId), {
      userId: safeUid,
      batchCode: safeBatchCode,
      facilityId: clampInt(payload.facilityId, 1, 1000000),
      category: (payload.category.trim() || 'IT & Telecom').slice(0, 60),
      deviceSummary: (payload.deviceSummary.trim() || 'E-Waste Batch').slice(0, 200),
      quantity: clampInt(payload.quantity, 1, 100000),
      weightKg: clampNum(payload.weightKg, 0.1, 1000000),
      storageZone: (payload.storageZone.trim() || 'Bay A-1').slice(0, 60),
      status: safeStatus,
      processingStage: safeStage,
      recoveredCopperKg: clampNum(payload.recoveredCopperKg, 0, 1000000),
      recoveredAluminumKg: clampNum(payload.recoveredAluminumKg, 0, 1000000),
      recoveredPlasticsKg: clampNum(payload.recoveredPlasticsKg, 0, 1000000),
      recoveredPreciousGrams: clampNum(payload.recoveredPreciousGrams, 0, 1000000),
      reusableUnits: clampInt(payload.reusableUnits, 0, 100000),
      residueKg: clampNum(payload.residueKg, 0, 1000000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return batchId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// --- Support Inquiries (Owner-Scoped PII) ---

export async function createSupportTicketInFirestore(
  uid: string,
  payload: {
    name: string;
    email: string;
    category: string;
    subject: string;
    message: string;
  }
): Promise<string> {
  const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  const ticketId = `sup_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 120);
  const path = `supportTickets/${ticketId}`;

  const cleanName = (payload.name.trim() || 'Account Member').slice(0, 120);
  const cleanEmail = (payload.email.trim().toLowerCase() || 'user@rebootearth.app').slice(0, 160);
  const cleanCategory = (payload.category.trim() || 'General').slice(0, 60);
  const cleanSubject = (payload.subject.trim() || 'General Inquiry').slice(0, 160);
  const cleanMessage = payload.message.trim().slice(0, 1500);

  if (cleanMessage.length < 5) {
    throw new Error('Please enter at least 5 characters for your message.');
  }

  try {
    await setDoc(doc(db, 'supportTickets', ticketId), {
      userId: safeUid,
      name: cleanName,
      email: cleanEmail,
      category: cleanCategory,
      subject: cleanSubject,
      message: cleanMessage,
      status: 'Open',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ticketId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// --- Monthly Recycling Targets & Goal Milestones (Owner-Scoped Sync) ---

export function subscribeUserRecyclingTargets(
  uid: string,
  onData: (items: MonthlyRecyclingTarget[]) => void
) {
  const path = 'recyclingTargets';
  const q = query(collection(db, path), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list: MonthlyRecyclingTarget[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<MonthlyRecyclingTarget, 'id'>),
      }));
      list.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function saveMonthlyRecyclingTarget(
  uid: string,
  payload: {
    monthKey: string;
    targetWeightKg: number;
    targetCo2Kg: number;
    targetPickups: number;
    loggedBonusWeightKg?: number;
    notifiedMilestones?: string[];
    notes?: string;
  }
): Promise<string> {
  const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
  const safeMonth = /^\d{4}-\d{2}$/.test(payload.monthKey)
    ? payload.monthKey
    : new Date().toISOString().slice(0, 7);
  const targetId = `tgt_${safeUid}_${safeMonth.replace('-', '_')}`.slice(0, 128);
  const path = `recyclingTargets/${targetId}`;

  const clampNum = (v: number, min: number, max: number) =>
    Number.isFinite(v) ? Math.max(min, Math.min(max, Number(v.toFixed(2)))) : min;
  const clampInt = (v: number, min: number, max: number) =>
    Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : min;

  const cleanWeight = clampNum(payload.targetWeightKg, 1, 50000);
  const cleanCo2 = clampNum(payload.targetCo2Kg, 1, 100000);
  const cleanPickups = clampInt(payload.targetPickups, 1, 500);
  const cleanBonus = clampNum(payload.loggedBonusWeightKg ?? 0, 0, 50000);
  const cleanMilestones = Array.isArray(payload.notifiedMilestones)
    ? Array.from(
        new Set(
          payload.notifiedMilestones
            .filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
            .map((m) => m.trim().slice(0, 40))
        )
      ).slice(0, 12)
    : [];
  const cleanNotes = (payload.notes || '').trim().slice(0, 300);

  try {
    const ref = doc(db, 'recyclingTargets', targetId);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      await updateDoc(ref, {
        targetWeightKg: cleanWeight,
        targetCo2Kg: cleanCo2,
        targetPickups: cleanPickups,
        loggedBonusWeightKg: cleanBonus,
        notifiedMilestones: cleanMilestones,
        notes: cleanNotes,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        userId: safeUid,
        monthKey: safeMonth,
        targetWeightKg: cleanWeight,
        targetCo2Kg: cleanCo2,
        targetPickups: cleanPickups,
        loggedBonusWeightKg: cleanBonus,
        notifiedMilestones: cleanMilestones,
        notes: cleanNotes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return targetId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteMonthlyRecyclingTarget(targetId: string): Promise<void> {
  const safeId = targetId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  const path = `recyclingTargets/${safeId}`;
  try {
    await deleteDoc(doc(db, 'recyclingTargets', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- Circular Marketplace: Salvaged Component Listings & Community Exchange Requests ---

export function subscribeMarketplaceListings(
  onData: (items: MarketplaceListing[]) => void,
  onError?: (err: Error) => void
) {
  const path = 'marketplaceListings';
  const q = query(collection(db, path), where('visibility', '==', 'community'));
  return onSnapshot(
    q,
    (snap) => {
      const list: MarketplaceListing[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<MarketplaceListing, 'id'>),
      }));
      list.sort((a, b) => {
        const tA = a.updatedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0;
        const tB = b.updatedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0;
        return tB - tA;
      });
      onData(list);
    },
    (error) => {
      if (onError) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Logged via handleFirestoreError
      }
    }
  );
}

export function subscribeUserMarketplaceRequests(
  uid: string,
  onData: (items: MarketplaceRequest[]) => void,
  onError?: (err: Error) => void
) {
  const path = 'marketplaceRequests';
  const q = query(collection(db, path), where('participants', 'array-contains', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list: MarketplaceRequest[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<MarketplaceRequest, 'id'>),
      }));
      list.sort((a, b) => {
        const tA = a.updatedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0;
        const tB = b.updatedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0;
        return tB - tA;
      });
      onData(list);
    },
    (error) => {
      if (onError) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Logged via handleFirestoreError
      }
    }
  );
}

export async function createMarketplaceListing(
  uid: string,
  payload: {
    ownerName: string;
    title: string;
    componentCategory: MarketplaceComponentCategory;
    listingType: MarketplaceListingType;
    condition: MarketplaceCondition;
    quantity: number;
    estimatedWeightKg: number;
    salvagedFrom?: string;
    tradePreference?: string;
    description: string;
    city: string;
    handoffMethod: MarketplaceHandoffMethod;
  }
): Promise<string> {
  const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  const listingId = `cmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 120);
  const path = `marketplaceListings/${listingId}`;

  const cleanOwnerName = (payload.ownerName.trim() || 'Community Member').slice(0, 80);
  const cleanTitle = payload.title.trim().slice(0, 120);
  const cleanCategory: MarketplaceComponentCategory = (
    MARKETPLACE_CATEGORIES as readonly string[]
  ).includes(payload.componentCategory)
    ? payload.componentCategory
    : 'Cables & Adapters';
  const cleanType: MarketplaceListingType = payload.listingType === 'Trade' ? 'Trade' : 'Donate';
  const cleanCondition: MarketplaceCondition = (
    MARKETPLACE_CONDITIONS as readonly string[]
  ).includes(payload.condition)
    ? payload.condition
    : 'Tested Working';
  const cleanQty = Math.max(1, Math.min(500, Math.round(Number(payload.quantity) || 1)));
  const cleanWeight = Math.max(
    0.05,
    Math.min(200, Number((Number(payload.estimatedWeightKg) || 0.25).toFixed(2)))
  );
  const cleanSalvagedFrom = (payload.salvagedFrom || '').trim().slice(0, 100);
  const cleanTradePref = (payload.tradePreference || '').trim().slice(0, 160);
  const cleanDesc = payload.description.trim().slice(0, 600);
  const cleanCity = payload.city.trim().slice(0, 80);
  const cleanHandoff: MarketplaceHandoffMethod = (
    MARKETPLACE_HANDOFF_METHODS as readonly string[]
  ).includes(payload.handoffMethod)
    ? payload.handoffMethod
    : 'Local Pickup';

  if (cleanTitle.length < 3) {
    throw new Error('Please enter a component title of at least 3 characters.');
  }
  if (cleanDesc.length < 5) {
    throw new Error('Please enter a short description of at least 5 characters.');
  }
  if (cleanCity.length < 2) {
    throw new Error('Please enter your city or locality.');
  }

  try {
    await setDoc(doc(db, 'marketplaceListings', listingId), {
      ownerId: safeUid,
      ownerName: cleanOwnerName,
      title: cleanTitle,
      componentCategory: cleanCategory,
      listingType: cleanType,
      condition: cleanCondition,
      quantity: cleanQty,
      estimatedWeightKg: cleanWeight,
      salvagedFrom: cleanSalvagedFrom,
      tradePreference: cleanTradePref,
      description: cleanDesc,
      city: cleanCity,
      handoffMethod: cleanHandoff,
      status: 'Available',
      visibility: 'community',
      claimedByUid: '',
      claimedByName: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return listingId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateMarketplaceListingDetails(
  listingId: string,
  payload: {
    title: string;
    componentCategory: MarketplaceComponentCategory;
    listingType: MarketplaceListingType;
    condition: MarketplaceCondition;
    quantity: number;
    estimatedWeightKg: number;
    salvagedFrom?: string;
    tradePreference?: string;
    description: string;
    city: string;
    handoffMethod: MarketplaceHandoffMethod;
  }
): Promise<void> {
  const safeId = listingId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  const path = `marketplaceListings/${safeId}`;
  const cleanTitle = payload.title.trim().slice(0, 120);
  const cleanDesc = payload.description.trim().slice(0, 600);
  const cleanCity = payload.city.trim().slice(0, 80);

  if (cleanTitle.length < 3 || cleanDesc.length < 5 || cleanCity.length < 2) {
    throw new Error('Title, description, and city are required to update this listing.');
  }

  try {
    await updateDoc(doc(db, 'marketplaceListings', safeId), {
      title: cleanTitle,
      componentCategory: (MARKETPLACE_CATEGORIES as readonly string[]).includes(
        payload.componentCategory
      )
        ? payload.componentCategory
        : 'Cables & Adapters',
      listingType: payload.listingType === 'Trade' ? 'Trade' : 'Donate',
      condition: (MARKETPLACE_CONDITIONS as readonly string[]).includes(payload.condition)
        ? payload.condition
        : 'Tested Working',
      quantity: Math.max(1, Math.min(500, Math.round(Number(payload.quantity) || 1))),
      estimatedWeightKg: Math.max(
        0.05,
        Math.min(200, Number((Number(payload.estimatedWeightKg) || 0.25).toFixed(2)))
      ),
      salvagedFrom: (payload.salvagedFrom || '').trim().slice(0, 100),
      tradePreference: (payload.tradePreference || '').trim().slice(0, 160),
      description: cleanDesc,
      city: cleanCity,
      handoffMethod: (MARKETPLACE_HANDOFF_METHODS as readonly string[]).includes(
        payload.handoffMethod
      )
        ? payload.handoffMethod
        : 'Local Pickup',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateMarketplaceListingStatus(
  listingId: string,
  status: MarketplaceListingStatus,
  claimedByUid = '',
  claimedByName = ''
): Promise<void> {
  const safeId = listingId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  const path = `marketplaceListings/${safeId}`;
  const safeClaimantUid = claimedByUid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  const safeClaimantName = claimedByName.trim().slice(0, 80);

  try {
    await updateDoc(doc(db, 'marketplaceListings', safeId), {
      status,
      claimedByUid: status === 'Available' ? '' : safeClaimantUid,
      claimedByName: status === 'Available' ? '' : safeClaimantName,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteMarketplaceListing(listingId: string): Promise<void> {
  const safeId = listingId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  const path = `marketplaceListings/${safeId}`;
  try {
    await deleteDoc(doc(db, 'marketplaceListings', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function createMarketplaceRequest(
  requesterUid: string,
  payload: {
    listingId: string;
    listingTitle: string;
    listingType: MarketplaceListingType;
    ownerId: string;
    ownerName: string;
    requesterName: string;
    offerItem?: string;
    message: string;
    contactNote?: string;
  }
): Promise<string> {
  const safeRequesterId = requesterUid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  const safeOwnerId = payload.ownerId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  const safeListingId = payload.listingId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);

  if (safeRequesterId === safeOwnerId) {
    throw new Error('You cannot submit a trade or claim request for your own listing.');
  }

  const cleanMessage = payload.message.trim().slice(0, 500);
  if (cleanMessage.length < 3) {
    throw new Error('Please include a brief message (at least 3 characters) for the owner.');
  }

  const requestId = `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 120);
  const path = `marketplaceRequests/${requestId}`;

  try {
    await setDoc(doc(db, 'marketplaceRequests', requestId), {
      listingId: safeListingId,
      listingTitle: (payload.listingTitle.trim() || 'Salvaged Component').slice(0, 120),
      listingType: payload.listingType === 'Trade' ? 'Trade' : 'Donate',
      ownerId: safeOwnerId,
      ownerName: (payload.ownerName.trim() || 'Community Member').slice(0, 80),
      requesterId: safeRequesterId,
      requesterName: (payload.requesterName.trim() || 'Community Member').slice(0, 80),
      participants: [safeRequesterId, safeOwnerId],
      offerItem: (payload.offerItem || '').trim().slice(0, 160),
      message: cleanMessage,
      contactNote: (payload.contactNote || '').trim().slice(0, 120),
      status: 'Pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return requestId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateMarketplaceRequestStatus(
  requestId: string,
  status: MarketplaceRequestStatus
): Promise<void> {
  const safeId = requestId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  const path = `marketplaceRequests/${safeId}`;
  try {
    await updateDoc(doc(db, 'marketplaceRequests', safeId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// --- Market Buy-Back Price Threshold Push Alerts (Owner-Scoped Sync) ---

export function subscribeUserPriceAlerts(
  uid: string,
  onData: (items: MarketPriceAlert[]) => void,
  onError?: (err: Error) => void
) {
  const path = 'priceAlerts';
  const q = query(collection(db, path), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list: MarketPriceAlert[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<MarketPriceAlert, 'id'>),
      }));
      list.sort((a, b) => {
        const tA = a.updatedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0;
        const tB = b.updatedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0;
        return tB - tA;
      });
      onData(list);
    },
    (error) => {
      if (onError) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Logged via handleFirestoreError
      }
    }
  );
}

export async function createUserPriceAlert(
  uid: string,
  payload: {
    categoryId: BuyBackCategoryId;
    categoryName: string;
    condition: BuyBackAlertCondition;
    targetPriceInr: number;
    browserPushEnabled: boolean;
    note?: string;
  }
): Promise<string> {
  const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  const alertId = `pal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 120);
  const path = `priceAlerts/${alertId}`;

  const safeCategoryId: BuyBackCategoryId = (BUYBACK_CATEGORY_IDS as readonly string[]).includes(
    payload.categoryId
  )
    ? payload.categoryId
    : 'gold_pcb';
  const cleanCategoryName = (payload.categoryName.trim() || 'Gold-Bearing Circuit Boards').slice(
    0,
    80
  );
  const safeCondition: BuyBackAlertCondition = payload.condition === 'below' ? 'below' : 'above';
  const cleanTarget = Math.max(
    10,
    Math.min(100000, Number((Number(payload.targetPriceInr) || 3600).toFixed(2)))
  );
  const cleanNote = (payload.note || '').trim().slice(0, 160);

  try {
    await setDoc(doc(db, 'priceAlerts', alertId), {
      userId: safeUid,
      categoryId: safeCategoryId,
      categoryName: cleanCategoryName,
      condition: safeCondition,
      targetPriceInr: cleanTarget,
      active: true,
      browserPushEnabled: Boolean(payload.browserPushEnabled),
      lastTriggeredPriceInr: 0,
      triggeredCount: 0,
      note: cleanNote,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return alertId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateUserPriceAlertConfig(
  alertId: string,
  patch: {
    targetPriceInr?: number;
    condition?: BuyBackAlertCondition;
    active?: boolean;
    browserPushEnabled?: boolean;
    note?: string;
  }
): Promise<void> {
  const safeId = alertId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  const path = `priceAlerts/${safeId}`;
  const updateBody: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (patch.targetPriceInr !== undefined) {
    updateBody.targetPriceInr = Math.max(
      10,
      Math.min(100000, Number((Number(patch.targetPriceInr) || 10).toFixed(2)))
    );
  }
  if (patch.condition !== undefined) {
    updateBody.condition = patch.condition === 'below' ? 'below' : 'above';
  }
  if (patch.active !== undefined) {
    updateBody.active = Boolean(patch.active);
  }
  if (patch.browserPushEnabled !== undefined) {
    updateBody.browserPushEnabled = Boolean(patch.browserPushEnabled);
  }
  if (patch.note !== undefined) {
    updateBody.note = patch.note.trim().slice(0, 160);
  }

  try {
    await updateDoc(doc(db, 'priceAlerts', safeId), updateBody);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function recordPriceAlertTrigger(
  alertId: string,
  spotPriceInr: number,
  nextTriggeredCount: number
): Promise<void> {
  const safeId = alertId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  const path = `priceAlerts/${safeId}`;
  const cleanSpot = Math.max(0, Math.min(100000, Number(spotPriceInr.toFixed(2))));
  const cleanCount = Math.max(0, Math.min(10000, Math.round(nextTriggeredCount)));
  try {
    await updateDoc(doc(db, 'priceAlerts', safeId), {
      lastTriggeredPriceInr: cleanSpot,
      triggeredCount: cleanCount,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteUserPriceAlert(alertId: string): Promise<void> {
  const safeId = alertId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  const path = `priceAlerts/${safeId}`;
  try {
    await deleteDoc(doc(db, 'priceAlerts', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}




