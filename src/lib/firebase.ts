import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
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
import type { EcoChatMessage, FacilityReview, FirestoreNotification } from '../types';

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/chat.spaces.readonly',
  'https://www.googleapis.com/auth/chat.messages.create',
  'https://www.googleapis.com/auth/contacts.readonly',
];

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
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
  payload: { title: string; message: string; category: 'pickup' | 'optimization' | 'facility' | 'system' }
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
