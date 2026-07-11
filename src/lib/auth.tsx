import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import func2url from '../../backend/func2url.json';

const AUTH_URL = (func2url as Record<string, string>).auth;
const TOKEN_KEY = 'era_auth_token';

export type PermissionKey =
  | 'task_create'
  | 'task_edit_own'
  | 'task_view_others'
  | 'task_restart'
  | 'idea_create'
  | 'kb_create'
  | 'kb_edit'
  | 'sprint_create'
  | 'sprint_edit';

export interface AuthUser {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  photo_url: string | null;
  role: 'admin' | 'member';
  member_id: string | null;
  tg_username: string | null;
  permissions?: Partial<Record<PermissionKey, boolean>>;
}

export interface TelegramAuthData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  isAdmin: boolean;
  can: (key: PermissionKey) => boolean;
  loginWithTelegram: (data: TelegramAuthData) => Promise<AuthUser>;
  applySession: (token: string, user: AuthUser) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ action: 'me' }),
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        localStorage.removeItem(TOKEN_KEY);
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const loginWithTelegram = useCallback(async (data: TelegramAuthData): Promise<AuthUser> => {
    const res = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', telegram: data }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'login_failed');
    }
    const result = await res.json();
    localStorage.setItem(TOKEN_KEY, result.token);
    setUser(result.user);
    return result.user;
  }, []);

  const applySession = useCallback((token: string, u: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, token);
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    if (token) {
      await fetch(AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ action: 'logout' }),
      }).catch(() => {});
    }
  }, []);

  const can = useCallback((key: PermissionKey) => {
    if (!user) return false;
    const explicit = user.permissions?.[key];
    if (explicit != null) return explicit;
    return user.role === 'admin';
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin: user?.role === 'admin', can, loginWithTelegram, applySession, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}