import { MessageCircle, X, Send, Minimize2, Sparkles, ExternalLink } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { aiChat, AIChatResponse, Product } from '@/lib/api';
import { useApp } from '@/contexts/AppContext';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { ScrollArea } from './ui/scroll-area';
import ProductModelViewer from './ProductModelViewer';
import { Badge } from './ui/badge';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  actions?: Array<{ type: string; payload: any }>;
  products?: Product[];
}

const WELCOME_MESSAGE = "Hello! I'm your DSM concierge. I can help you find products, answer questions, or navigate the store. How can I assist you today?";

// Product Card Component for Chat
function ProductChatCard({ product, onSelect }: { product: Product; onSelect?: () => void }) {
  return (
    <div
      onClick={onSelect}
      className="w-full max-w-[280px] bg-surface-card border border-theme rounded-lg overflow-hidden cursor-pointer hover:border-crimson/30 transition-all group"
    >
      {/* 3D Model Preview */}
      <div className="relative h-48 bg-white/[0.02] overflow-hidden">
        {product.link ? (
          <ProductModelViewer
            glbSrc={product.link}
            fallbackIcon={
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-16 h-16 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                  <span className="text-xl font-serif text-foreground-primary/30">
                    {product.name.charAt(0)}
                  </span>
                </div>
              </div>
            }
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-16 h-16 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
              <span className="text-xl font-serif text-foreground-primary/30">
                {product.name.charAt(0)}
              </span>
            </div>
          </div>
        )}
      </div>
      
      {/* Product Info */}
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm text-foreground-primary line-clamp-2 group-hover:text-crimson transition-colors">
              {product.name}
            </h4>
            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
              {product.description}
            </p>
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {product.brand}
            </Badge>
            <Badge className="bg-crimson/10 text-crimson text-[10px] px-1.5 py-0">
              {product.category}
            </Badge>
          </div>
        </div>
        
        <div className="flex items-center justify-between pt-1 border-t border-theme">
          <span className="font-serif text-sm font-medium text-foreground-primary">
            {product.price}
          </span>
          <button className="text-xs text-crimson hover:text-crimson-dark flex items-center gap-1">
            View Details
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GlobalAIChat() {
  const { applyAIAction, state, openProduct } = useApp();
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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className="space-y-3">
                  <div
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                        msg.role === 'user'
                          ? 'bg-crimson/20 text-[#FEFEFE]'
                          : 'bg-white/[0.04] text-[#B1B2B3]'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                  
                  {/* Product Cards */}
                  {msg.products && msg.products.length > 0 && (
                    <div className="flex flex-wrap gap-3">
                      {msg.products.map((product) => (
                        <ProductChatCard
                          key={`${product.id}-${product.name}`}
                          product={product}
                          onSelect={() => {
                            try {
                              openProduct(product);
                            } catch (error) {
                              console.error('Error opening product:', error);
                            }
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white/[0.04] rounded-lg px-3 py-2 text-sm text-[#B1B2B3]">
                    Thinking...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </ScrollArea>

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

