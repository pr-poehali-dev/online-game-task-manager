import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { CatalogProvider } from "@/lib/catalog";
import { ThemeProvider } from "@/lib/theme";
import ProtectedRoute from "@/components/ProtectedRoute";
import Icon from "@/components/ui/icon";

const Index = lazy(() => import("./pages/Index"));
const Login = lazy(() => import("./pages/Login"));
const Cabinet = lazy(() => import("./pages/Cabinet"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

function PageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Icon name="Loader2" size={28} className="animate-spin text-primary" />
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <AuthProvider>
          <CatalogProvider>
          <ThemeProvider>
            <Toaster />
            <Sonner />
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                <Route path="/task/:id" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                <Route path="/idea/:id" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                <Route path="/kb/:id" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                <Route path="/login" element={<Login />} />
                <Route path="/cabinet" element={<ProtectedRoute><Cabinet /></ProtectedRoute>} />
                {/* Админка и личный кабинет объединены в единый /cabinet (см. src/pages/Cabinet.tsx) —
                    видимость разделов там зависит от роли/прав пользователя. Старая ссылка /admin
                    оставлена рабочей через редирект, чтобы не сломать сохранённые закладки. */}
                <Route path="/admin" element={<Navigate to="/cabinet" replace />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ThemeProvider>
          </CatalogProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
