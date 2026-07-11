import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import func2url from '../../backend/func2url.json';
import { useAuth } from '@/lib/auth';

const AUTH_URL = (func2url as Record<string, string>).auth;
const TOKEN_KEY = 'era_auth_token';
const THEME_KEY = 'era_theme';

export type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);
  const syncedUserId = useRef<number | null>(null);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // При входе пользователя применяем тему, сохранённую за ним на сервере
  useEffect(() => {
    if (user && user.theme && syncedUserId.current !== user.id) {
      syncedUserId.current = user.id;
      if (user.theme !== theme) {
        setThemeState(user.theme);
        localStorage.setItem(THEME_KEY, user.theme);
      }
    }
    if (!user) syncedUserId.current = null;
  }, [user, theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    localStorage.setItem(THEME_KEY, next);
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      fetch(AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ action: 'set_theme', theme: next }),
      }).catch(() => {});
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}