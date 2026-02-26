import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { AppProvider, useApp } from "@/contexts/AppContext";
import { useEffect } from "react";
import Index from "./pages/Index";
import Storefront from "./pages/Storefront";
import NotFound from "./pages/NotFound";
import ProductModalWrapper from "./components/ProductModalWrapper";
import GlobalAIChat from "./components/GlobalAIChat";
import SettingsPanel from "./components/SettingsPanel";
import ProductAIChatPopup from "./components/ProductAIChatPopup";

const queryClient = new QueryClient();

const AppContent = () => {
  const { state, setNavigate, closeProductAIChat } = useApp();
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
        {state.productForAIChat && (
          <ProductAIChatPopup
            product={state.productForAIChat}
            onClose={() => closeProductAIChat()}
          />
        )}
      </div>
    );
  }

  // Normal marketing mode - show full website
  return (
    <>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/store" element={<Storefront />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <ProductModalWrapper />
      <GlobalAIChat />
      <SettingsPanel />
      {state.productForAIChat && (
        <ProductAIChatPopup
          product={state.productForAIChat}
          onClose={() => closeProductAIChat()}
        />
      )}
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
