import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { UserProvider, useUser } from "@/contexts/UserContext";
import Dashboard from "./pages/Dashboard";
import Meals from "./pages/Meals";
import Gym from "./pages/Gym";
import Weight from "./pages/Weight";
import Sleep from "./pages/Sleep";
import Calendar from "./pages/Calendar";
import Compare from "./pages/Compare";
import Reports from "./pages/Reports";
import Welcome from "./pages/Welcome";
import NotFound from "./pages/NotFound";
import { Navigation } from "./components/Navigation";
import ChatBot from "./components/ChatBot";

const queryClient = new QueryClient();

const LoadingSpinner = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
  </div>
);

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isLoggedIn, loading } = useUser();
  
  if (loading) {
    return <LoadingSpinner />;
  }
  
  if (!isLoggedIn) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};

const AppRoutes = () => {
  const { isLoggedIn, loading } = useUser();

  if (loading) {
    return <LoadingSpinner />;
  }

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
      <Route
        path="/weight"
        element={
          <ProtectedRoute>
            <Weight />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sleep"
        element={
          <ProtectedRoute>
            <Sleep />
          </ProtectedRoute>
        }
      />
      <Route
        path="/calendar"
        element={
          <ProtectedRoute>
            <Calendar />
          </ProtectedRoute>
        }
      />
      <Route
        path="/compare"
        element={
          <ProtectedRoute>
            <Compare />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <Reports />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const AppContent = () => {
  return (
    <UserProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppRoutes />
        <ChatBot />
      </BrowserRouter>
    </UserProvider>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        <AppContent />
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
