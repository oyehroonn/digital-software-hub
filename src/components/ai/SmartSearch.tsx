/**
 * SmartSearch — Feature 03: Smart Product Search (global search bar)
 * ==================================================================
 * A natural-language global search that turns plain-English needs
 * ("cheapest office for my laptop", "windows 11 for a new PC") into a
 * ranked list of products a non-technical buyer can act on immediately.
 *
 * RESILIENCE CONTRACT (see BUILD_CONTEXT):
 *   • Backend `vps` is UNSTABLE. The whole feature is wrapped in
 *     <AIFeature backend="vps"> so the live, AI-ranked experience only
 *     mounts when the VPS Flask API is healthy.
 *   • The AIFeature `fallback` is a fully-working STATIC search powered by
 *     the bundled `catalogueProducts.json` index — so search KEEPS WORKING
 *     with zero backends up (offline, VPS down, whatever). This is the one
 *     feature that must never disappear.
 *   • The codex-proxy (LLM) is used only to add a friendly, sales-first
 *     one-liner on top of results — it degrades silently when unavailable.
 *   • Queries made during an outage are parked in the offline queue and
 *     replayed to analytics once a backend returns, so we never lose intent.
 *
 * This component is intentionally NOT wired into any page here — the Wire
 * step mounts it. It compiles and runs standalone; navigation is delegated
 * to optional `onSelect` / `onSubmit` props (with sensible link defaults).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, Sparkles, Loader2, ArrowRight, WifiOff, Tag } from 'lucide-react';

import { cn } from '@/lib/utils';
import AIFeature from '@/components/ai/AIFeature';
import { searchProducts, aiSearch, type Product } from '@/lib/api';
import { checkCodex } from '@/lib/health';
import { chat } from '@/lib/llm';
import { track, reportAiOutage } from '@/lib/stable/analytics';
import { registerProcessor, enqueue } from '@/lib/offlineQueue';
import catalogue from '@/data/catalogueProducts.json';

// ── Public types ─────────────────────────────────────────────────────────────

/** A single, buyer-ready search hit rendered in the dropdown. */
export interface SmartSearchResult {
  id: string | number;
  name: string;
  category: string;
  price: string;
  oldPrice?: string;
  /** Deep link to open the product; used by the default onSelect. */
  href: string;
  /** Plain-English reason this matched, e.g. "On sale — save AED 450". */
  reason?: string;
  /** Relevance score (higher is better). */
  score: number;
}

export type SmartSearchMode = 'live' | 'offline';

export interface SmartSearchProps {
  className?: string;
  placeholder?: string;
  /** Fired when a shopper picks a result. Defaults to navigating to href. */
  onSelect?: (result: SmartSearchResult) => void;
  /** Fired on submit / "See all matches". Defaults to /store?q=… */
  onSubmit?: (query: string) => void;
  /** Use the light-on-light input treatment (matches the existing SearchBar). */
  darkText?: boolean;
}

// ── Shared search contract ───────────────────────────────────────────────────

interface SearchOutcome {
  results: SmartSearchResult[];
  suggestions: string[];
  mode: SmartSearchMode;
}

type SearchFn = (query: string, signal: AbortSignal) => Promise<SearchOutcome>;
type HeadlineFn = (
  query: string,
  results: SmartSearchResult[],
  signal: AbortSignal,
) => Promise<string | null>;

// ── Bundled static index (works fully offline) ───────────────────────────────

