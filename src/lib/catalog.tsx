import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import func2url from '../../backend/func2url.json';

export const CATALOG_URL = (func2url as Record<string, string>).catalog;
const TOKEN_KEY = 'era_auth_token';

function catalogAuthHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Auth-Token': localStorage.getItem(TOKEN_KEY) || '' };
}

export interface CategoryItem {
  id: string;
  label: string;
  icon: string;
  color: string;
  sortOrder: number;
}

export interface ServerItem {
  id: string;
  label: string;
  color: string;
  sortOrder: number;
}

const FALLBACK_CATEGORY: CategoryItem = { id: 'other', label: 'Прочее', icon: 'MoreHorizontal', color: '215 15% 55%', sortOrder: 0 };
const FALLBACK_SERVER: ServerItem = { id: 'default', label: 'Сервер', color: '215 15% 55%', sortOrder: 0 };

interface CatalogContextValue {
  categories: CategoryItem[];
  servers: ServerItem[];
  loading: boolean;
  categoryMeta: (id: string) => CategoryItem;
  serverMeta: (id: string) => ServerItem;
  reload: () => Promise<void>;
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [servers, setServers] = useState<ServerItem[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(CATALOG_URL, { method: 'GET', headers: catalogAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
        setServers(data.servers || []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  function categoryMeta(id: string): CategoryItem {
    return categories.find((c) => c.id === id) ?? FALLBACK_CATEGORY;
  }

  function serverMeta(id: string): ServerItem {
    return servers.find((s) => s.id === id) ?? FALLBACK_SERVER;
  }

  return (
    <CatalogContext.Provider value={{ categories, servers, loading, categoryMeta, serverMeta, reload }}>
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog must be used within CatalogProvider');
  return ctx;
}

export function catalogAuthFetch(body: object) {
  return fetch(CATALOG_URL, {
    method: 'POST',
    headers: catalogAuthHeaders(),
    body: JSON.stringify(body),
  });
}
