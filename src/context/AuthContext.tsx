import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User } from 'firebase/auth';
import {
  createUserNotification,
  loadUserPreferences,
  logoutUser,
  markNotificationAsRead,
  saveUserPreferences,
  signInWithGooglePopup,
  subscribeAuthState,
  subscribeUserNotifications,
} from '../lib/firebase';
import { apiFetch } from '../lib/api';
import type { DbUser, FirestoreNotification } from '../types';

export type ThemeMode = 'dark' | 'light' | 'system';

interface AuthContextValue {
  firebaseUser: User | null;
  dbUser: DbUser | null;
  workspaceToken: string | null;
  authReady: boolean;
  signingIn: boolean;
  authError: string | null;
  notifications: FirestoreNotification[];
  theme: ThemeMode;
  language: 'en' | 'hi' | 'hinglish';
  setTheme: (mode: ThemeMode) => void;
  setLanguage: (lang: 'en' | 'hi' | 'hinglish') => void;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [workspaceToken, setWorkspaceToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<FirestoreNotification[]>([]);

  const [theme, setThemeState] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('reboot_earth_theme') as ThemeMode | null;
      return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'dark';
    } catch {
      return 'dark';
    }
  });

  const [language, setLanguageState] = useState<'en' | 'hi' | 'hinglish'>('en');

  useEffect(() => {
    applyThemeToDom(theme);
    try {
      localStorage.setItem('reboot_earth_theme', theme);
    } catch {
      // Ignore storage failures in restricted contexts
    }
  }, [theme]);

  const refreshProfile = useCallback(async () => {
    try {
      const data = await apiFetch<{ user: DbUser }>('/api/me');
      setDbUser(data.user);
    } catch (err) {
      console.error('Failed to sync profile:', err);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeAuthState(async (user, token) => {
      setFirebaseUser(user);
      setWorkspaceToken(token);
      setAuthReady(true);

      if (user) {
        await refreshProfile();
        const prefs = await loadUserPreferences(user.uid);
        if (prefs) {
          setThemeState(prefs.theme);
          setLanguageState(prefs.language);
        }
      } else {
        setDbUser(null);
        setNotifications([]);
      }
    });
    return () => unsubscribe();
  }, [refreshProfile]);

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

  const signInWithGoogle = useCallback(async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      const res = await signInWithGooglePopup();
      setFirebaseUser(res.user);
      setWorkspaceToken(res.workspaceToken);
      await refreshProfile();
    } catch (error: any) {
      setAuthError(error?.message || 'Google sign-in was cancelled or blocked.');
      throw error;
    } finally {
      setSigningIn(false);
    }
  }, [refreshProfile]);

  const signOut = useCallback(async () => {
    await logoutUser();
    setFirebaseUser(null);
    setDbUser(null);
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

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        dbUser,
        workspaceToken,
        authReady,
        signingIn,
        authError,
        notifications,
        theme,
        language,
        setTheme,
        setLanguage,
        signInWithGoogle,
        signOut,
        refreshProfile,
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
