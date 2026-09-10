import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const API = process.env.EXPO_PUBLIC_BACKEND_URL;

type User = {
  user_id: string;
  email?: string | null;
  phone?: string | null;
  name: string;
  picture?: string | null;
  profile_picture_path?: string | null;
  batting_style?: string | null;
  bowling_style?: string | null;
  role?: string | null;
  profile_complete?: boolean;
};

type AuthState = {
  user: User | null;
  token: string | null;
  loading: boolean;
  signIn: (token: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
};

const AuthCtx = createContext<AuthState | undefined>(undefined);

const TOKEN_KEY = "crictrack_session_token";

async function storageGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try { return window.localStorage.getItem(key); } catch { return null; }
  }
  return await SecureStore.getItemAsync(key);
}
async function storageSet(key: string, value: string) {
  if (Platform.OS === "web") { try { window.localStorage.setItem(key, value); } catch {} return; }
  await SecureStore.setItemAsync(key, value);
}
async function storageDelete(key: string) {
  if (Platform.OS === "web") { try { window.localStorage.removeItem(key); } catch {} return; }
  await SecureStore.deleteItemAsync(key);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const apiFetch = useCallback(
    async (path: string, init?: RequestInit) => {
      const headers: Record<string, string> = {
        ...(init?.headers as Record<string, string> | undefined),
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      if (init?.body && !(init.body instanceof FormData) && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }
      const res = await fetch(`${API}${path}`, { ...init, headers });
      return res;
    },
    [token]
  );

  const signIn = useCallback(async (t: string, u: User) => {
    await storageSet(TOKEN_KEY, t);
    setToken(t);
    setUser(u);
  }, []);

  const signOut = useCallback(async () => {
    await storageDelete(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else if (res.status === 401) {
        await storageDelete(TOKEN_KEY);
        setToken(null);
        setUser(null);
      }
    } catch {}
  }, [token]);

  // Bootstrap
  useEffect(() => {
    (async () => {
      const t = await storageGet(TOKEN_KEY);
      if (!t) { setLoading(false); return; }
      try {
        const res = await fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${t}` } });
        if (res.ok) {
          const data = await res.json();
          setToken(t);
          setUser(data.user);
        } else {
          await storageDelete(TOKEN_KEY);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  return (
    <AuthCtx.Provider value={{ user, token, loading, signIn, signOut, refreshUser, apiFetch }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}

export function fileUrl(path: string | null | undefined, token: string | null): string | null {
  if (!path || !token) return null;
  return `${API}/api/files/${path}?token=${encodeURIComponent(token)}`;
}
