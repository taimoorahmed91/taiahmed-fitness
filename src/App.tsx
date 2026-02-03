import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { UserProvider, useUser } from "@/contexts/UserContext";
import { SessionValidator } from "@/components/SessionValidator";
import Dashboard from "./pages/Dashboard";
import Meals from "./pages/Meals";
import Gym from "./pages/Gym";
import Weight from "./pages/Weight";
import Waist from "./pages/Waist";
import Sleep from "./pages/Sleep";
import Calendar from "./pages/Calendar";
import Compare from "./pages/Compare";
import Reports from "./pages/Reports";
import Messaging from "./pages/Messaging";
import DailyNotes from "./pages/DailyNotes";
import Welcome from "./pages/Welcome";
import PendingApproval from "./pages/PendingApproval";
import AdminApproval from "./pages/AdminApproval";
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
  const { isLoggedIn, loading, isApproved } = useUser();
  
  // Only show loading spinner for a reasonable time during initial load
  // After that, treat as not logged in to avoid infinite spinning
  if (loading) {
    return <LoadingSpinner />;
  }
  
  // If not logged in, redirect immediately (no waiting for isApproved)
  if (!isLoggedIn) {
    return <Navigate to="/" replace />;
  }
  
  // User is logged in but approval status still loading
  if (isApproved === null) {
    return <LoadingSpinner />;
  }
  
  if (!isApproved) {
    return <Navigate to="/pending-approval" replace />;
  }
  
  return <>{children}</>;
};

const AppRoutes = () => {
  const { isLoggedIn, loading, isApproved } = useUser();

  if (loading) {
    return <LoadingSpinner />;
  }

  // Determine where to redirect logged in users
  const getLoggedInRedirect = () => {
    if (isApproved === null) return null; // Still loading approval status
    return isApproved ? <Navigate to="/dashboard" replace /> : <Navigate to="/pending-approval" replace />;
  };

  return (
    <Routes>
      <Route path="/" element={isLoggedIn ? getLoggedInRedirect() : <Welcome />} />
      <Route path="/pending-approval" element={isLoggedIn ? <PendingApproval /> : <Navigate to="/" replace />} />
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
        path="/waist"
        element={
          <ProtectedRoute>
            <Waist />
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
      <Route
        path="/messaging"
        element={
          <ProtectedRoute>
            <div className="min-h-screen bg-background">
              <Messaging />
            </div>
          </ProtectedRoute>
        }
      />
      <Route
        path="/daily-notes"
        element={
          <ProtectedRoute>
            <DailyNotes />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/approval"
        element={
          <ProtectedRoute>
            <div className="min-h-screen bg-background">
              <Navigation />
              <AdminApproval />
            </div>
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
        <SessionValidator />
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
