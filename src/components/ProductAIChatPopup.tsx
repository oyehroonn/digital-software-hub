import { X, Send, Sparkles, ExternalLink, ChevronUp, ChevronDown, Package } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Product, productChat } from '@/lib/api';
import { useApp } from '@/contexts/AppContext';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import ProductModelViewer from './ProductModelViewer';
import FormattedMessage from './FormattedMessage';
import TypingIndicator from './TypingIndicator';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const QUICK_PROMPTS = [
  "What's included?",
  "Who is this for?",
  "Compare with alternatives",
  "Setup steps",
  "How many users?",
  "Tell me more",
];

interface ProductAIChatPopupProps {
  product: Product;
  onClose: () => void;
}

export default function ProductAIChatPopup({ product, onClose }: ProductAIChatPopupProps) {
  const { openProduct } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: `Hi! I'm your AI assistant for **${product.name}**. Ask me anything — features, pricing, licensing, comparisons, or setup steps.`,
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [productExpanded, setProductExpanded] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    requestAnimationFrame(() => {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
    });
  }, [messages, isLoading]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  // Clean up timer
  useEffect(() => {
    return () => {
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    };
  }, []);

  // Auto-collapse product info when user starts typing
  const handleInputChange = useCallback((value: string) => {
    setInputValue(value);
    if (value.trim().length > 0 && productExpanded) {
      setProductExpanded(false);
    }
  }, [productExpanded]);

  // Auto-expand product info after a delay when input is empty and not loading
  const handleInputBlur = useCallback(() => {
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = setTimeout(() => {
      if (!inputValue.trim() && !isLoading) {
        setProductExpanded(true);
      }
    }, 1500);
  }, [inputValue, isLoading]);

  const handleInputFocus = useCallback(() => {
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    if (inputValue.trim().length > 0 || messages.length > 1) {
      setProductExpanded(false);
    }
  }, [inputValue, messages.length]);

  const handleSend = async (message?: string) => {
    const msg = message || inputValue.trim();
    if (!msg || isLoading) return;

    // Collapse product info when chatting
    setProductExpanded(false);

    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await productChat(msg, product.id);
      setMessages((prev) => [...prev, { role: 'assistant', content: response.message }]);
    } catch (error) {
      console.error('Product chat error:', error);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleProduct = () => {
    setProductExpanded((prev) => !prev);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-overlay backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`AI Chat about ${product.name}`}
    >
      <div
        className="relative w-full max-w-2xl h-[85vh] max-h-[700px] bg-[#0D0D0F] border border-white/[0.08] rounded-2xl overflow-hidden flex flex-col shadow-2xl animate-in slide-in-from-bottom-4 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06] bg-[#0D0D0F]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg overflow-hidden bg-crimson/10 border border-crimson/20 flex-shrink-0 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-crimson" />
            </div>
            <div className="min-w-0">
              <span className="text-sm font-medium text-[#FEFEFE] truncate block">
                AI Chat
              </span>
              <span className="text-[10px] text-[#B1B2B3]/60 truncate block">
                {product.name}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                openProduct(product);
                onClose();
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] text-[#B1B2B3]/70 hover:text-crimson rounded-md hover:bg-white/[0.04] transition-all"
              title="View full product details"
            >
              <ExternalLink className="w-3 h-3" />
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-md text-[#B1B2B3]/50 hover:text-[#FEFEFE] hover:bg-white/[0.06] transition-all"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Collapsible Product Info ── */}
        <div className="border-b border-white/[0.06]">
          {/* Toggle bar — always visible */}
          <button
            onClick={toggleProduct}
            className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-white/[0.02] transition-colors group"
          >
            <div className="w-9 h-9 rounded-lg overflow-hidden bg-white/[0.03] border border-white/[0.06] flex-shrink-0">
              {product.link ? (
                <ProductModelViewer
                  glbSrc={product.link}
                  fallbackIcon={
                    <span className="text-xs font-medium text-[#FEFEFE]/30">
                      {product.name.charAt(0)}
                    </span>
                  }
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="w-4 h-4 text-[#B1B2B3]/30" />
                </div>
              )}
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="text-xs font-medium text-[#FEFEFE] truncate">{product.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-crimson font-medium">{product.price}</span>
                <span className="text-[10px] text-[#B1B2B3]/40">·</span>
                <span className="text-[10px] text-[#B1B2B3]/50">{product.brand}</span>
              </div>
            </div>
            <div className="text-[#B1B2B3]/30 group-hover:text-[#B1B2B3]/60 transition-colors">
              {productExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </div>
          </button>

          {/* Expandable detail card */}
          <div
            className="overflow-hidden transition-all duration-300 ease-in-out"
            style={{
              maxHeight: productExpanded ? '220px' : '0px',
              opacity: productExpanded ? 1 : 0,
            }}
          >
            <div className="px-5 pb-4 space-y-3">
              {/* Description */}
              {product.description && (
                <p className="text-xs text-[#B1B2B3]/70 leading-relaxed line-clamp-3">
                  {product.description}
                </p>
              )}
              {/* Badges */}
              <div className="flex flex-wrap gap-1.5">
                <Badge className="text-[9px] px-2 py-0.5 bg-crimson/10 text-crimson border-crimson/20">
                  {product.category}
                </Badge>
                <Badge className="text-[9px] px-2 py-0.5 bg-amber-500/10 text-amber-400 border-amber-500/20">
                  {product.licenseType}
                </Badge>
                {product.platform && (
                  <Badge className="text-[9px] px-2 py-0.5 bg-blue-500/10 text-blue-400 border-blue-500/20">
                    {product.platform}
                  </Badge>
                )}
              </div>
              {/* CTA */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    openProduct(product);
                    onClose();
                  }}
                  className="text-[10px] text-crimson hover:text-crimson/80 transition-colors underline underline-offset-2"
                >
                  View full product details →
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Chat Messages ── */}
        <div
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-3 scroll-smooth"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(255,255,255,0.08) transparent',
          }}
        >
          {messages.map((msg, i) => (
            <div
              key={`${msg.role}-${i}`}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 fade-in duration-200`}
              style={{ animationDelay: `${Math.min(i * 50, 200)}ms` }}
            >
              <div
                className={`max-w-[85%] rounded-xl px-4 py-2.5 ${
                  msg.role === 'user'
                    ? 'bg-crimson/15 border border-crimson/20 text-[#FEFEFE]'
                    : 'bg-white/[0.03] border border-white/[0.04] text-[#B1B2B3]'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <FormattedMessage content={msg.content} className="text-[13px] leading-relaxed" />
                ) : (
                  <span className="text-[13px]">{msg.content}</span>
                )}
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {isLoading && <TypingIndicator variant="product" />}

          <div ref={chatEndRef} />
        </div>

        {/* ── Quick Prompts ── */}
        {messages.length <= 2 && !isLoading && (
          <div className="px-5 pb-2 flex flex-wrap gap-1.5 animate-in fade-in duration-300">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => handleSend(prompt)}
                disabled={isLoading}
                className="px-3 py-1.5 text-[11px] bg-white/[0.02] border border-white/[0.06] rounded-full text-[#B1B2B3]/70 hover:bg-crimson/8 hover:border-crimson/15 hover:text-crimson transition-all disabled:opacity-30"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {/* ── Input Area ── */}
        <div className="px-5 py-3.5 border-t border-white/[0.06] bg-[#0A0A0C]">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
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
              placeholder={`Ask about ${product.name}...`}
              rows={1}
              className="flex-1 min-h-[40px] max-h-[100px] resize-none rounded-xl bg-white/[0.03] border border-white/[0.06] px-4 py-2.5 text-[13px] text-[#FEFEFE] placeholder:text-[#B1B2B3]/30 focus:outline-none focus:border-crimson/30 focus:bg-white/[0.04] transition-all"
              style={{
                height: 'auto',
                overflow: inputValue.split('\n').length > 3 ? 'auto' : 'hidden',
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = `${Math.min(target.scrollHeight, 100)}px`;
              }}
            />
            <button
              onClick={() => handleSend()}
              disabled={!inputValue.trim() || isLoading}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-crimson hover:bg-crimson/80 text-white transition-all disabled:opacity-30 disabled:bg-white/[0.04] disabled:text-[#B1B2B3]/30 flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
