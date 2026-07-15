import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { AppProvider, useApp } from "@/contexts/AppContext";
import { useEffect, lazy, Suspense } from "react";
import ProductModalWrapper from "./components/ProductModalWrapper";
import GlobalAIChat from "./components/GlobalAIChat";
import SettingsPanel from "./components/SettingsPanel";

// Route pages are code-split: only the visited route's chunk is fetched, so the
// initial JS payload is just the landing page + shared vendor chunks (AL10).
const Index = lazy(() => import("./pages/Index"));
const Storefront = lazy(() => import("./pages/Storefront"));
const Marketing = lazy(() => import("./pages/Marketing"));
const Services = lazy(() => import("./pages/Services"));
const Cart = lazy(() => import("./pages/Cart"));
const Checkout = lazy(() => import("./pages/Checkout"));
const NotFound = lazy(() => import("./pages/NotFound"));
// Site-wide floating concierge (feature 06) — deferred so the LLM chat code
// never sits in the entry bundle; AIFeature still gates it on proxy health.
const SalesConcierge = lazy(() => import("./components/ai/SalesConcierge"));

const queryClient = new QueryClient();

const AppContent = () => {
  const { state, setNavigate } = useApp();
  const navigate = useNavigate();
  
  // Set navigate function in AppContext so AI actions can use it
  useEffect(() => {
    setNavigate(navigate);
  }, [navigate, setNavigate]);

  // When marketing mode is disabled, show only the chatbot
  if (!state.marketingMode) {
    return (
      <div className="fixed inset-0 bg-background">
        <GlobalAIChat />
        <SettingsPanel />
      </div>
    );
  }

  // Normal marketing mode - show full website
  return (
    <>
      {/* Suspense fallback is null: lazy route chunks resolve fast and a flash
          of spinner would be worse than a brief blank on a cached vendor set. */}
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/store" element={<Storefront />} />
          <Route path="/marketing" element={<Marketing />} />
          <Route path="/services" element={<Services />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <ProductModalWrapper />
      {/* Site-wide 24/7 Sales Concierge (feature 06). Routes through the
          codex-proxy via llm.ts and renders nothing when the LLM is down.
          Replaces the dead Kiro-backed floating chat. Lazy-loaded. */}
      <Suspense fallback={null}>
        <SalesConcierge />
      </Suspense>
      <SettingsPanel />
    </>
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
