import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Cabinet from "./pages/Cabinet";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider>
            <Toaster />
            <Sonner />
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
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;