interface CatalogueProduct {
  id: number | string;
  name: string;
  category: string;
  price: string;
  folder: string;
  oldPrice?: string;
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'for', 'to', 'of', 'and', 'or', 'with', 'my', 'me', 'i',
  'need', 'want', 'looking', 'buy', 'get', 'best', 'cheapest', 'cheap', 'good',
  'please', 'help', 'find', 'search', 'software', 'license', 'licence', 'key',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

interface IndexedDoc {
  product: CatalogueProduct;
  haystack: string;
  tokens: Set<string>;
}

/** Build the static index once at module load — cheap, ~350 rows. */
const STATIC_INDEX: IndexedDoc[] = (catalogue as CatalogueProduct[]).map((product) => {
  const haystack = `${product.name} ${product.category}`.toLowerCase();
  return { product, haystack, tokens: new Set(tokenize(haystack)) };
});

function parsePrice(price?: string): number | null {
  if (!price) return null;
  const n = Number(price.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function productHref(id: string | number): string {
  return `/store?product=${encodeURIComponent(String(id))}`;
}

/** Turn price/discount signal into a short sales-first reason line. */
function saleReason(price?: string, oldPrice?: string, category?: string): string | undefined {
  const now = parsePrice(price);
  const was = parsePrice(oldPrice);
  if (now != null && was != null && was > now) {
    const saved = Math.round(was - now);
    return `On sale — save AED ${saved.toLocaleString()}`;
  }
  return category ? `Top pick in ${category}` : undefined;
}

/**
 * Rank the bundled catalogue against a natural-language query. Pure, fast,
 * dependency-free — this is what keeps search alive when every backend is down.
 */
function staticRank(query: string, limit = 6): SmartSearchResult[] {
  const terms = tokenize(query);
  const raw = query.trim().toLowerCase();
  if (!raw) return [];

  const scored = STATIC_INDEX.map((doc) => {
    let score = 0;

    // Whole-phrase substring is the strongest signal.
    if (doc.haystack.includes(raw)) score += 12;

    for (const term of terms) {
      if (doc.tokens.has(term)) score += 5; // exact token
      else if (doc.haystack.includes(term)) score += 2; // partial
    }

    // Nudge names over category-only matches.
    if (terms.some((t) => doc.product.name.toLowerCase().includes(t))) score += 2;

    // Gentle boost for on-sale items (sales-first).
    if (parsePrice(doc.product.oldPrice) != null) score += 0.5;

    return { doc, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ doc, score }) => ({
    id: doc.product.id,
    name: doc.product.name,
    category: doc.product.category,
    price: doc.product.price,
    oldPrice: doc.product.oldPrice,
    href: productHref(doc.product.id),
    reason: saleReason(doc.product.price, doc.product.oldPrice, doc.product.category),
    score,
  }));
}

function staticSuggestions(query: string): string[] {
  const terms = tokenize(query);
  if (!terms.length) return [];
  const cats = new Set<string>();
  for (const doc of STATIC_INDEX) {
    if (terms.some((t) => doc.haystack.includes(t))) cats.add(doc.product.category);
    if (cats.size >= 4) break;
  }
  return [...cats];
}

// ── Offline-queue replay (genuine cross-outage capture) ──────────────────────
// Queries made while a backend was down are parked here and replayed to the
// analytics API on reconnect, so the team still learns what buyers looked for.

interface OfflineQuery {
  query: string;
  resultCount: number;
  capturedAt: number;
}

const OFFLINE_QUERY_KIND = 'smart-search-offline';

registerProcessor<OfflineQuery>(OFFLINE_QUERY_KIND, async (payload) => {
  // track() is fire-and-forget and never throws; resolving drops the item.
  track({
    event: 'smart_search_offline_replay',
    eventType: 'ai',
    metadata: {
      feature: 'smart-search',
      query: payload.query,
      resultCount: payload.resultCount,
      capturedAt: payload.capturedAt,
    },
  });
});

function captureOfflineQuery(query: string, resultCount: number): void {
  enqueue<OfflineQuery>(OFFLINE_QUERY_KIND, {
    query,
    resultCount,
    capturedAt: Date.now(),
  });
}

// ── LLM headline (codex-proxy) — silent, best-effort enhancement ─────────────

let codexHealthAt = 0;
let codexHealthy = false;

/** Cache codex health for 60s so we don't probe on every keystroke. */
async function isCodexHealthy(): Promise<boolean> {
  const now = Date.now();
  if (now - codexHealthAt < 60_000) return codexHealthy;
  codexHealthAt = now;
  try {
    codexHealthy = (await checkCodex()).ok;
  } catch {
    codexHealthy = false;
  }
  return codexHealthy;
}

const liveHeadline: HeadlineFn = async (query, results, signal) => {
  if (results.length === 0) return null;
  if (query.trim().length < 6) return null;
  if (!(await isCodexHealthy())) return null;

  const top = results
    .slice(0, 5)
    .map((r) => `${r.name} (${r.price})`)
    .join('; ');

  try {
    const text = await chat(
      [
        {
          role: 'system',
          content:
            'You are a warm, concise sales assistant for DSM, a software & IT ' +
            'licensing store. In ONE short sentence (max 20 words), in plain ' +
            'English for a non-technical buyer, say what these results are and ' +
            'gently nudge them to pick one. No markdown, no lists, no price math.',
        },
        {
          role: 'user',
          content: `Shopper searched: "${query}". Top matches: ${top}. Write the one-line helper.`,
        },
      ],
      { temperature: 0.5, maxTokens: 60, timeoutMs: 6000, signal },
    );
    const line = text.trim().replace(/^["']|["']$/g, '');
    return line || null;
  } catch {
    // codex-proxy is unstable — degrade silently, results still stand.
    return null;
  }
};

// ── Live search (VPS `/search` + `/ai-search`) ───────────────────────────────

function mapProduct(p: Product): SmartSearchResult {
  const reason =
    [p.brand, p.category].filter(Boolean).join(' • ') ||
    p.licenseType ||
    undefined;
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    price: p.price,
    href: p.link || productHref(p.id),
    reason,
    score: 1,
  };
}

/**
 * Live search: ask the VPS for both keyword results (`/search`) and the AI
 * intent parse (`/ai-search`), then fuse them — AI-identified products float
 * to the top. If the VPS blips mid-session we report the outage and fall
 * straight through to the static index so the shopper never hits a dead end.
 */
const liveSearch: SearchFn = async (query, signal) => {
  const [kw, ai] = await Promise.allSettled([searchProducts(query), aiSearch(query)]);
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');

  if (kw.status === 'rejected' && ai.status === 'rejected') {
    reportAiOutage('vps', 'smart-search', kw.reason);
    return { results: staticRank(query), suggestions: staticSuggestions(query), mode: 'offline' };
  }

  const products = kw.status === 'fulfilled' ? kw.value.products : [];
  let results = products.map(mapProduct);

  const suggestions = new Set<string>();
  if (kw.status === 'fulfilled') kw.value.suggestions?.forEach((s) => suggestions.add(s));

  if (ai.status === 'fulfilled') {
    ai.value.suggestions?.forEach((s) => suggestions.add(s));
    // Reorder so AI-preferred product ids lead, preserving the rest.
    const priority = new Map(ai.value.productIds.map((id, i) => [String(id), i]));
    results = [...results].sort((a, b) => {
      const ra = priority.has(String(a.id)) ? priority.get(String(a.id))! : Number.MAX_SAFE_INTEGER;
      const rb = priority.has(String(b.id)) ? priority.get(String(b.id))! : Number.MAX_SAFE_INTEGER;
      return ra - rb;
    });
  }

  // Belt-and-braces: if the live keyword search returned nothing, still help
  // the shopper with the bundled index rather than an empty box.
  if (results.length === 0) {
    return {
      results: staticRank(query),
      suggestions: [...suggestions, ...staticSuggestions(query)].slice(0, 6),
      mode: 'offline',
    };
  }

  return { results: results.slice(0, 6), suggestions: [...suggestions].slice(0, 6), mode: 'live' };
};

/** Static search fn used by the AIFeature fallback (VPS down / offline). */
const staticSearch: SearchFn = async (query) => ({
  results: staticRank(query),
  suggestions: staticSuggestions(query),
  mode: 'offline',
});

// ── Shared presentational view ───────────────────────────────────────────────

interface SmartSearchViewProps extends SmartSearchProps {
  runSearch: SearchFn;
  /** Optional LLM enrichment (live only); omitted for the static fallback. */
  getHeadline?: HeadlineFn;
  /** Mode shown before the first query resolves. */
  baseMode: SmartSearchMode;
}

function SmartSearchView({
  className,
  placeholder = 'Search products, brands, or tell us what you need…',
  onSelect,
  onSubmit,
  darkText = false,
  runSearch,
  getHeadline,
  baseMode,
}: SmartSearchViewProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SmartSearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [headline, setHeadline] = useState<string | null>(null);
  const [mode, setMode] = useState<SmartSearchMode>(baseMode);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback(
    (result: SmartSearchResult) => {
      track({
        event: 'smart_search_select',
        eventType: 'ai',
        productId: result.id,
        metadata: { feature: 'smart-search', mode, query, productName: result.name },
      });
      if (onSelect) onSelect(result);
      else if (typeof window !== 'undefined') window.location.assign(result.href);
      setOpen(false);
      setQuery('');
    },
    [onSelect, mode, query],
  );

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const q = query.trim();
      if (!q) return;
      track({
        event: 'smart_search',
        eventType: 'ai',
        metadata: { feature: 'smart-search', query: q, mode, resultCount: results.length },
      });
      if (mode === 'offline') captureOfflineQuery(q, results.length);
      if (onSubmit) onSubmit(q);
      else if (typeof window !== 'undefined') {
        window.location.assign(`/store?q=${encodeURIComponent(q)}`);
      }
      setOpen(false);
    },
    [query, mode, results.length, onSubmit],
  );

  // Debounced, cancellable search on every keystroke.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSuggestions([]);
      setHeadline(null);
      setOpen(false);
      setActive(-1);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const outcome = await runSearch(q, controller.signal);
        if (controller.signal.aborted) return;
        setResults(outcome.results);
        setSuggestions(outcome.suggestions);
        setMode(outcome.mode);
        setHeadline(null);
        setActive(-1);
        setOpen(true);

        // Non-blocking sales headline (live path only).
        if (getHeadline && outcome.results.length > 0) {
          getHeadline(q, outcome.results, controller.signal)
            .then((line) => {
              if (!controller.signal.aborted && line) setHeadline(line);
            })
            .catch(() => {
              /* silent degrade */
            });
        }
      } catch {
        if (controller.signal.aborted) return;
        // Last-ditch: never leave the shopper empty-handed.
        const fb = staticRank(q);
        setResults(fb);
        setSuggestions(staticSuggestions(q));
        setMode('offline');
        setHeadline(null);
        setOpen(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 280);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, runSearch, getHeadline]);

