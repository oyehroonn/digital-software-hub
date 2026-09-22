#!/usr/bin/env node
/**
 * generate-woo-product-map — builds a static id → WooCommerce-product mapping
 * so the storefront's "Buy Now" can deep-link straight to the OLD site's
 * checkout with the right item pre-added to the cart
 * (`/checkout/?add-to-cart=<wooId>&quantity=<n>`), instead of guessing a
 * product-page URL from the name.
 *
 * WHY a static generated file instead of a live lookup at click-time: a
 * network round trip to the old WordPress site on every single "Buy Now"
 * click adds latency and a new failure mode to the hottest button on the
 * site. The two catalogs (this one's ~700 items, Woo's ~250) change slowly,
 * so a periodically-refreshed mapping is far more robust. Re-run this
 * whenever either catalog changes meaningfully:
 *
 *   WOO_CK=... WOO_CS=... node scripts/generate-woo-product-map.mjs
 *
 * (Reads WOO_CK / WOO_CS from the environment, falling back to .env.local —
 * never hardcode the Woo keys in source. Read-only REST API creds.)
 *
 * Matching strategy (conservative on purpose — a wrong-product/wrong-price
 * checkout is worse than falling back to the old "guessed product page"
 * behavior in src/lib/legacyStore.ts):
 *   1. Exact normalized-name match against Woo's catalog → "high" confidence.
 *     If more than one Woo product shares that exact normalized name, only
 *     accept it if their price disambiguates it (within ~AED 1) — otherwise
 *     it's left unmatched rather than guessed.
 *   2. Otherwise, fuzzy name match (token-Jaccard + sequence-ratio blend)
 *     with a Woo candidate ONLY when the combined score is >= 0.90 AND (if
 *     both prices are known) the prices agree within 15%. Score >= 0.97 is
 *     "high" confidence, 0.90–0.97 is "medium" (near-identical names that
 *     differ only by an appended quantity-tier suffix DSM's catalog adds,
 *     e.g. "... MAK License - 20" vs Woo's "... MAK License").
 *   3. Everything else is left out of the map entirely — the storefront
 *     falls back to the existing (pre-existing, unchanged) guessed
 *     product-page link, or a "contact us" flow, per src/lib/legacyStore.ts.
 *   4. VARIABLE Woo products (parent products with per-tier variations, e.g.
 *     a MAK license sold in "20 / 150 / 2500 / 5000 user" tiers) are a trap:
 *     `?add-to-cart=<parent-id>` silently fails on the live store and
 *     bounces the buyer to an EMPTY cart (confirmed empirically against the
 *     live store) — worse than the fallback, since it looks like a real
 *     checkout link. For these we resolve down to the specific child
 *     VARIATION whose price matches the DSM row's price closely (each DSM
 *     tier row lines up 1:1 with one Woo variation) and use THAT id. No
 *     confident variation price match → dropped, same as any other
 *     unmatched product.
 *
 * The actual price CHARGED is always whatever Woo has for the matched
 * product id — the DSM-side price is only used here as a same-product sanity
 * check, never as the transaction price.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, "..");
const OUT = path.join(ROOT, "src", "data", "wooProductMap.json");

// Load WOO_CK/WOO_CS from env, or from a plain KEY=VALUE .env.local if present.
function loadEnvLocal() {
  const p = path.join(ROOT, ".env.local");
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
const envLocal = loadEnvLocal();
const WOO_CK = process.env.WOO_CK || envLocal.WOO_CK || "";
const WOO_CS = process.env.WOO_CS || envLocal.WOO_CS || "";
if (!WOO_CK || !WOO_CS) {
  console.error("WOO_CK / WOO_CS not set (env or .env.local). Aborting.");
  process.exit(2);
}

const DSM_API = "https://dsm-api.techrealm.ai";
const WOO_SITE = "https://digitalsoftwaremarkett.com";
const UA = "Mozilla/5.0 (DSM woo-product-map sync)";
const AUTH = "Basic " + Buffer.from(`${WOO_CK}:${WOO_CS}`).toString("base64");

async function fetchJson(url, headers = {}) {
  const r = await fetch(url, { headers: { "User-Agent": UA, ...headers } });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return { data: await r.json(), headers: r.headers };
}

async function fetchAllDsmProducts() {
  const all = [];
  let page = 1;
  for (;;) {
    const { data } = await fetchJson(`${DSM_API}/products?limit=100&page=${page}`);
    const prods = data.products || [];
    all.push(...prods);
    const totalPages = data.totalPages || 1;
    if (page >= totalPages) break;
    page++;
  }
  return all;
}

async function fetchAllWooProducts() {
  const all = [];
  let page = 1;
  for (;;) {
    const { data } = await fetchJson(
      `${WOO_SITE}/wp-json/wc/v3/products?per_page=100&page=${page}`,
      { Authorization: AUTH },
    );
    all.push(...data);
    if (data.length < 100) break;
    page++;
  }
  return all;
}

// WooCommerce's `?add-to-cart=<id>` URL trick ONLY works for a SIMPLE product
// id, or a specific VARIATION id of a variable product (confirmed empirically
// against the live store: add-to-cart=<variable-parent-id> silently fails and
// bounces to an EMPTY cart -- worse than the pre-existing fallback, since it
// looks like a real checkout link but has nothing in it). For a "variable"
// type match we must resolve down to the correct child variation.
const variationsCache = new Map();
async function fetchVariations(parentId) {
  if (variationsCache.has(parentId)) return variationsCache.get(parentId);
  const all = [];
  let page = 1;
  for (;;) {
    const { data } = await fetchJson(
      `${WOO_SITE}/wp-json/wc/v3/products/${parentId}/variations?per_page=100&page=${page}`,
      { Authorization: AUTH },
    );
    all.push(...data);
    if (data.length < 100) break;
    page++;
  }
  variationsCache.set(parentId, all);
  return all;
}

/**
 * For a "variable" Woo parent match, find the ONE variation whose price
 * matches the DSM row's price closely -- DSM's catalog already splits each
 * quantity/license tier into its own row with its own price (e.g. "... - 20"
 * vs "... - 150"), which lines up 1:1 with each Woo variation's price (each
 * tier is a separate variation under one parent). Requires a tight price
 * match; returns null (no confident resolution) otherwise -- never falls
 * back to the parent id, since that's the broken/empty-cart case.
 */
