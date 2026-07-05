import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import funcUrls from '../../backend/func2url.json';

export interface AuthUser {
  id: number;
  role: 'admin' | 'member';
  memberId: string | null;
  firstName: string;
  lastName: string | null;
  username: string | null;
  photoUrl: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  loginWithTelegram: (tgData: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchMe() {
    try {
      const res = await fetch(funcUrls['auth-me'], {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchMe();
  }, []);

  async function loginWithTelegram(tgData: Record<string, unknown>) {
    const res = await fetch(funcUrls['auth-telegram'], {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tgData),
    });
    if (res.ok) {
      const data = await res.json();
      setUser(data.user);
      return { ok: true };
    }
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: err.error || 'Не удалось войти' };
  }

  async function logout() {
    await fetch(funcUrls['auth-me'], { method: 'DELETE', credentials: 'include' });
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, loginWithTelegram, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
