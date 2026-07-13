import { Navigate, useLocation } from 'react-router-dom';
import Icon from '@/components/ui/icon';
import { useAuth } from '@/lib/auth';
import type { ReactNode } from 'react';

export default function ProtectedRoute({ children, adminOnly = false }: { children: ReactNode; adminOnly?: boolean }) {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Icon name="Loader2" size={28} className="animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    // Сохраняем исходный адрес (например /?task=123), чтобы вернуться туда после входа через бота
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/cabinet" replace />;
  }

  return <>{children}</>;
}