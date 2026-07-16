/**
 * ProductDetailModal — the rich product-card popup.
 *
 * Opened via `useProductModal().openProductModal(product)`. Shows the product's
 * 3D box (or image) plus full name, category, brand, price (incl. "from AED"
 * variable pricing), availability and the full description (enriched from
 * /products/{id}). It bundles three shopper tools:
 *
 *   (a) an AI chat panel grounded in THIS product — POSTs to
 *       {VITE_API_BASE}/api/llm/chat/completions. The LLM is UNSTABLE, so the
 *       panel health-checks on open and degrades to a calm "AI unavailable"
 *       note (never crashes / blocks the modal). Outages fire ai_outage.
 *   (b) a Compare button that flags the product into the compare tray.
 *   (c) three deep-link buttons (Claude / ChatGPT / Perplexity) that open the
 *       product in an external assistant with a URL-encoded prompt.
 *
 * Presentational styling mirrors the existing <ProductModal>.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot,
  CheckCircle,
  ExternalLink,
  FileText,
  GitCompareArrows,
  Search,
  Send,
  ShoppingCart,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import type { Product } from '@/lib/api';
import { getProductById } from '@/lib/api';
import { VPS_BASE } from '@/lib/health';
import { reportAiOutage, track } from '@/lib/stable/analytics';
import {
  displayPrice,
  isOutOfStock,
  productImage,
  shortBlurb,
  stockLabel,
  type ProductLike,
} from '@/lib/product';
import { useApp } from '@/contexts/AppContext';
import { useCompare } from '@/contexts/CompareContext';
import { useToast } from '@/hooks/use-toast';
import ProductModelViewer from './ProductModelViewer';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import { ScrollArea } from './ui/scroll-area';

interface ProductDetailModalProps {
  product: Product;
  onClose: () => void;
}

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

type AiStatus = 'checking' | 'up' | 'down';

const HEALTH_TIMEOUT_MS = 2500;
const CHAT_TIMEOUT_MS = 20000;

const QUICK_PROMPTS = ["What's included?", 'Who is this for?', 'Is this right for me?'];

// ── Focus trap (keeps keyboard focus inside the dialog while open) ────────────
function useFocusTrap(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active || !ref.current) return;
    const container = ref.current;
    const selector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const nodes = Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
        (el) => !el.hasAttribute('disabled')
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onTab);
    return () => document.removeEventListener('keydown', onTab);
  }, [active]);
  return ref;
}

// ── LLM plumbing (direct to {VITE_API_BASE}/api/llm, the unstable proxy) ──────
const LLM_BASE = `${VPS_BASE.replace(/\/$/, '')}/api/llm`;

async function pingLlm(signal: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(`${LLM_BASE}/models`, { cache: 'no-store', signal });
    return res.ok;
  } catch {
    return false;
  }
}

async function askLlm(
  systemPrompt: string,
  history: ChatMsg[],
  question: string
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
  try {
    const res = await fetch(`${LLM_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: import.meta.env.VITE_LLM_MODEL || 'gpt-5.4',
        temperature: 0.4,
        max_tokens: 400,
        stream: false,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history.map((m) => ({ role: m.role, content: m.content })),
          { role: 'user', content: question },
        ],
      }),
    });
    if (!res.ok) throw new Error(`llm-http-${res.status}`);
    const data = await res.json();
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('llm-empty');
    return content.trim();
  } finally {
    clearTimeout(timer);
  }
}

function buildSystemPrompt(p: ProductLike): string {
  const included =
    p.whatsIncluded && p.whatsIncluded.length > 0
      ? `\nWhat's included: ${p.whatsIncluded.join(', ')}`
      : '';
  return (
    'You are a friendly DSM sales assistant helping a shopper decide on one ' +
    'specific product. Answer in warm, plain English for a non-technical buyer, ' +
    'keep it to 2-4 short sentences, and gently encourage adding it to the cart ' +
    'or requesting a tailored quote. Never invent prices or specs you were not ' +
    'given.\n\n' +
    `Product: ${p.name}\nBrand: ${p.brand}\nCategory: ${p.category}\n` +
    `License: ${p.licenseType}\nPrice: ${displayPrice(p)}\n` +
    `Availability: ${stockLabel(p)}\nDescription: ${p.description}${included}`
  );
}

/**
 * True when the product has no concrete price the shopper can pay online —
 * "Contact for pricing" style items. These get a "Request a quote" CTA instead
 * of Add to Cart / Buy Now (adding a price-less item to the cart would checkout
 * at AED 0). Any digit in the price or the "from" price counts as a real price,
 * so "from AED 1,200" is buyable.
 */
