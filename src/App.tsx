import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { AppProvider, useApp } from "@/contexts/AppContext";
import { initTracker } from "@/lib/track";
import { useEffect, lazy, Suspense } from "react";
import ProductModalWrapper from "./components/ProductModalWrapper";
import GlobalAIChat from "./components/GlobalAIChat";
import SettingsPanel from "./components/SettingsPanel";
import { AccountProvider } from "./components/account/AccountProvider";
import { ResellerProvider } from "./components/reseller/ResellerProvider";
import { CompareProvider } from "@/contexts/CompareContext";
import { ProductModalProvider } from "@/contexts/ProductModalContext";

// Route pages are code-split: only the visited route's chunk is fetched, so the
// initial JS payload is just the landing page + shared vendor chunks (AL10).
const Index = lazy(() => import("./pages/Index"));
const Storefront = lazy(() => import("./pages/Storefront"));
const Marketing = lazy(() => import("./pages/Marketing"));
const Services = lazy(() => import("./pages/Services"));
const Cart = lazy(() => import("./pages/Cart"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Account = lazy(() => import("./pages/Account"));
const ExclusiveMembers = lazy(() => import("./pages/ExclusiveMembers"));
const ResellerPortal = lazy(() => import("./pages/ResellerPortal"));
const RegisteredCreatives = lazy(() => import("./pages/RegisteredCreatives"));
const Support = lazy(() => import("./pages/Support"));
const NotFound = lazy(() => import("./pages/NotFound"));
// Site-wide floating concierge (feature 06) — deferred so the LLM chat code
// never sits in the entry bundle; AIFeature still gates it on proxy health.
const SalesConcierge = lazy(() => import("./components/ai/SalesConcierge"));
// Bottom-left ordering-avatar FAB — renders only for signed-in Exclusive
// Members (self-gates on isMember) and only when the AI backend is healthy.
const MemberOrderingAvatar = lazy(() => import("./components/ai/MemberOrderingAvatar"));
const AIFeature = lazy(() => import("./components/ai/AIFeature"));

const queryClient = new QueryClient();

const AppContent = () => {
  const { state, setNavigate } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  // /marketing and /services are full-viewport 3rd-party microsites (iframes)
  // with their own cosmic aesthetic — the DSM crimson concierge + ordering-avatar
  // FABs clash there, so hide them on those routes.
  const hideFloatingWidgets = /^\/(marketing|services)(\/|$)/.test(location.pathname);
  
  // Set navigate function in AppContext so AI actions can use it
  useEffect(() => {
    setNavigate(navigate);
  }, [navigate, setNavigate]);

  // Site-wide passive analytics capture (page_view / click / scroll / attention)
  // streaming to the STABLE Ecommerce Apps Script sink. initTracker is idempotent
  // and self-detaches; it also hooks SPA route changes internally.
  useEffect(() => {
    return initTracker();
  }, []);

  // When marketing mode is disabled, show only the chatbot
  if (!state.marketingMode) {
    return (
      <div className="fixed inset-0 bg-background">
        <GlobalAIChat />
        <SettingsPanel />
      </div>
    );
  }

  // Normal marketing mode - show full website. AccountProvider mounts the shared
  // sign-in dialog + the tasteful visitor prompt once, and exposes the STABLE
  // member account (portal at /account) to the whole tree.
  return (
    <AccountProvider>
      {/* ResellerProvider mounts the shared B2B sign-in pop-up (nav "Resellers"
          link + first-visit trigger). CompareProvider + ProductModalProvider
          make the rich product-detail popup and the side-by-side compare tray
          available on every route, so any <ProductCard> opens the popup. Both
          render their own overlay UI (modal / tray) as siblings of the routes. */}
      <ResellerProvider>
        <CompareProvider>
          <ProductModalProvider>
            {/* Suspense fallback is null: lazy route chunks resolve fast and a
                flash of spinner would be worse than a brief blank on a cached
                vendor set. */}
            <Suspense fallback={null}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/store" element={<Storefront />} />
                <Route path="/marketing" element={<Marketing />} />
                <Route path="/services" element={<Services />} />
                <Route path="/cart" element={<Cart />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/account" element={<Account />} />
                <Route path="/exclusive" element={<ExclusiveMembers />} />
                <Route path="/reseller" element={<ResellerPortal />} />
                <Route path="/creatives" element={<RegisteredCreatives />} />
                <Route path="/support" element={<Support />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
            {/* Legacy modal kept for ?product= URL deep-links only; card clicks
                open the new ProductModalProvider popup. Never both at once. */}
            <ProductModalWrapper />
            {/* Site-wide 24/7 Sales Concierge (feature 06). Routes through the
                codex-proxy via llm.ts and renders nothing when the LLM is down.
                Replaces the dead Kiro-backed floating chat. Lazy-loaded. */}
            {!hideFloatingWidgets && !state.hideConcierge && (
              <Suspense fallback={null}>
                <SalesConcierge />
              </Suspense>
            )}
            {!hideFloatingWidgets && !state.hideAvatar && (
              <Suspense fallback={null}>
                <AIFeature backend="codex" feature="member-ordering-avatar" recheckMs={60_000}>
                  <MemberOrderingAvatar variant="floating" showGuestTeaser={false} />
                </AIFeature>
              </Suspense>
            )}
            <SettingsPanel />
          </ProductModalProvider>
        </CompareProvider>
      </ResellerProvider>
    </AccountProvider>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppProvider>
          <AppContent />
        </AppProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
