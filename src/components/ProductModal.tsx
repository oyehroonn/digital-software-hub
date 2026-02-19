import { X, CheckCircle, Sparkles, Send } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import ProductModelViewer from './ProductModelViewer';
import { Product, productChat } from '@/lib/api';
import { useApp } from '@/contexts/AppContext';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import { ScrollArea } from './ui/scroll-area';

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
  const { closeProduct } = useApp();
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modalRef = useFocusTrap(true);

  // Handle Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeProduct();
      }
    };
    document.addEventListener('keydown', handleEscape);
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [closeProduct]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    // Focus textarea when modal opens
    textareaRef.current?.focus();
  }, []);

  const handleSend = async (message?: string) => {
    const msg = message || inputValue.trim();
    if (!msg || isLoading) return;

    setChatMessages(prev => [...prev, { role: 'user', content: msg }]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await productChat(msg, product.id);
      setChatMessages(prev => [...prev, { role: 'assistant', content: response.message }]);
    } catch (error) {
      setChatMessages(prev => [
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeProduct();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-modal-title"
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-6xl max-h-[90vh] bg-[#060708] border border-white/[0.06] rounded-lg overflow-hidden flex flex-col shadow-premium-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={closeProduct}
          className="absolute top-4 right-4 z-50 w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition-colors"
          aria-label="Close modal"
        >
          <X className="w-4 h-4 text-[#FEFEFE]" />
        </button>

        <div className="flex-1 flex overflow-hidden">
          {/* Left: 3D Model */}
          <div className="w-1/2 border-r border-white/[0.06] bg-secondary">
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

          {/* Right: Product Details */}
          <div className="w-1/2 flex flex-col">
            <ScrollArea className="flex-1 p-8">
              <div className="space-y-6">
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
              </div>
            </ScrollArea>

            {/* AI Chat Section (sticky bottom) */}
            <div className="border-t border-white/[0.06] bg-[#0a0b0d] p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-crimson" />
                <span className="text-xs font-medium text-[#FEFEFE] uppercase tracking-wider">
                  Product AI Assistant
                </span>
              </div>

              {/* Chat Messages */}
              {chatMessages.length > 0 && (
                <ScrollArea className="max-h-32 mb-3">
                  <div className="space-y-2 pr-4">
                    {chatMessages.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg px-3 py-2 text-xs ${
                            msg.role === 'user'
                              ? 'bg-crimson/20 text-[#FEFEFE]'
                              : 'bg-white/[0.04] text-[#B1B2B3]'
                          }`}
                        >
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    {isLoading && (
                      <div className="flex justify-start">
                        <div className="bg-white/[0.04] rounded-lg px-3 py-2 text-xs text-[#B1B2B3]">
                          Thinking...
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                </ScrollArea>
              )}

              {/* Quick Prompts */}
              <div className="flex flex-wrap gap-2 mb-3">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleQuickPrompt(prompt)}
                    className="px-3 py-1.5 text-xs bg-white/[0.03] border border-white/[0.06] rounded-sm text-[#B1B2B3] hover:bg-crimson/10 hover:border-crimson/20 hover:text-crimson transition-all"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              {/* Input */}
              <div className="flex gap-2">
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
                  placeholder="Ask about this product..."
                  className="min-h-[60px] resize-none bg-white/[0.02] border-white/[0.06] text-[#FEFEFE] placeholder:text-[#B1B2B3]/50"
                />
                <Button
                  onClick={() => handleSend()}
                  disabled={!inputValue.trim() || isLoading}
                  className="bg-crimson hover:bg-crimson-dark text-[#FEFEFE] px-4"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