  // Close on outside click.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Cmd/Ctrl-K focuses the global search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        if (query.trim()) setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [query]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && active >= 0 && results[active]) {
      e.preventDefault();
      handleSelect(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showPanel = open && (results.length > 0 || suggestions.length > 0);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <form onSubmit={handleSubmit} className="relative">
        <Search
          className={cn(
            'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors',
            darkText ? 'text-[#666666]/70' : 'text-[#B1B2B3]/50',
          )}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => query.trim() && setOpen(true)}
          placeholder={placeholder}
          aria-label="Search products"
          className={cn(
            'w-full pl-10 pr-10 py-2.5 rounded-sm text-sm transition-all focus:outline-none focus:border-crimson/50',
            darkText
              ? 'bg-black/[0.04] border border-black/[0.1] text-[#1a1a1a] placeholder:text-[#666666]/70 focus:bg-black/[0.06]'
              : 'bg-white/[0.02] border border-white/[0.06] text-[#FEFEFE] placeholder:text-[#B1B2B3]/50 focus:bg-white/[0.04]',
          )}
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-crimson animate-spin" />
        ) : (
          query.trim() && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery('');
                setOpen(false);
              }}
              className={cn(
                'absolute right-3 top-1/2 -translate-y-1/2 transition-colors',
                darkText
                  ? 'text-[#666666]/70 hover:text-[#1a1a1a]'
                  : 'text-[#B1B2B3]/50 hover:text-[#FEFEFE]',
              )}
            >
              ×
            </button>
          )
        )}
      </form>

      {showPanel && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-surface-card border border-theme rounded-lg shadow-premium-lg z-50 max-h-[28rem] overflow-y-auto">
          {/* Sales-first headline / mode banner */}
          {(headline || mode === 'offline') && (
            <div className="flex items-start gap-2 p-3 border-b border-white/[0.06]">
              {mode === 'offline' ? (
                <WifiOff className="w-3.5 h-3.5 mt-0.5 text-crimson shrink-0" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 mt-0.5 text-crimson shrink-0" />
              )}
              <p className="text-xs leading-relaxed text-[#B1B2B3]">
                {headline ||
                  'Showing our best in-stock matches — pick one to see full details and pricing.'}
              </p>
            </div>
          )}

          {/* Product results */}
          {results.length > 0 && (
            <div className="p-3">
              <div className="text-xs font-medium text-[#B1B2B3]/70 uppercase tracking-wider mb-2 px-2">
                Best matches
              </div>
              <div className="space-y-1">
                {results.map((r, i) => (
                  <button
                    key={`${r.id}-${i}`}
                    onClick={() => handleSelect(r)}
                    onMouseEnter={() => setActive(i)}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded-sm transition-colors group',
                      active === i ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]',
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-[#FEFEFE] group-hover:text-crimson transition-colors truncate">
                        {r.name}
                      </span>
                      <span className="text-sm font-medium text-[#FEFEFE] shrink-0">{r.price}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {r.oldPrice && parsePrice(r.oldPrice) != null && (
                        <span className="text-xs text-[#B1B2B3]/40 line-through">{r.oldPrice}</span>
                      )}
                      {r.reason && (
                        <span className="flex items-center gap-1 text-xs text-[#B1B2B3]/60">
                          {r.reason.startsWith('On sale') && <Tag className="w-3 h-3 text-crimson" />}
                          {r.reason}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Suggested refinements */}
          {suggestions.length > 0 && (
            <div className="p-3 border-t border-white/[0.06]">
              <div className="text-xs font-medium text-[#B1B2B3]/70 uppercase tracking-wider mb-2 px-2">
                Try also
              </div>
              <div className="space-y-1">
                {suggestions.slice(0, 4).map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setQuery(s)}
                    className="w-full text-left px-3 py-1.5 text-sm text-[#B1B2B3] hover:bg-white/[0.04] hover:text-[#FEFEFE] rounded-sm transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* See-all footer */}
          <button
            onClick={() => handleSubmit()}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border-t border-white/[0.06] text-xs font-medium text-crimson hover:bg-white/[0.04] transition-colors"
          >
            See all matches for "{query.trim()}"
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Live / static variants ───────────────────────────────────────────────────

function LiveSmartSearch(props: SmartSearchProps) {
  return (
    <SmartSearchView
      {...props}
      runSearch={liveSearch}
      getHeadline={liveHeadline}
      baseMode="live"
    />
  );
}

function StaticSmartSearch(props: SmartSearchProps) {
  return <SmartSearchView {...props} runSearch={staticSearch} baseMode="offline" />;
}

// ── Public component ─────────────────────────────────────────────────────────

/**
 * Global Smart Search.
 *
 * When the VPS API is healthy → live, AI-ranked results (`/search` +
 * `/ai-search`) with a friendly codex-proxy headline. When the VPS is down →
 * the AIFeature fallback renders the SAME search UI backed by the bundled
 * static index, so search never breaks. The VPS base is resolved from
 * VITE_API_BASE by the shared api/health clients.
 */
export default function SmartSearch(props: SmartSearchProps) {
  return (
    <AIFeature
      backend="vps"
      feature="smart-search"
      recheckMs={30_000}
      fallback={<StaticSmartSearch {...props} />}
    >
      <LiveSmartSearch {...props} />
    </AIFeature>
  );
}

export { StaticSmartSearch, LiveSmartSearch };
