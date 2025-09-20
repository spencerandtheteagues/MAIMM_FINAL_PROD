import { Switch, Route } from "wouter";
import { queryClient, setGlobalRestrictionHandler } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { useCurrentUser } from "./hooks/useCurrentUser";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ThemeProvider } from "@/contexts/ThemeContext";
import NotFound from "./pages/not-found";
import Dashboard from "./pages/dashboard";
import CreateContent from "./pages/create-content";
import Calendar from "./pages/calendar";
import Approval from "./pages/approval";
import Analytics from "./pages/analytics";
import Library from "./pages/library";
import Settings from "./pages/settings";
import Campaigns from "./pages/campaigns";
import Platforms from "./pages/platforms";
import AdminPanel from "./pages/admin";
import Billing from "./pages/billing";
import Referrals from "./pages/referrals";
import Help from "./pages/help";
import Trial from "./pages/trial";
import Landing from "./pages/landing";
import Auth from "./pages/auth";
import Pricing from "./pages/pricing";
import TrialSelection from "./pages/trial-selection";
import VerifyEmail from "./pages/verify-email";
import Checkout from "./pages/checkout";
import CheckoutReturn from "./pages/checkout-return";
import AIBrainstorm from "./pages/ai-brainstorm";
import TermsOfService from "./pages/terms-of-service";
import PrivacyPolicy from "./pages/privacy-policy";
import Sidebar from "./components/layout/sidebar";
import Header from "./components/layout/header";
import TrialWelcomePopup from "./components/trial-welcome-popup";
import RestrictionDialog from "./components/restriction-dialogs";
import TrialExpired from "./pages/trial-expired";
import { NotificationPopup } from "./components/NotificationPopup";
import { TrialCountdown } from "./components/TrialCountdown";
import { useRestrictionHandler } from "./hooks/useRestrictionHandler";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";

function Router() {
  // Initialize restriction handler
  const { restrictionState, showRestriction, hideRestriction } = useRestrictionHandler();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [location, setLocation] = useLocation();

  // Check authentication status
  const { data: user, error } = useCurrentUser();

  useEffect(() => {
    setGlobalRestrictionHandler((data: any) => {
      showRestriction(data);
      if ((data?.needsTrialSelection || data?.restrictionType === "trial_expired") && user && location !== "/trial-selection") {
        setLocation("/trial-selection");
      }
    });
  }, [showRestriction, setLocation, location, user]);

  // If there's an error or not authenticated, show landing page
  // This handles database connection errors gracefully
  if (error || !user) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/auth" component={Auth} />
        <Route path="/verify-email" component={VerifyEmail} />
        <Route path="/trial" component={Trial} />
        <Route path="/trial-selection" component={TrialSelection} />
        <Route path="/pricing" component={Pricing} />
        <Route path="/checkout" component={Checkout} />
        <Route path="/checkout/return" component={CheckoutReturn} />
        <Route path="/terms-of-service" component={TermsOfService} />
        <Route path="/privacy-policy" component={PrivacyPolicy} />
        <Route component={Landing} />
      </Switch>
    );
  }
  
  // Check if user needs to select a trial
  if ((user as any)?.needsTrialSelection) {
    return (
      <Switch>
        <Route path="/trial-selection" component={TrialSelection} />
        <Route path="/terms-of-service" component={TermsOfService} />
        <Route path="/privacy-policy" component={PrivacyPolicy} />
        <Route component={TrialSelection} />
      </Switch>
    );
  }

  // If authenticated, show the main app with restriction dialog system
  return (
    <>
      <div className="flex min-h-screen bg-background">
        <TrialWelcomePopup />
        <NotificationPopup />

        {/* Desktop Sidebar - hidden on mobile, sticky positioning */}
        <div className="hidden md:block flex-shrink-0">
          <Sidebar />
        </div>

        {/* Mobile Sidebar Sheet */}
        <Sheet open={isMobileSidebarOpen} onOpenChange={setIsMobileSidebarOpen}>
          <SheetContent side="left" className="w-64 p-0">
            <Sidebar onNavigate={() => setIsMobileSidebarOpen(false)} />
          </SheetContent>
        </Sheet>

        <main className="flex-1 min-w-0 overflow-y-auto tech-grid md:pl-[280px]">
          <Header onMobileMenuClick={() => setIsMobileSidebarOpen(true)} />
          <div className="p-4 sm:p-6">
            <TrialCountdown />
            <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/create" component={CreateContent} />
            <Route path="/ai-brainstorm" component={AIBrainstorm} />
            <Route path="/calendar" component={Calendar} />
            <Route path="/approval" component={Approval} />
            <Route path="/analytics" component={Analytics} />
            <Route path="/library" component={Library} />
            <Route path="/campaigns" component={Campaigns} />
            <Route path="/platforms" component={Platforms} />
            <Route path="/settings" component={Settings} />
            <Route path="/billing" component={Billing} />
            <Route path="/referrals" component={Referrals} />
            <Route path="/help" component={Help} />
            <Route path="/trial" component={Trial} />
            <Route path="/trial-selection" component={TrialSelection} />
            <Route path="/trial-expired" component={TrialExpired} />
            <Route path="/checkout" component={Checkout} />
            <Route path="/checkout/return" component={CheckoutReturn} />
            <Route path="/terms-of-service" component={TermsOfService} />
            <Route path="/privacy-policy" component={PrivacyPolicy} />
            <Route path="/admin" component={AdminPanel} />
              <Route component={NotFound} />
            </Switch>
          </div>
        </main>
      </div>
      
      {/* Restriction Dialog */}
      {restrictionState.data && (
        <RestrictionDialog
          open={restrictionState.isOpen}
          onOpenChange={hideRestriction}
          restrictionData={restrictionState.data}
        />
      )}
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