function needsQuote(p: ProductLike): boolean {
  const raw = (p.price ?? '').toString();
  const from = p.priceFrom ?? p.fromPrice;
  const hasNumber = /\d/.test(raw) || (from != null && /\d/.test(String(from)));
  return !hasNumber;
}

// ── External-assistant deep links ─────────────────────────────────────────────
function deepLinks(p: ProductLike) {
  const prompt = `Describe this software product and who it's for: ${p.name} — ${shortBlurb(p)}`;
  const q = encodeURIComponent(prompt);
  return [
    { key: 'claude', label: 'Claude', Icon: Sparkles, url: `https://claude.ai/new?q=${q}` },
    { key: 'chatgpt', label: 'ChatGPT', Icon: Bot, url: `https://chatgpt.com/?q=${q}` },
    { key: 'perplexity', label: 'Perplexity', Icon: Search, url: `https://www.perplexity.ai/search?q=${q}` },
  ];
}

export default function ProductDetailModal({ product, onClose }: ProductDetailModalProps) {
  const { toggleCompare, isComparing, atCapacity } = useCompare();
  const { addToCart } = useApp();
  const { toast } = useToast();
  const navigate = useNavigate();
  const modalRef = useFocusTrap(true);

  // Start with what the card handed us; enrich from /products/{id} (full
  // description + stock) once the modal is open. Enrichment failure is silent.
  const [detail, setDetail] = useState<ProductLike>(product as ProductLike);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatus>('checking');

  const chatEndRef = useRef<HTMLDivElement>(null);

  const comparing = isComparing(detail.id);
  const links = deepLinks(detail);
  const image = productImage(detail);
  const outOfStock = isOutOfStock(detail);
  const quoteOnly = needsQuote(detail);

  // ── Purchase actions ────────────────────────────────────────────────────────
  const pushToCart = useCallback(() => {
    addToCart({
      id: detail.id,
      name: detail.name,
      price: detail.price,
      category: detail.category,
      brand: detail.brand,
      licenseType: detail.licenseType,
      link: detail.link,
    });
    // Fire-and-forget analytics for the funnel.
    track({
      event: 'add_to_cart',
      eventType: 'ecommerce',
      productId: detail.id,
      elementText: detail.name,
      metadata: {
        source: 'product-detail-modal',
        price: displayPrice(detail),
        category: detail.category,
        brand: detail.brand,
      },
    });
  }, [addToCart, detail]);

  const handleAddToCart = useCallback(() => {
    pushToCart();
    toast({
      title: 'Added to cart',
      description: `${detail.name} is in your cart.`,
    });
  }, [pushToCart, toast, detail.name]);

  const handleBuyNow = useCallback(() => {
    pushToCart();
    track({
      event: 'buy_now',
      eventType: 'ecommerce',
      productId: detail.id,
      elementText: detail.name,
      metadata: { source: 'product-detail-modal' },
    });
    onClose();
    navigate('/checkout');
  }, [pushToCart, navigate, onClose, detail.id, detail.name]);

  const handleRequestQuote = useCallback(() => {
    track({
      event: 'request_quote',
      eventType: 'ecommerce',
      productId: detail.id,
      elementText: detail.name,
      metadata: { source: 'product-detail-modal' },
    });
    toast({
      title: 'Quote requested',
      description: `A DSM specialist will follow up with pricing for ${detail.name}.`,
    });
  }, [toast, detail.id, detail.name]);

  // Escape to close + lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // Enrich from the full product record.
  useEffect(() => {
    let active = true;
    getProductById(product.id)
      .then((full) => {
        if (active && full) setDetail((prev) => ({ ...prev, ...full }));
      })
      .catch(() => {
        /* keep the card-supplied product; enrichment is best-effort */
      });
    return () => {
      active = false;
    };
  }, [product.id]);

  // Health-check the LLM so the chat panel can degrade before the first send.
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    let active = true;
    pingLlm(controller.signal)
      .then((ok) => {
        if (!active) return;
        setAiStatus(ok ? 'up' : 'down');
        if (!ok) reportAiOutage('codex', 'product-detail-chat', 'health-check-failed');
      })
      .finally(() => clearTimeout(timer));
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [detail.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(
    async (raw?: string) => {
      const question = (raw ?? input).trim();
      if (!question || sending || aiStatus === 'down') return;

      const history = messages;
      setMessages((prev) => [...prev, { role: 'user', content: question }]);
      setInput('');
      setSending(true);
      try {
        const reply = await askLlm(buildSystemPrompt(detail), history, question);
        setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
        setAiStatus('up');
      } catch (err) {
        // Degrade gracefully — no crash, show the unavailable note.
        setAiStatus('down');
        reportAiOutage('codex', 'product-detail-chat', err);
      } finally {
        setSending(false);
      }
    },
    [input, sending, aiStatus, messages, detail]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-detail-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        className="relative flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-theme bg-surface-card shadow-premium-lg"
      >
        <button
          onClick={onClose}
          aria-label="Close product details"
          className="absolute right-4 top-4 z-50 flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] transition-colors hover:bg-white/[0.1]"
        >
          <X className="h-4 w-4 text-[#FEFEFE]" />
        </button>

        <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
          {/* Left — 3D box / image */}
          <div className="relative h-64 w-full flex-shrink-0 border-b border-white/[0.06] bg-secondary md:h-auto md:w-1/2 md:border-b-0 md:border-r">
            {image ? (
              <img
                src={image}
                alt={detail.name}
                className="h-full w-full object-contain p-6"
                loading="lazy"
              />
            ) : detail.link ? (
              <ProductModelViewer
                glbSrc={detail.link}
                fallbackIcon={
                  <div className="flex h-24 w-24 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04]">
                    <span className="font-serif text-3xl text-[#FEFEFE]/30">
                      {detail.name.charAt(0)}
                    </span>
                  </div>
                }
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <div className="flex h-32 w-32 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04]">
                  <span className="font-serif text-4xl text-[#FEFEFE]/30">
                    {detail.name.charAt(0)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Right — details + AI chat */}
          <div className="flex w-full flex-col md:w-1/2">
            <ScrollArea className="flex-1 p-8">
              <div className="space-y-6">
                <div>
                  <Badge variant="outline" className="mb-2 text-[10px] uppercase tracking-wider">
                    {detail.brand}
                  </Badge>
                  <h2
                    id="product-detail-title"
                    className="mb-2 font-serif text-3xl text-[#FEFEFE]"
                  >
                    {detail.name}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="border-crimson/20 bg-crimson/10 text-crimson">
                      {detail.category}
                    </Badge>
                    <Badge className="border-gold/20 bg-gold/10 text-gold">
                      {detail.licenseType}
                    </Badge>
                    {detail.platform && (
                      <Badge className="border-azure/20 bg-azure/10 text-azure">
                        {detail.platform}
                      </Badge>
                    )}
                    {detail.validity && (
                      <Badge variant="outline" className="text-[#B1B2B3]">
                        {detail.validity}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Price + availability */}
                <div className="flex items-end justify-between border-t border-white/[0.06] pt-4">
                  <div>
                    <span className="font-serif text-3xl text-[#FEFEFE]">
                      {displayPrice(detail)}
                    </span>
                    <p className="mt-1 text-xs uppercase tracking-wider text-[#B1B2B3]/50">
                      Genuine License
                    </p>
                  </div>
                  <span
                    className={`flex items-center gap-1.5 text-xs ${
                      outOfStock ? 'text-[#B1B2B3]/60' : 'text-emerald-500'
                    }`}
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    {stockLabel(detail)}
                  </span>
                </div>

                {/* ── Purchase CTAs ──────────────────────────────────────── */}
                {quoteOnly ? (
                  <Button
                    onClick={handleRequestQuote}
                    className="group h-14 w-full rounded-xl bg-gradient-to-r from-gold to-gold/80 text-base font-semibold text-[#0A0A0A] shadow-[0_8px_30px_-8px_rgba(212,175,55,0.6)] transition-all hover:shadow-[0_12px_40px_-8px_rgba(212,175,55,0.8)] hover:brightness-110"
                  >
                    <FileText className="mr-2 h-5 w-5" />
                    Request a quote
                  </Button>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Button
                      onClick={handleBuyNow}
                      disabled={outOfStock}
                      className="group h-14 w-full rounded-xl bg-gradient-to-r from-crimson to-crimson-dark text-base font-semibold text-[#FEFEFE] shadow-[0_8px_30px_-8px_rgba(220,38,38,0.7)] transition-all hover:brightness-110 hover:shadow-[0_12px_40px_-8px_rgba(220,38,38,0.9)] disabled:opacity-40 disabled:shadow-none"
                    >
                      <Zap className="mr-2 h-5 w-5 transition-transform group-hover:scale-110" />
                      {outOfStock ? 'Out of stock' : 'Buy Now'}
                    </Button>
                    <Button
                      onClick={handleAddToCart}
                      disabled={outOfStock}
                      variant="outline"
                      className="h-14 w-full rounded-xl border-crimson/40 bg-crimson/5 text-base font-semibold text-[#FEFEFE] transition-all hover:border-crimson hover:bg-crimson/15 disabled:opacity-40"
                    >
                      <ShoppingCart className="mr-2 h-5 w-5" />
                      Add to Cart
                    </Button>
                  </div>
                )}

                {/* Full description */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium uppercase tracking-wider text-[#FEFEFE]">
                    About this product
                  </h3>
                  <p className="text-sm leading-relaxed text-[#B1B2B3]">
                    {detail.description || 'No description available for this product yet.'}
                  </p>
                </div>

                {/* What's included */}
                {detail.whatsIncluded && detail.whatsIncluded.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium uppercase tracking-wider text-[#FEFEFE]">
                      What's included
                    </h3>
                    <ul className="space-y-1.5">
                      {detail.whatsIncluded.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-[#B1B2B3]">
                          <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Compare + external assistants */}
                <div className="space-y-3 border-t border-white/[0.06] pt-4">
                  <Button
                    onClick={() => toggleCompare(detail)}
                    variant={comparing ? 'default' : 'outline'}
                    disabled={!comparing && atCapacity}
                    className={
                      comparing
                        ? 'w-full bg-crimson text-[#FEFEFE] hover:bg-crimson-dark'
                        : 'w-full border-white/[0.1] text-[#FEFEFE]'
                    }
                  >
                    <GitCompareArrows className="mr-2 h-4 w-4" />
                    {comparing
                      ? 'Added to compare'
                      : atCapacity
                        ? 'Compare list full'
                        : 'Compare'}
                  </Button>

                  <div>
                    <p className="mb-2 text-[11px] uppercase tracking-wider text-[#B1B2B3]/50">
                      Ask an external assistant
                    </p>
                    <div className="flex gap-2">
                      {links.map(({ key, label, Icon, url }) => (
                        <a
                          key={key}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Ask ${label} about ${detail.name}`}
                          title={`Ask ${label} about this product`}
                          className="group flex flex-1 items-center justify-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-xs text-[#B1B2B3] transition-all hover:border-crimson/30 hover:bg-crimson/10 hover:text-crimson"
                        >
                          <Icon className="h-4 w-4" />
                          <span className="hidden sm:inline">{label}</span>
                          <ExternalLink className="h-3 w-3 opacity-40 transition-opacity group-hover:opacity-100" />
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>

            {/* AI chat panel (grounded in this product) */}
            <div className="border-t border-theme bg-surface-elevated p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-crimson" />
                  <span className="text-xs font-medium uppercase tracking-wider text-[#FEFEFE]">
                    Ask about this product
                  </span>
                </div>
                {aiStatus === 'down' && (
                  <span className="text-[10px] uppercase tracking-wider text-[#B1B2B3]/50">
                    AI unavailable
                  </span>
                )}
              </div>

              {aiStatus === 'down' ? (
                <p className="rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-[#B1B2B3]/70">
                  Our product assistant is offline right now. You can still add this to your
                  cart or request a quote — a DSM specialist will follow up.
                </p>
              ) : (
                <>
                  {messages.length > 0 && (
                    <ScrollArea className="mb-3 max-h-32">
                      <div className="space-y-2 pr-4">
                        {messages.map((m, i) => (
                          <div
                            key={i}
                            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[80%] rounded-lg px-3 py-2 text-xs ${
                                m.role === 'user'
                                  ? 'bg-crimson/20 text-[#FEFEFE]'
                                  : 'bg-white/[0.04] text-[#B1B2B3]'
                              }`}
                            >
                              {m.content}
                            </div>
                          </div>
                        ))}
                        {sending && (
                          <div className="flex justify-start">
                            <div className="rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-[#B1B2B3]">
                              Thinking…
                            </div>
                          </div>
                        )}
                        <div ref={chatEndRef} />
                      </div>
                    </ScrollArea>
                  )}

                  <div className="mb-3 flex flex-wrap gap-2">
                    {QUICK_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => send(prompt)}
                        disabled={sending || aiStatus === 'checking'}
                        className="rounded-sm border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-xs text-[#B1B2B3] transition-all hover:border-crimson/20 hover:bg-crimson/10 hover:text-crimson disabled:opacity-50"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <Textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                      placeholder={
                        aiStatus === 'checking'
                          ? 'Connecting to the assistant…'
                          : 'Ask about this product…'
                      }
                      disabled={aiStatus === 'checking'}
                      className="min-h-[60px] resize-none border-white/[0.06] bg-white/[0.02] text-[#FEFEFE] placeholder:text-[#B1B2B3]/50"
                    />
                    <Button
                      onClick={() => void send()}
                      disabled={!input.trim() || sending || aiStatus === 'checking'}
                      className="bg-crimson px-4 text-[#FEFEFE] hover:bg-crimson-dark"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
