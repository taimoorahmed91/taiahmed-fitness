import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { useUser } from "@/hooks/useUser";
import Welcome from "./pages/Welcome";
import Dashboard from "./pages/Dashboard";
import Meals from "./pages/Meals";
import Gym from "./pages/Gym";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isLoggedIn } = useUser();
  if (!isLoggedIn) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};

const AppRoutes = () => {
  const { isLoggedIn } = useUser();

  return (
    <Routes>
      <Route path="/" element={isLoggedIn ? <Navigate to="/dashboard" replace /> : <Welcome />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <div className="min-h-screen bg-background">
              <Navigation />
              <Dashboard />
            </div>
          </ProtectedRoute>
        }
      />
      <Route
        path="/meals"
        element={
          <ProtectedRoute>
            <div className="min-h-screen bg-background">
              <Navigation />
              <Meals />
            </div>
          </ProtectedRoute>
        }
      />
      <Route
        path="/gym"
        element={
          <ProtectedRoute>
            <div className="min-h-screen bg-background">
              <Navigation />
              <Gym />
            </div>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
