import { X, CheckCircle, Sparkles, Send, ChevronUp, ChevronDown } from 'lucide-react';
import { useEffect, useState, useRef, useCallback } from 'react';
import ProductModelViewer from './ProductModelViewer';
import { Product, productChat } from '@/lib/api';
import { useApp } from '@/contexts/AppContext';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import FormattedMessage from './FormattedMessage';
import TypingIndicator from './TypingIndicator';

// Focus trap utility
function useFocusTrap(isActive: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !containerRef.current) return;

      const focusableElements = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute('disabled'));

      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleTab);
    const firstFocusable = containerRef.current.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    firstFocusable?.focus();

    return () => {
      document.removeEventListener('keydown', handleTab);
    };
  }, [isActive]);

  return containerRef;
}

interface ProductModalProps {
  product: Product;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const QUICK_PROMPTS = [
  "What's included?",
  "Who is this for?",
  "Setup steps",
];

export default function ProductModal({ product }: ProductModalProps) {
  const { closeProduct, openProductAIChat } = useApp();
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isChatActive, setIsChatActive] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modalRef = useFocusTrap(true);
  const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Handle Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeProduct();
      }
    };
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [closeProduct]);

  // Scroll chat to bottom
  useEffect(() => {
    requestAnimationFrame(() => {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
    });
  }, [chatMessages, isLoading]);

  // Clean up timer
  useEffect(() => {
    return () => {
      if (expandTimerRef.current) clearTimeout(expandTimerRef.current);
    };
  }, []);

  // Activate chat mode when user starts typing
  const handleInputChange = useCallback((value: string) => {
    setInputValue(value);
    if (value.trim().length > 0) {
      setIsChatActive(true);
    }
  }, []);

  // When input loses focus, auto-collapse chat after delay if empty
  const handleInputBlur = useCallback(() => {
    if (expandTimerRef.current) clearTimeout(expandTimerRef.current);
    expandTimerRef.current = setTimeout(() => {
      if (!inputValue.trim() && !isLoading && chatMessages.length === 0) {
        setIsChatActive(false);
      }
    }, 2000);
  }, [inputValue, isLoading, chatMessages.length]);

  const handleInputFocus = useCallback(() => {
    if (expandTimerRef.current) clearTimeout(expandTimerRef.current);
    if (chatMessages.length > 0) {
      setIsChatActive(true);
    }
  }, [chatMessages.length]);

  const handleSend = async (message?: string) => {
    const msg = message || inputValue.trim();
    if (!msg || isLoading) return;

    setIsChatActive(true);
    setChatMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await productChat(msg, product.id);
      setChatMessages((prev) => [...prev, { role: 'assistant', content: response.message }]);
    } catch (error) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    handleSend(prompt);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeProduct();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-modal-title"
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-6xl max-h-[90vh] bg-[#0D0D0F] border border-white/[0.08] rounded-2xl overflow-hidden flex flex-col shadow-2xl animate-in slide-in-from-bottom-4 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={closeProduct}
          className="absolute top-4 right-4 z-50 w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.06] hover:bg-white/[0.1] transition-colors"
          aria-label="Close modal"
        >
          <X className="w-4 h-4 text-[#FEFEFE]" />
        </button>

        <div className="flex-1 flex overflow-hidden">
          {/* Left: 3D Model */}
          <div className="w-1/2 border-r border-white/[0.06] bg-[#0A0A0C]">
            <div className="h-full relative">
              {product.link ? (
                <ProductModelViewer
                  glbSrc={product.link}
                  fallbackIcon={
                    <div className="w-24 h-24 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                      <span className="text-3xl font-serif text-[#FEFEFE]/30">
                        {product.name.charAt(0)}
                      </span>
                    </div>
                  }
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="w-32 h-32 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                    <span className="text-4xl font-serif text-[#FEFEFE]/30">
                      {product.name.charAt(0)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Product Details + Chat */}
          <div className="w-1/2 flex flex-col">
            {/* Product Details — collapsible */}
            <div
              className="overflow-hidden transition-all duration-400 ease-in-out border-b border-white/[0.06]"
              style={{
                maxHeight: isChatActive ? '0px' : '600px',
                opacity: isChatActive ? 0 : 1,
              }}
            >
              <div
                className="p-8 space-y-6 overflow-y-auto"
                style={{
                  maxHeight: '60vh',
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'rgba(255,255,255,0.06) transparent',
                }}
              >
                {/* Title & Brand */}
                <div>
                  <Badge variant="outline" className="mb-2 text-[10px] uppercase tracking-wider">
                    {product.brand}
                  </Badge>
                  <h2 id="product-modal-title" className="font-serif text-3xl text-[#FEFEFE] mb-2">
                    {product.name}
                  </h2>
                  <p className="text-sm text-[#B1B2B3]/70">{product.description}</p>
                </div>

                {/* Attributes */}
                <div className="flex flex-wrap gap-2">
                  <Badge className="bg-crimson/10 text-crimson border-crimson/20">
                    {product.category}
                  </Badge>
                  <Badge className="bg-gold/10 text-gold border-gold/20">
                    {product.licenseType}
                  </Badge>
                  {product.platform && (
                    <Badge className="bg-azure/10 text-azure border-azure/20">
                      {product.platform}
                    </Badge>
                  )}
                  {product.validity && (
                    <Badge variant="outline" className="text-[#B1B2B3]">
                      {product.validity}
                    </Badge>
                  )}
                </div>

                {/* Price */}
                <div className="pt-4 border-t border-white/[0.06]">
                  <div className="flex items-baseline gap-3">
                    <span className="font-serif text-3xl text-[#FEFEFE]">{product.price}</span>
                    <span className="text-xs text-[#B1B2B3]/50 uppercase tracking-wider">
                      Genuine License
                    </span>
                  </div>
                </div>

                {/* What's Included */}
                {product.whatsIncluded && product.whatsIncluded.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-[#FEFEFE] uppercase tracking-wider">
                      What's Included
                    </h3>
                    <ul className="space-y-1.5">
                      {product.whatsIncluded.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-[#B1B2B3]">
                          <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* CTAs */}
                <div className="flex gap-3 pt-4">
                  <Button className="flex-1 bg-crimson hover:bg-crimson-dark text-[#FEFEFE]">
                    Add to Cart
                  </Button>
                  <Button variant="outline" className="flex-1 border-white/[0.06] text-[#FEFEFE]">
                    Request Quote
                  </Button>
                </div>

                {/* AI Chat Button */}
                <button
                  onClick={() => openProductAIChat(product)}
                  className="w-full mt-3 flex items-center justify-center gap-2 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-lg text-sm text-[#B1B2B3] hover:bg-crimson/10 hover:border-crimson/20 hover:text-crimson transition-all"
                >
                  <Sparkles className="w-4 h-4" />
                  Open full AI chat
                </button>
              </div>
            </div>

            {/* Collapsed product bar — visible when chat is active */}
            <div
              className="overflow-hidden transition-all duration-300 ease-in-out"
              style={{
                maxHeight: isChatActive ? '56px' : '0px',
                opacity: isChatActive ? 1 : 0,
              }}
            >
              <button
                onClick={() => setIsChatActive(false)}
                className="w-full flex items-center gap-3 px-6 py-3 border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors group"
              >
                <div className="flex-1 flex items-center gap-3 min-w-0">
                  <span className="text-xs font-medium text-[#FEFEFE] truncate">{product.name}</span>
                  <span className="text-[10px] text-crimson font-medium flex-shrink-0">{product.price}</span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-[#B1B2B3]/40 group-hover:text-[#B1B2B3]/70 transition-colors" />
              </button>
            </div>

            {/* Chat area — grows when active */}
            <div className="flex-1 flex flex-col min-h-0">
              {/* Chat header */}
              <div className="flex items-center justify-between px-6 py-3 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-crimson" />
                  <span className="text-xs font-medium text-[#FEFEFE] uppercase tracking-wider">
                    Product AI Assistant
                  </span>
                </div>
                {isChatActive && chatMessages.length > 0 && (
                  <button
                    onClick={() => openProductAIChat(product)}
                    className="text-[10px] text-[#B1B2B3]/50 hover:text-crimson transition-colors"
                  >
                    Open full chat →
                  </button>
                )}
              </div>

              {/* Chat messages */}
              <div
                ref={chatContainerRef}
                className="flex-1 overflow-y-auto overscroll-contain px-6 py-3 space-y-2.5"
                style={{
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'rgba(255,255,255,0.06) transparent',
                }}
              >
                {chatMessages.length === 0 && !isChatActive && (
                  <p className="text-xs text-[#B1B2B3]/40 text-center py-4">
                    Ask anything about this product...
                  </p>
                )}
                {chatMessages.map((msg, i) => (
                  <div
                    key={`${msg.role}-${i}`}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-1 fade-in duration-150`}
                  >
                    <div
                      className={`max-w-[85%] rounded-xl px-3.5 py-2 ${
                        msg.role === 'user'
                          ? 'bg-crimson/15 border border-crimson/20 text-[#FEFEFE]'
                          : 'bg-white/[0.03] border border-white/[0.04] text-[#B1B2B3]'
                      }`}
                    >
                      {msg.role === 'assistant' ? (
                        <FormattedMessage content={msg.content} className="text-xs leading-relaxed" />
                      ) : (
                        <span className="text-xs">{msg.content}</span>
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && <TypingIndicator variant="product" compact />}
                <div ref={chatEndRef} />
              </div>

              {/* Quick Prompts — only shown initially */}
              {chatMessages.length === 0 && (
                <div className="px-6 pb-2 flex flex-wrap gap-1.5">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => handleQuickPrompt(prompt)}
                      disabled={isLoading}
                      className="px-2.5 py-1 text-[10px] bg-white/[0.02] border border-white/[0.06] rounded-full text-[#B1B2B3]/60 hover:bg-crimson/8 hover:border-crimson/15 hover:text-crimson transition-all disabled:opacity-30"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              {/* Input */}
              <div className="px-6 py-3 border-t border-white/[0.06] bg-[#0A0A0C]">
                <div className="flex gap-2 items-end">
                  <textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Ask about this product..."
                    rows={1}
                    className="flex-1 min-h-[36px] max-h-[80px] resize-none rounded-lg bg-white/[0.03] border border-white/[0.06] px-3.5 py-2 text-xs text-[#FEFEFE] placeholder:text-[#B1B2B3]/30 focus:outline-none focus:border-crimson/30 focus:bg-white/[0.04] transition-all"
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = `${Math.min(target.scrollHeight, 80)}px`;
                    }}
                  />
                  <button
                    onClick={() => handleSend()}
                    disabled={!inputValue.trim() || isLoading}
                    className="w-9 h-9 flex items-center justify-center rounded-lg bg-crimson hover:bg-crimson/80 text-white transition-all disabled:opacity-30 disabled:bg-white/[0.04] disabled:text-[#B1B2B3]/30 flex-shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