async function resolveVariation(parent, dsmPrice) {
  if (dsmPrice == null) return null;
  let variations;
  try {
    variations = await fetchVariations(parent.id);
  } catch {
    return null;
  }
  let best = null, bestDiff = Infinity;
  for (const v of variations) {
    if (v.status !== "publish" || v.purchasable === false) continue;
    const vp = priceToFloat(v.price);
    if (vp == null) continue;
    const diff = Math.abs(vp - dsmPrice);
    if (diff < bestDiff) { bestDiff = diff; best = v; }
  }
  if (!best) return null;
  const pct = dsmPrice > 0 ? bestDiff / dsmPrice : Infinity;
  if (bestDiff > 1.0 && pct > 0.02) return null; // not a confident price match
  const label = (best.attributes || []).map((a) => a.option).filter(Boolean).join(" / ");
  return { id: best.id, price: best.price, label, priceDiff: bestDiff };
}

// ── Matching ─────────────────────────────────────────────────────────────
const STOPWORDS = new Set([
  "the", "a", "an", "and", "for", "with", "of", "edition", "license",
  "licence", "software", "official", "solution", "version",
]);

function norm(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
function tokens(s) {
  return norm(s)
    .split(" ")
    .filter((t) => t && !STOPWORDS.has(t));
}
function priceToFloat(p) {
  if (p == null) return null;
  const s = String(p).replace(/[^0-9.]/g, "");
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
function seqRatio(a, b) {
  // Cheap Ratcliff/Obershelp-ish ratio via longest-common-subsequence length.
  if (!a || !b) return 0;
  const la = a.length, lb = b.length;
  const dp = new Array(lb + 1).fill(0);
  let lcs = 0;
  for (let i = 1; i <= la; i++) {
    let prev = 0;
    for (let j = 1; j <= lb; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      lcs = Math.max(lcs, dp[j]);
      prev = tmp;
    }
  }
  return (2 * lcs) / (la + lb);
}

async function buildMap(dsmProducts, wooProducts) {
  const purchasable = wooProducts.filter((w) => w.status === "publish" && w.purchasable);
  const byNorm = new Map();
  for (const w of purchasable) {
    const n = norm(w.name);
    if (!byNorm.has(n)) byNorm.set(n, []);
    byNorm.get(n).push(w);
  }

  const result = {};
  let nHigh = 0, nMedium = 0, nNone = 0, nVariableDropped = 0;

  for (const p of dsmProducts) {
    const dnorm = norm(p.name);
    const dprice = priceToFloat(p.price);
    const dtok = new Set(tokens(p.name));

    let match = null, method = null, confidence = null;

    const exactCands = byNorm.get(dnorm);
    if (exactCands && exactCands.length === 1) {
      match = exactCands[0];
      method = "exact_name";
      confidence = "high";
    } else if (exactCands && exactCands.length > 1 && dprice != null) {
      let best = null, bestDiff = Infinity;
      for (const c of exactCands) {
        const wp = priceToFloat(c.price);
        if (wp == null) continue;
        const diff = Math.abs(wp - dprice);
        if (diff < bestDiff) { bestDiff = diff; best = c; }
      }
      if (best && bestDiff < 1.0) {
        match = best; method = "exact_name_price_disambig"; confidence = "high";
      }
    }

    if (!match) {
      let best = null, bestScore = 0;
      for (const w of purchasable) {
        const wtok = new Set(tokens(w.name));
        if (wtok.size === 0 || dtok.size === 0) continue;
        let inter = 0;
        for (const t of dtok) if (wtok.has(t)) inter++;
        const union = new Set([...dtok, ...wtok]).size;
        const jacc = union ? inter / union : 0;
        const seq = seqRatio(dnorm, norm(w.name));
        const score = 0.5 * jacc + 0.5 * seq;
        if (score > bestScore) { bestScore = score; best = w; }
      }
      if (best && bestScore >= 0.9) {
        const wprice = priceToFloat(best.price);
        let priceOk = true;
        if (dprice != null && wprice != null && dprice > 0) {
          priceOk = Math.abs(dprice - wprice) / dprice <= 0.15;
        }
        if (priceOk) {
          match = best;
          method = `fuzzy_${bestScore.toFixed(2)}`;
          confidence = bestScore >= 0.97 ? "high" : "medium";
        }
      }
    }

    if (match && match.type === "variable") {
      // Never use a variable PARENT id directly -- add-to-cart silently fails
      // for those (confirmed against the live store) and bounces the buyer to
      // an empty cart. Resolve to the specific child variation by price, or
      // drop the match entirely rather than risk that broken redirect.
      const variation = await resolveVariation(match, dprice);
      if (!variation) {
        nVariableDropped++;
        match = null;
      } else {
        result[String(p.id)] = {
          wooId: variation.id,
          wooName: variation.label ? `${match.name} (${variation.label})` : match.name,
          wooPrice: variation.price,
          wooParentId: match.id,
          wooType: "variation",
          confidence: variation.priceDiff <= 1.0 ? "high" : confidence,
          method: `${method}+variation_price_match`,
        };
        if (result[String(p.id)].confidence === "high") nHigh++; else nMedium++;
        match = "handled"; // don't fall through to the simple-product branch below
      }
    }

    if (match && match !== "handled") {
      if (match.type && match.type !== "simple") {
        // Unhandled Woo product type (grouped/external/etc) -- add-to-cart
        // behavior for these isn't verified, so don't risk it.
        nNone++;
      } else {
        if (confidence === "high") nHigh++; else nMedium++;
        result[String(p.id)] = {
          wooId: match.id,
          wooName: match.name,
          wooPrice: match.price,
          wooType: "simple",
          confidence,
          method,
        };
      }
    } else if (!match) {
      nNone++;
    }
  }

  return { result, nHigh, nMedium, nNone, nVariableDropped };
}

const [dsmProducts, wooProducts] = await Promise.all([
  fetchAllDsmProducts(),
  fetchAllWooProducts(),
]);

const { result, nHigh, nMedium, nNone, nVariableDropped } = await buildMap(dsmProducts, wooProducts);

const out = {
  _generatedAt: new Date().toISOString(),
  _source: {
    dsmApi: `${DSM_API}/products`,
    wooApi: `${WOO_SITE}/wp-json/wc/v3/products`,
    dsmCount: dsmProducts.length,
    wooCount: wooProducts.length,
  },
  _stats: {
    matched: nHigh + nMedium,
    high: nHigh,
    medium: nMedium,
    unmatched: nNone,
    variableParentDroppedNoVariationMatch: nVariableDropped,
  },
  products: result,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(
  `Wrote ${OUT}\n` +
  `  dsm products:   ${dsmProducts.length}\n` +
  `  woo products:   ${wooProducts.length}\n` +
  `  matched:        ${nHigh + nMedium} (${nHigh} high, ${nMedium} medium confidence)\n` +
  `  unmatched:      ${nNone} (falls back to guessed product-page link / contact flow)\n` +
  `    of which ${nVariableDropped} were a variable-product name/price match with no ` +
  `confident variation-level price resolution (dropped rather than risk an empty-cart redirect)`,
);
