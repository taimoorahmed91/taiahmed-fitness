import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Suspense, lazy } from "react";
import { UserProvider, useUser } from "@/contexts/UserContext";
import { AppLayout } from "./components/layout/AppLayout";
import { ROUTES } from "./app/navigation";
import ChatBot from "./components/ChatBot";

// Every route page is its own chunk, fetched when the route is first visited.
// Providers, the layout shell and ChatBot stay static: they are tiny and always needed.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Meals = lazy(() => import("./pages/Meals"));
const Gym = lazy(() => import("./pages/Gym"));
const Weight = lazy(() => import("./pages/Weight"));
const Waist = lazy(() => import("./pages/Waist"));
const Sleep = lazy(() => import("./pages/Sleep"));
const Calendar = lazy(() => import("./pages/Calendar"));
const Compare = lazy(() => import("./pages/Compare"));
const Reports = lazy(() => import("./pages/Reports"));
const Messaging = lazy(() => import("./pages/Messaging"));
const DailyNotes = lazy(() => import("./pages/DailyNotes"));
const Welcome = lazy(() => import("./pages/Welcome"));
const PendingApproval = lazy(() => import("./pages/PendingApproval"));
const AdminApproval = lazy(() => import("./pages/AdminApproval"));
const NotFound = lazy(() => import("./pages/NotFound"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent"));
const Achievements = lazy(() => import("./pages/Achievements"));
const WhoopData = lazy(() => import("./pages/WhoopData"));
const ActivityLogs = lazy(() => import("./pages/ActivityLogs"));
const PersonalData = lazy(() => import("./pages/PersonalData"));
const ExtraActivities = lazy(() => import("./pages/ExtraActivities"));
const CalorieHistory = lazy(() => import("./pages/CalorieHistory"));
const HowTo = lazy(() => import("./pages/HowTo"));

const queryClient = new QueryClient();

const LoadingSpinner = () => (
  <div role="status" className="min-h-screen bg-background flex items-center justify-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" aria-hidden="true"></div>
    <span className="sr-only">Loading</span>
  </div>
);

/**
 * Fallback while a route chunk loads. The signed-in shell (header, drawer) stays on
 * screen, so this only fills the page area. One stable status region: screen readers
 * hear "Loading page" once, and the spinner stops spinning for reduced-motion users.
 */
const PageFallback = () => (
  <div role="status" aria-live="polite" className="flex min-h-[50vh] items-center justify-center">
    <div
      className="h-8 w-8 rounded-full border-b-2 border-primary motion-safe:animate-spin"
      aria-hidden="true"
    />
    <span className="sr-only">Loading page</span>
  </div>
);

/** Suspense boundary for the pages rendered inside AppLayout (keeps the shell mounted). */
const LayoutPageBoundary = () => (
  <Suspense fallback={<PageFallback />}>
    <Outlet />
  </Suspense>
);

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isLoggedIn, loading, recovering, isApproved } = useUser();

  // Initial load, or an in-flight attempt to restore a dropped session:
  // wait instead of bouncing the user to the welcome screen.
  if (loading || recovering) {
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
  const { isLoggedIn, loading, recovering, isApproved } = useUser();

  if (loading || recovering) {
    return <LoadingSpinner />;
  }

  // Determine where to redirect logged in users
  const getLoggedInRedirect = () => {
    if (isApproved === null) return null; // Still loading approval status
    return isApproved ? <Navigate to={ROUTES.dashboard} replace /> : <Navigate to="/pending-approval" replace />;
  };

  return (
    // Outer boundary covers the pages outside the shell (welcome, consent, 404).
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/" element={isLoggedIn ? getLoggedInRedirect() : <Welcome />} />
        <Route path="/oauth/consent" element={<OAuthConsent />} />
        <Route path="/pending-approval" element={isLoggedIn ? <PendingApproval /> : <Navigate to="/" replace />} />
        {/*
          Every signed-in page shares one shell (header, drawer, main landmark).
        */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          {/* Page chunks load inside the shell, so the header never disappears while navigating. */}
          <Route element={<LayoutPageBoundary />}>
            <Route path={ROUTES.dashboard} element={<Dashboard />} />
            <Route path={ROUTES.meals} element={<Meals />} />
            <Route path={ROUTES.gym} element={<Gym />} />
            <Route path={ROUTES.weight} element={<Weight />} />
            <Route path={ROUTES.waist} element={<Waist />} />
            <Route path={ROUTES.sleep} element={<Sleep />} />
            <Route path={ROUTES.calendar} element={<Calendar />} />
            <Route path={ROUTES.compare} element={<Compare />} />
            <Route path={ROUTES.reports} element={<Reports />} />
            <Route path={ROUTES.messaging} element={<Messaging />} />
            <Route path={ROUTES.dailyNotes} element={<DailyNotes />} />
            <Route path={ROUTES.adminApproval} element={<AdminApproval />} />
            <Route path={ROUTES.achievements} element={<Achievements />} />
            <Route path={ROUTES.logs} element={<ActivityLogs />} />
            <Route path={ROUTES.whoopData} element={<WhoopData />} />
            <Route path={ROUTES.personalData} element={<PersonalData />} />
            <Route path={ROUTES.extraActivity} element={<ExtraActivities />} />
            <Route path={ROUTES.calorieHistory} element={<CalorieHistory />} />
            <Route path={ROUTES.howTo} element={<HowTo />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
};

const AppContent = () => {
  return (
    <UserProvider>
      {/* The one and only toaster. All notifications go through Sonner. */}
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
