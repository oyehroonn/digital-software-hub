import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { AppProvider, useApp } from "@/contexts/AppContext";
import { useEffect } from "react";
import Index from "./pages/Index";
import Storefront from "./pages/Storefront";
import Marketing from "./pages/Marketing";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import NotFound from "./pages/NotFound";
import ProductModalWrapper from "./components/ProductModalWrapper";
import GlobalAIChat from "./components/GlobalAIChat";
import SettingsPanel from "./components/SettingsPanel";

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
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/store" element={<Storefront />} />
        <Route path="/marketing" element={<Marketing />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <ProductModalWrapper />
      <GlobalAIChat />
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
