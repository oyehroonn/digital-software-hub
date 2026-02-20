import { MessageCircle, X, Send, Minimize2, Sparkles, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { aiChat, AIChatResponse, Product } from '@/lib/api';
import { useApp } from '@/contexts/AppContext';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
// Using native scroll instead of Radix ScrollArea for reliable scrolling
import ProductModelViewer from './ProductModelViewer';
import { Badge } from './ui/badge';
import FormattedMessage from './FormattedMessage';
import TypingIndicator from './TypingIndicator';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  actions?: Array<{ type: string; payload: any }>;
  products?: Product[];
}

const WELCOME_MESSAGE = "Hello! I'm your DSM concierge. I can help you find products, answer questions, or navigate the store. How can I assist you today?";

// Product Card Component for Chat — compact for horizontal slider
function ProductChatCard({ product, onSelect, onAIChat }: { product: Product; onSelect?: () => void; onAIChat?: () => void }) {
  return (
    <div
      onClick={onSelect}
      className="w-[220px] min-w-[220px] bg-surface-card border border-theme rounded-lg overflow-hidden cursor-pointer hover:border-crimson/30 transition-all group flex-shrink-0 snap-start"
    >
      {/* 3D Model Preview — pointer-events disabled so slider drag works */}
      <div className="relative h-36 bg-white/[0.02] overflow-hidden pointer-events-none select-none">
        {product.link ? (
          <ProductModelViewer
            glbSrc={product.link}
            fallbackIcon={
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                  <span className="text-lg font-serif text-foreground-primary/30">
                    {product.name.charAt(0)}
                  </span>
                </div>
              </div>
            }
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
              <span className="text-lg font-serif text-foreground-primary/30">
                {product.name.charAt(0)}
              </span>
            </div>
          </div>
        )}
      </div>
      
      {/* Product Info */}
      <div className="p-2.5 space-y-1.5">
        <h4 className="font-medium text-xs text-foreground-primary line-clamp-2 leading-tight group-hover:text-crimson transition-colors">
          {product.name}
        </h4>
        
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="text-[9px] px-1 py-0 leading-tight">
            {product.brand}
          </Badge>
          <Badge className="bg-crimson/10 text-crimson text-[9px] px-1 py-0 leading-tight">
            {product.category}
          </Badge>
        </div>
        
        <div className="flex items-center justify-between pt-1 border-t border-theme">
          <span className="font-serif text-xs font-medium text-foreground-primary">
            {product.price}
          </span>
          <div className="flex items-center gap-1.5">
            {onAIChat && (
              <button
                onClick={(e) => { e.stopPropagation(); onAIChat(); }}
                className="text-[10px] text-muted-foreground hover:text-crimson flex items-center gap-0.5 transition-colors"
                title="Ask AI about this product"
              >
                <Sparkles className="w-2.5 h-2.5" />
              </button>
            )}
            <button className="text-[10px] text-crimson hover:text-crimson-dark flex items-center gap-0.5">
              View
              <ExternalLink className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Horizontal product slider with scroll arrows
function ProductSlider({ products, onSelect, onAIChat }: { 
  products: Product[]; 
  onSelect: (product: Product) => void;
  onAIChat: (product: Product) => void;
}) {
  const sliderRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollButtons = () => {
    if (!sliderRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = sliderRef.current;
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 4);
  };

  useEffect(() => {
    updateScrollButtons();
    const el = sliderRef.current;
    if (el) el.addEventListener('scroll', updateScrollButtons, { passive: true });
    return () => { if (el) el.removeEventListener('scroll', updateScrollButtons); };
  }, [products]);

  const scroll = (dir: 'left' | 'right') => {
    if (!sliderRef.current) return;
    const amount = 230; // card width + gap
    sliderRef.current.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  return (
    <div className="relative">
      {/* Left arrow — always visible when scrollable */}
      {canScrollLeft && (
        <button
          onClick={() => scroll('left')}
          className="absolute -left-1 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-crimson text-white shadow-lg flex items-center justify-center hover:bg-crimson-dark hover:scale-110 transition-all"
          aria-label="Scroll left"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}
      
      {/* Slider — touch-action horizontal only to allow vertical page scroll */}
      <div
        ref={sliderRef}
        className="flex gap-2.5 overflow-x-auto pb-2 snap-x snap-mandatory no-scrollbar px-1"
        style={{ touchAction: 'pan-x' }}
      >
        {products.map((product) => (
          <ProductChatCard
            key={`${product.id}-${product.name}`}
            product={product}
            onSelect={() => onSelect(product)}
            onAIChat={() => onAIChat(product)}
          />
        ))}
      </div>

      {/* Right arrow — always visible when scrollable */}
      {canScrollRight && (
        <button
          onClick={() => scroll('right')}
          className="absolute -right-1 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-crimson text-white shadow-lg flex items-center justify-center hover:bg-crimson-dark hover:scale-110 transition-all"
          aria-label="Scroll right"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

export default function GlobalAIChat() {
  const { applyAIAction, state, openProduct, openProductAIChat } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  
  // When marketing mode is disabled, always show chat fullscreen
  const isMarketingModeDisabled = !state.marketingMode;
  
  useEffect(() => {
    if (isMarketingModeDisabled) {
      setIsOpen(true);
      setIsMinimized(false);
    }
  }, [isMarketingModeDisabled]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: WELCOME_MESSAGE },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Restore state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('dsm-chat-state');
    if (saved) {
      try {
        const { isOpen: savedOpen, isMinimized: savedMin } = JSON.parse(saved);
        setIsOpen(savedOpen);
        setIsMinimized(savedMin);
      } catch (e) {
        // Ignore parse errors
      }
    }
  }, []);

  // Save state to localStorage
  useEffect(() => {
    localStorage.setItem('dsm-chat-state', JSON.stringify({ isOpen, isMinimized }));
  }, [isOpen, isMinimized]);

  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
    });
  }, [messages, isLoading]);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      textareaRef.current?.focus();
    }
  }, [isOpen, isMinimized]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  const handleSend = async () => {
    const msg = inputValue.trim();
    if (!msg || isLoading) return;

    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response: AIChatResponse = await aiChat(msg);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: response.message,
          actions: response.actions,
          products: response.products,
        },
      ]);

      // Execute actions (but don't navigate if we're showing products in chat)
      if (response.actions && response.actions.length > 0) {
        response.actions.forEach((action) => {
          // Skip NAVIGATE action if products are being shown in chat (to avoid page reload)
          if (action.type === 'NAVIGATE' && response.products && response.products.length > 0) {
            return;
          }
          // Delay action execution to avoid conflicts
          setTimeout(() => {
            try {
              applyAIAction(action);
            } catch (error) {
              console.error('Error executing AI action:', error);
            }
          }, 100);
        });
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInputValue(suggestion);
    setTimeout(() => handleSend(), 100);
  };

  if (!isOpen && !isMarketingModeDisabled) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-crimson hover:bg-crimson-dark text-[#FEFEFE] shadow-premium-lg flex items-center justify-center transition-all hover:scale-110"
        aria-label="Open AI chat"
      >
        <MessageCircle className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div
      className={`${
        isMarketingModeDisabled
          ? 'fixed inset-0 z-50 w-full h-full rounded-none'
          : 'fixed bottom-6 right-6 z-50 w-96 rounded-lg'
      } bg-surface-card border border-theme shadow-premium-lg flex flex-col transition-all ${
        isMinimized && !isMarketingModeDisabled ? 'h-14' : isMarketingModeDisabled ? 'h-full' : 'h-[600px]'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-crimson" />
          <span className="text-sm font-medium text-[#FEFEFE]">DSM Concierge</span>
        </div>
        <div className="flex items-center gap-2">
          {!isMarketingModeDisabled && (
            <>
              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="w-7 h-7 flex items-center justify-center rounded-sm text-[#B1B2B3] hover:text-[#FEFEFE] hover:bg-white/[0.06] transition-colors"
                aria-label={isMinimized ? 'Expand' : 'Minimize'}
                title={isMinimized ? 'Expand chat' : 'Minimize chat'}
              >
                <Minimize2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-sm text-[#B1B2B3] hover:text-crimson hover:bg-white/[0.06] transition-colors"
                aria-label="Close chat"
                title="Close chat"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Messages */}
          <div
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto overscroll-contain p-4"
            style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}
          >
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className="space-y-3">
                  <div
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                        msg.role === 'user'
                          ? 'bg-crimson/20 text-[#FEFEFE]'
                          : 'bg-white/[0.04] text-[#B1B2B3]'
                      }`}
                    >
                      {msg.role === 'assistant' ? (
                        <FormattedMessage content={msg.content} className="text-sm" />
                      ) : (
                        msg.content
                      )}
                    </div>
                  </div>
                  
                  {/* Product Cards — Horizontal Slider */}
                  {msg.products && msg.products.length > 0 && (
                    <ProductSlider
                      products={msg.products}
                      onSelect={(product) => {
                        try {
                          openProduct(product);
                        } catch (error) {
                          console.error('Error opening product:', error);
                        }
                      }}
                      onAIChat={(product) => openProductAIChat(product)}
                    />
                  )}
                </div>
              ))}
              {isLoading && <TypingIndicator variant="global" />}
              <div ref={chatEndRef} />
            </div>
          </div>

          {/* Input */}
          <div className="p-4 border-t border-white/[0.06] space-y-2">
            <Textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask me anything..."
              className="min-h-[60px] resize-none bg-white/[0.02] border-white/[0.06] text-[#FEFEFE] placeholder:text-[#B1B2B3]/50"
            />
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap gap-2">
                {messages[messages.length - 1]?.actions?.[0]?.payload?.suggestions?.slice(0, 2).map((s: string, i: number) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestionClick(s)}
                    className="px-2 py-1 text-xs bg-white/[0.03] border border-white/[0.06] rounded-sm text-[#B1B2B3] hover:bg-crimson/10 hover:border-crimson/20 hover:text-crimson transition-all"
                  >
                    {s}
                  </button>
                ))}
              </div>
              <Button
                onClick={handleSend}
                disabled={!inputValue.trim() || isLoading}
                className="bg-crimson hover:bg-crimson-dark text-[#FEFEFE] px-4"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

