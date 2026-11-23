import { auth } from './firebase';

// Kept strictly in JS memory (never localStorage or sessionStorage)
let inMemoryLocalAuthToken: string | null = null;

export function setLocalAuthToken(token: string | null) {
  inMemoryLocalAuthToken = token;
}

export function getLocalAuthToken(): string | null {
  return inMemoryLocalAuthToken;
}

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {},
  requireAuthHeader = true
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (requireAuthHeader) {
    if (auth.currentUser) {
      const idToken = await auth.currentUser.getIdToken();
      headers.Authorization = `Bearer ${idToken}`;
    } else if (inMemoryLocalAuthToken) {
      headers.Authorization = `Bearer ${inMemoryLocalAuthToken}`;
    }
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`) as Error & {
      status?: number;
      payload?: any;
    };
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data as T;
}
