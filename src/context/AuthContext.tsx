import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User } from 'firebase/auth';
import {
  createUserNotification,
  loadUserPreferences,
  loadUserProfile,
  logoutUser,
  markNotificationAsRead,
  registerWithEmailPassword,
  resetUserPassword,
  saveUserPreferences,
  saveUserProfile,
  signInWithEmailPassword,
  signInWithGooglePopup,
  subscribeAuthState,
  subscribeUserNotifications,
} from '../lib/firebase';
import { apiFetch, getLocalAuthToken, setLocalAuthToken } from '../lib/api';
import type { DbUser, FirestoreNotification, FirestoreUserProfile } from '../types';

export type ThemeMode = 'dark' | 'light' | 'system';
export type OnboardingRoleChoice = 'citizen' | 'collection_centre' | 'recycler' | 'transporter';

interface AuthContextValue {
  firebaseUser: User | null;
  dbUser: DbUser | null;
  firestoreProfile: FirestoreUserProfile | null;
  isAuthenticated: boolean;
  workspaceToken: string | null;
  authReady: boolean;
  signingIn: boolean;
  authError: string | null;
  notifications: FirestoreNotification[];
  theme: ThemeMode;
  language: 'en' | 'hi' | 'hinglish';
  setTheme: (mode: ThemeMode) => void;
  setLanguage: (lang: 'en' | 'hi' | 'hinglish') => void;
  clearAuthError: () => void;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (payload: {
    fullName: string;
    email: string;
    password: string;
    role: OnboardingRoleChoice;
  }) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  syncFirestoreProfile: (patch: {
    fullName: string;
    organizationName?: string | null;
    phone?: string | null;
    city?: string | null;
  }) => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  pushNotification: (payload: {
    title: string;
    message: string;
    category: 'pickup' | 'optimization' | 'facility' | 'system';
  }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function applyThemeToDom(mode: ThemeMode) {
  const root = document.documentElement;
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const shouldUseDark = mode === 'dark' || (mode === 'system' && prefersDark);
  root.classList.toggle('dark', shouldUseDark);
}

function mapFirebaseAuthError(error: any, fallback: string): string {
  const code = String(error?.code || '');
  if (code === 'auth/email-already-in-use') {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (code === 'auth/invalid-email') {
    return 'Please enter a valid email address.';
  }
  if (code === 'auth/weak-password') {
    return 'Password should be at least 8 characters long.';
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found'
  ) {
    return 'Invalid email or password. Please check your credentials and try again.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many attempts. Please wait a moment before trying again.';
  }
  return error?.message || fallback;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [firestoreProfile, setFirestoreProfile] = useState<FirestoreUserProfile | null>(null);
  const [workspaceToken, setWorkspaceToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<FirestoreNotification[]>([]);

  const [theme, setThemeState] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('reboot_earth_theme_v2') as ThemeMode | null;
      return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'light';
    } catch {
      return 'light';
    }
  });

  const [language, setLanguageState] = useState<'en' | 'hi' | 'hinglish'>('en');

  useEffect(() => {
    applyThemeToDom(theme);
    try {
      localStorage.setItem('reboot_earth_theme_v2', theme);
    } catch {
      // Ignore storage failures in restricted contexts
    }
  }, [theme]);

  const refreshProfile = useCallback(async (): Promise<DbUser | null> => {
    try {
      const data = await apiFetch<{ user: DbUser }>('/api/me');
      setDbUser(data.user);
      return data.user;
    } catch (err) {
      console.error('Failed to sync profile:', err);
      return null;
    }
  }, []);

  const hydrateFirestoreProfile = useCallback(
    async (user: User, serverUser: DbUser | null) => {
      try {
        const existing = await loadUserProfile(user.uid);
        if (existing) {
          setFirestoreProfile(existing);
          setDbUser((prev) =>
            prev
              ? {
                  ...prev,
                  fullName: prev.fullName || existing.fullName,
                  organizationName: prev.organizationName || existing.organizationName || null,
                  phone: prev.phone || existing.phone || null,
                  city: prev.city || existing.city || null,
                }
              : prev
          );
        } else if (user.emailVerified) {
          const initial = {
            email: serverUser?.email || user.email || 'user@rebootearth.app',
            fullName:
              serverUser?.fullName ||
              user.displayName ||
              (user.email ? user.email.split('@')[0] : 'Reboot Earth Member'),
            organizationName: serverUser?.organizationName || '',
            phone: serverUser?.phone || '',
            city: serverUser?.city || '',
          };
          await saveUserProfile(user.uid, initial);
          setFirestoreProfile({
            userId: user.uid,
            ...initial,
          });
        }
      } catch (err) {
        console.warn('Firestore profile hydration skipped:', err);
      }
    },
    []
  );

  const syncFirestoreProfile = useCallback(
    async (patch: {
      fullName: string;
      organizationName?: string | null;
      phone?: string | null;
      city?: string | null;
    }) => {
      if (!firebaseUser || !firebaseUser.emailVerified) return;
      const email = dbUser?.email || firebaseUser.email || 'user@rebootearth.app';
      await saveUserProfile(firebaseUser.uid, {
        email,
        fullName: patch.fullName,
        organizationName: patch.organizationName || '',
        phone: patch.phone || '',
        city: patch.city || '',
      });
      setFirestoreProfile((prev) => ({
        userId: firebaseUser.uid,
        email: prev?.email || email,
        fullName: patch.fullName.trim() || prev?.fullName || email.split('@')[0],
        organizationName: (patch.organizationName || '').trim(),
        phone: (patch.phone || '').trim(),
        city: (patch.city || '').trim(),
      }));
    },
    [firebaseUser, dbUser]
  );

  useEffect(() => {
    const unsubscribe = subscribeAuthState(async (user, token) => {
      setFirebaseUser(user);
      setWorkspaceToken(token);
      setAuthReady(true);

      if (user) {
        setLocalAuthToken(null);
        const serverUser = await refreshProfile();
        await hydrateFirestoreProfile(user, serverUser);
        const prefs = await loadUserPreferences(user.uid);
        if (prefs) {
          setThemeState(prefs.theme);
          setLanguageState(prefs.language);
        }
      } else if (!getLocalAuthToken()) {
        setDbUser(null);
        setFirestoreProfile(null);
        setNotifications([]);
      }
    });
    return () => unsubscribe();
  }, [refreshProfile, hydrateFirestoreProfile]);

  useEffect(() => {
    if (!authReady || !firebaseUser) return;
    let unsub: (() => void) | undefined;
    try {
      unsub = subscribeUserNotifications(firebaseUser.uid, (items) => {
        setNotifications(items);
      });
    } catch (err) {
      console.error('Notification listener failed:', err);
    }
    return () => unsub?.();
  }, [authReady, firebaseUser]);

  const setTheme = useCallback(
    (mode: ThemeMode) => {
      setThemeState(mode);
      if (firebaseUser) {
        void saveUserPreferences(firebaseUser.uid, {
          theme: mode,
          language,
          emailAlerts: true,
        }).catch(() => {});
      }
    },
    [firebaseUser, language]
  );

  const setLanguage = useCallback(
    (lang: 'en' | 'hi' | 'hinglish') => {
      setLanguageState(lang);
      if (firebaseUser) {
        void saveUserPreferences(firebaseUser.uid, {
          theme,
          language: lang,
          emailAlerts: true,
        }).catch(() => {});
      }
    },
    [firebaseUser, theme]
  );

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      setLocalAuthToken(null);
      const res = await signInWithGooglePopup();
      setFirebaseUser(res.user);
      setWorkspaceToken(res.workspaceToken);
      const serverUser = await refreshProfile();
      await hydrateFirestoreProfile(res.user, serverUser);
    } catch (error: any) {
      setAuthError(error?.message || 'Google sign-in was cancelled or blocked.');
      throw error;
    } finally {
      setSigningIn(false);
    }
  }, [refreshProfile, hydrateFirestoreProfile]);

  const registerWithEmail = useCallback(
    async (payload: {
      fullName: string;
      email: string;
      password: string;
      role: OnboardingRoleChoice;
    }) => {
      setSigningIn(true);
      setAuthError(null);
      const cleanName = payload.fullName.trim();
      const cleanEmail = payload.email.trim().toLowerCase();

      try {
        // Primary: Firebase Email/Password Auth
        const user = await registerWithEmailPassword(cleanEmail, payload.password, cleanName);
        setLocalAuthToken(null);
        setFirebaseUser(user);
        const res = await apiFetch<{ user: DbUser }>('/api/me/onboarding-role', {
          method: 'POST',
          body: JSON.stringify({ fullName: cleanName, role: payload.role }),
        });
        setDbUser(res.user);
      } catch (fbError: any) {
        const code = String(fbError?.code || '');
        const providerUnavailable =
          code === 'auth/operation-not-allowed' ||
          code === 'auth/configuration-not-found' ||
          code === 'auth/admin-restricted-operation';

        if (providerUnavailable) {
          // Seamless server-side scrypt registration fallback when Email/Password provider isn't enabled in Firebase Console
          try {
            const res = await apiFetch<{ token: string; user: DbUser }>(
              '/api/auth/register',
              {
                method: 'POST',
                body: JSON.stringify({
                  fullName: cleanName,
                  email: cleanEmail,
                  password: payload.password,
                  role: payload.role,
                }),
              },
              false
            );
            setLocalAuthToken(res.token);
            setDbUser(res.user);
            return;
          } catch (serverErr: any) {
            const msg = serverErr?.message || 'Unable to create your account.';
            setAuthError(msg);
            throw serverErr;
          }
        }

        const friendly = mapFirebaseAuthError(fbError, 'Unable to create your account.');
        setAuthError(friendly);
        throw new Error(friendly);
      } finally {
        setSigningIn(false);
      }
    },
    []
  );

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      setSigningIn(true);
      setAuthError(null);
      const cleanEmail = email.trim().toLowerCase();

      try {
        // Primary: Firebase Email/Password Auth
        const user = await signInWithEmailPassword(cleanEmail, password);
        setLocalAuthToken(null);
        setFirebaseUser(user);
        await refreshProfile();
      } catch (fbError: any) {
        const code = String(fbError?.code || '');
        const shouldCheckServerAuth =
          code === 'auth/operation-not-allowed' ||
          code === 'auth/configuration-not-found' ||
          code === 'auth/invalid-credential' ||
          code === 'auth/user-not-found';

        if (shouldCheckServerAuth) {
          try {
            const res = await apiFetch<{ token: string; user: DbUser }>(
              '/api/auth/login',
              {
                method: 'POST',
                body: JSON.stringify({ email: cleanEmail, password }),
              },
              false
            );
            setLocalAuthToken(res.token);
            setDbUser(res.user);
            return;
          } catch (serverErr: any) {
            const msg =
              code === 'auth/operation-not-allowed' || code === 'auth/configuration-not-found'
                ? serverErr?.message || 'Invalid email or password.'
                : mapFirebaseAuthError(fbError, 'Invalid email or password.');
            setAuthError(msg);
            throw new Error(msg);
          }
        }

        const friendly = mapFirebaseAuthError(fbError, 'Unable to sign in right now.');
        setAuthError(friendly);
        throw new Error(friendly);
      } finally {
        setSigningIn(false);
      }
    },
    [refreshProfile]
  );

  const sendPasswordReset = useCallback(async (email: string) => {
    const cleanEmail = email.trim().toLowerCase();
    try {
      await resetUserPassword(cleanEmail);
    } catch (error: any) {
      throw new Error(
        mapFirebaseAuthError(error, 'Unable to send password reset email right now.')
      );
    }
  }, []);

  const signOut = useCallback(async () => {
    setLocalAuthToken(null);
    await logoutUser().catch(() => {});
    setFirebaseUser(null);
    setDbUser(null);
    setFirestoreProfile(null);
    setWorkspaceToken(null);
    setNotifications([]);
  }, []);

  const markNotificationRead = useCallback(async (id: string) => {
    await markNotificationAsRead(id);
  }, []);

  const pushNotification = useCallback(
    async (payload: {
      title: string;
      message: string;
      category: 'pickup' | 'optimization' | 'facility' | 'system';
    }) => {
      if (!firebaseUser) return;
      await createUserNotification(firebaseUser.uid, payload);
    },
    [firebaseUser]
  );

  const isAuthenticated = Boolean(firebaseUser || dbUser);

  const refreshProfileVoid = useCallback(async () => {
    await refreshProfile();
  }, [refreshProfile]);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        dbUser,
        firestoreProfile,
        isAuthenticated,
        workspaceToken,
        authReady,
        signingIn,
        authError,
        notifications,
        theme,
        language,
        setTheme,
        setLanguage,
        clearAuthError,
        signInWithGoogle,
        signInWithEmail,
        registerWithEmail,
        sendPasswordReset,
        signOut,
        refreshProfile: refreshProfileVoid,
        syncFirestoreProfile,
        markNotificationRead,
        pushNotification,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
