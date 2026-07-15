/**
 * Bulk Quote Builder — AI feature #8 (B2B)
 * =========================================
 * "Build My Order." A team lead describes their team in plain English
 * ("12 designers on Windows, 3 of them do rendering, plus 2 seats for our
 * CAD guy") and the assistant turns that into a ready-to-approve order:
 * the right products, the right seat counts, automatic volume pricing, and
 * a formal quote emailed to whoever needs to sign off.
 *
 * How it works (two grounded stages, not a hallucinated price list):
 *  1. codex-proxy reads the plain-English team description and PLANS the roles
 *     — which software each group needs, seat counts, and a one-line reason.
 *  2. Each planned role is looked up against the LIVE DSM catalogue
 *     (VITE_API_BASE `/search`) so the cart carries REAL products: real names,
 *     real product ids, and the real AED list price where the catalogue has one.
 *     If the catalogue is down or a line is "Contact for pricing", we fall back
 *     to the model's AED estimate for that line and flag it as indicative.
 *
 * Backend: codex-proxy (LLM) — UNSTABLE. The whole feature is wrapped in
 * <AIFeature backend="codex">, so if the proxy is down the AI builder is
 * replaced by a lightweight beta-signup card (still captures the B2B lead on
 * the STABLE Apps Script) and an `ai_outage` telemetry event is fired by the
 * wrapper (resilience contract). The product `/search` API is treated as
 * unstable too and degrades per-line as described above.
 *
 * STABLE dependencies for anything that must not fail:
 *  - Apps Script (orders) — the formal quote is recorded here via submitOrder,
 *    which is always up and needs no local bridge, so the lead is never lost.
 *  - Email API (via the local mail bridge) delivers the formatted HTML quote;
 *    if the bridge is down the email is parked in the offline queue.
 *  - Analytics/telemetry records interest independently of both.
 *  - The on-screen quote is ALWAYS shown once built, so the buyer gets value
 *    even if delivery is delayed.
 *
 * No secrets live here. The LLM key is injected by the same-origin proxy
 * (see src/lib/llm.ts); the mail/Apps Script secrets live server-side only.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  Building2,
  Loader2,
  Minus,
  Plus,
  Sparkles,
  Trash2,
  Send,
  CheckCircle2,
  BadgePercent,
  PackageCheck,
} from 'lucide-react';

import AIFeature from '@/components/ai/AIFeature';
import { chat, LLMError } from '@/lib/llm';
import { searchProducts, type Product } from '@/lib/api';
import { track } from '@/lib/stable/analytics';
import { sendEmail } from '@/lib/stable/email';
import { submitOrder } from '@/lib/stable/orders';
import { enqueue } from '@/lib/offlineQueue';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

// ── Types ─────────────────────────────────────────────────────────────────

const FEATURE = 'bulk-quote-builder';
// The live DSM catalogue quotes AED, so the whole builder works in AED to stay
// consistent with the real product prices we pull from `/search`.
const CURRENCY = 'AED';
const QUEUE_KIND = 'bulk-quote-email';

/** One line in the order — grounded on a real catalogue product where possible. */
interface QuoteLine {
  /** Stable client id for React keys + edits. */
  id: string;
  /** Product / edition name, e.g. "AutoCAD 2026 (Yearly Subscription)". */
  name: string;
  /** License edition / tier label, plain English (brand · license type). */
  edition: string;
  /** Per-seat list price before any volume discount. */
  unitPrice: number;
  /** Seats / quantity for this line. */
  quantity: number;
  /** One-line reason this fits the team (sales-friendly). */
  reason: string;
  /** Real catalogue product id when this line was matched to the live catalogue. */
  productId?: string | number;
  /**
   * True when both the product AND its price came from the live catalogue.
   * False means the model's indicative estimate is shown (catalogue down, or
   * the product is "Contact for pricing").
   */
  grounded: boolean;
}

/**
 * What the model returns in stage 1: a plan of roles to fulfil, each with a
 * short catalogue search term. We do NOT trust it to invent product ids.
 */
interface RolePlan {
  /** Concise product/software search term, e.g. "AutoCAD 2026", "Revit". */
  query: string;
  /** License edition / tier hint, plain English. */
  edition?: string;
  /** Seats for this role. */
  seats: number;
  /** One buyer-friendly sentence explaining the fit. */
  reason: string;
  /** Indicative per-seat AED price, used only if the catalogue has none. */
  estPrice: number;
}

/** Raw (untrusted) shape of a single role before normalization. */
interface RawRolePlan {
  query?: unknown;
  edition?: unknown;
  seats?: unknown;
  reason?: unknown;
  estPrice?: unknown;
}

interface VolumeTier {
  /** Inclusive lower bound of total seats. */
  min: number;
  /** Fractional discount, e.g. 0.1 == 10% off. */
  rate: number;
  label: string;
}

type Phase = 'describe' | 'review' | 'sent';

// ── Volume pricing (transparent, seat-count based) ──────────────────────────

const VOLUME_TIERS: VolumeTier[] = [
  { min: 50, rate: 0.2, label: 'Enterprise — 50+ seats' },
  { min: 25, rate: 0.15, label: 'Business — 25+ seats' },
  { min: 10, rate: 0.1, label: 'Team — 10+ seats' },
  { min: 5, rate: 0.05, label: 'Starter — 5+ seats' },
  { min: 0, rate: 0, label: 'Standard pricing' },
];

function tierFor(totalSeats: number): VolumeTier {
  return VOLUME_TIERS.find((t) => totalSeats >= t.min) ?? VOLUME_TIERS[VOLUME_TIERS.length - 1];
}

function money(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: CURRENCY,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `line_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── LLM plumbing ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a B2B sales specialist for DSM (Al Jash Trading), a reseller of professional design, CAD, and creative software licenses. A business customer describes their team in plain English. Plan the roles they need to license.

Rules:
- Map the team to real, well-known professional software (e.g. AutoCAD, Autodesk Revit, Adobe Creative Cloud, SolidWorks, 3ds Max, V-Ray, Windows 11 Pro) that matches what they actually do.
- For each role give "query": a SHORT product name a catalogue search can match (e.g. "AutoCAD 2026", "Revit", "Adobe Creative Cloud", "Windows 11 Pro"). No marketing words in the query.
- "seats": how many seats that role needs (a whole number from the description).
- "estPrice": an indicative per-seat annual list price in whole AED (UAE dirhams) — only used if the live catalogue has no price.
- "reason": one short, buyer-friendly sentence, no jargon.
- Prefer 2-6 roles. Do not invent add-ons the team did not ask for.

Respond with STRICT JSON only — no prose, no markdown fences. Shape:
{"roles":[{"query":string,"edition":string,"seats":number,"estPrice":number,"reason":string}]}`;

/** Pull the first balanced JSON object out of an LLM reply, fences or not. */
function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in model reply');
  }
  return body.slice(start, end + 1);
}

function toNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.]/g, '')) : Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function normalizeRoles(raw: RawRolePlan[]): RolePlan[] {
  return raw
    .filter((r) => r && typeof r.query === 'string' && (r.query as string).trim().length > 0)
    .slice(0, 6)
    .map((r) => ({
      query: String(r.query).trim().slice(0, 80),
      edition: typeof r.edition === 'string' && r.edition.trim() ? r.edition.trim() : undefined,
      seats: Math.max(1, Math.round(toNumber(r.seats, 1))),
      reason: typeof r.reason === 'string' ? r.reason.trim() : '',
      estPrice: Math.round(toNumber(r.estPrice, 1800)),
    }));
}

/** "AED 1,098.00" → 1098 ; "Contact for pricing" / "" → null. */
function parsePrice(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : null;
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/,/g, '').replace(/[^0-9.]/g, ' ').trim();
  const match = cleaned.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = parseFloat(match[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** A short, buyer-friendly edition label from a real catalogue product. */
function editionLabel(p: Product, fallback?: string): string {
  const parts = [p.brand, p.licenseType].filter((s): s is string => Boolean(s && String(s).trim()));
  return parts.length ? parts.join(' · ') : fallback?.trim() || 'Commercial';
}

/** searchProducts with a hard timeout so a slow/dead VPS can't hang the build. */
async function searchWithTimeout(query: string, timeoutMs = 4000): Promise<Product[]> {
  return Promise.race([
    searchProducts(query)
      .then((r) => r.products ?? [])
      .catch(() => [] as Product[]),
    new Promise<Product[]>((resolve) => setTimeout(() => resolve([]), timeoutMs)),
  ]);
}

/**
 * Stage 2 — turn each planned role into a real cart line. We look the role up in
 * the live catalogue and, if we find a match, carry the real product id, name,
 * edition and (when priced) the real AED unit price. Anything the catalogue
 * can't ground falls back to the model's indicative estimate. Runs in parallel;
 * a failing catalogue never breaks the build (contract: degrade, don't throw).
 */
async function groundRolesToCatalogue(roles: RolePlan[]): Promise<QuoteLine[]> {
  const results = await Promise.all(
    roles.map(async (role): Promise<QuoteLine> => {
      let match: Product | undefined;
      try {
        const hits = await searchWithTimeout(role.query);
        match = hits.find((p) => p && p.name && p.status !== 'error') ?? hits[0];
      } catch {
        match = undefined; // catalogue unstable → estimate below
      }

      const realPrice = match ? parsePrice(match.price) : null;
      return {
        id: newId(),
        name: match?.name?.trim() || role.query,
        edition: match ? editionLabel(match, role.edition) : role.edition || 'Commercial',
        unitPrice: Math.round(realPrice ?? role.estPrice),
        quantity: role.seats,
        reason: role.reason,
        productId: match?.id,
        grounded: Boolean(match && realPrice != null),
      };
    }),
  );
  return results;
}

async function buildQuoteFromDescription(description: string): Promise<QuoteLine[]> {
  const reply = await chat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: description.trim() },
    ],
    { temperature: 0.3, maxTokens: 900 },
  );

  let parsed: { roles?: RawRolePlan[] };
  try {
    parsed = JSON.parse(extractJson(reply)) as { roles?: RawRolePlan[] };
  } catch {
    throw new LLMError('We could not read the recommendation. Please try describing your team again.');
  }

  const roles = normalizeRoles(Array.isArray(parsed.roles) ? parsed.roles : []);
  if (roles.length === 0) {
    throw new LLMError('No products matched that description. Add a little more detail about what your team does.');
  }
  return groundRolesToCatalogue(roles);
}

// ── Quote email ─────────────────────────────────────────────────────────────

interface QuoteTotals {
  totalSeats: number;
  subtotal: number;
  tier: VolumeTier;
  discount: number;
  total: number;
}

function computeTotals(lines: QuoteLine[]): QuoteTotals {
  const totalSeats = lines.reduce((sum, l) => sum + l.quantity, 0);
  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const tier = tierFor(totalSeats);
  const discount = Math.round(subtotal * tier.rate);
  return { totalSeats, subtotal, tier, discount, total: subtotal - discount };
}

interface QuoteContact {
  company: string;
  contactName: string;
  email: string;
}

function buildQuoteEmail(contact: QuoteContact, lines: QuoteLine[], totals: QuoteTotals) {
  const ref = `DSM-BQ-${Date.now().toString(36).toUpperCase()}`;
  const hasEstimate = lines.some((l) => !l.grounded);
  const rows = lines
    .map(
      (l) =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(l.name)}${l.grounded ? '' : ' *'}<br>
            <span style="color:#666;font-size:12px">${escapeHtml(l.edition)}</span></td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${l.quantity}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${money(l.unitPrice)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${money(l.unitPrice * l.quantity)}</td>
        </tr>`,
    )
    .join('');
  const estimateNote = hasEstimate
    ? '<p style="margin:8px 0 0;color:#999;font-size:12px">* Indicative price — your DSM specialist will confirm the exact figure for this line.</p>'
    : '';

  const body = `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:640px">
    <h2 style="margin:0 0 4px">Your DSM Volume Quote</h2>
    <p style="margin:0 0 16px;color:#666">Reference ${ref}</p>
    <p style="margin:0 0 16px">Hi ${escapeHtml(contact.contactName || 'there')}, here is the quote we prepared for <strong>${escapeHtml(contact.company || 'your team')}</strong>.</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <thead>
        <tr style="text-align:left;background:#f6f6f6">
          <th style="padding:8px 12px">Product</th>
          <th style="padding:8px 12px;text-align:center">Seats</th>
          <th style="padding:8px 12px;text-align:right">Per seat</th>
          <th style="padding:8px 12px;text-align:right">Line total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <table style="margin-top:16px;width:100%;font-size:14px">
      <tr><td style="padding:4px 12px">Total seats</td><td style="padding:4px 12px;text-align:right">${totals.totalSeats}</td></tr>
      <tr><td style="padding:4px 12px">Subtotal</td><td style="padding:4px 12px;text-align:right">${money(totals.subtotal)}</td></tr>
      <tr><td style="padding:4px 12px">Volume discount (${totals.tier.label})</td><td style="padding:4px 12px;text-align:right;color:#0a7d33">-${money(totals.discount)}</td></tr>
      <tr><td style="padding:8px 12px;font-weight:bold;border-top:2px solid #111">Total</td><td style="padding:8px 12px;text-align:right;font-weight:bold;border-top:2px solid #111">${money(totals.total)}</td></tr>
    </table>
    ${estimateNote}
    <p style="margin:20px 0 4px;color:#666;font-size:13px">Prices are in AED, per seat, per year, and valid for 30 days. Reply to this email to place the order or ask for changes and a DSM specialist will follow up.</p>
    <p style="margin:16px 0 0;font-weight:bold">DSM — Al Jash Trading</p>
  </div>`;

  return { ref, subject: `DSM Volume Quote ${ref} — ${contact.company || 'Your team'}`, body };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Inner component (only mounts when codex-proxy is healthy) ────────────────

function BulkQuoteBuilderInner() {
  const [phase, setPhase] = useState<Phase>('describe');
  const [description, setDescription] = useState('');
  const [building, setBuilding] = useState(false);
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [company, setCompany] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sentRef, setSentRef] = useState<string | null>(null);
  const [emailQueued, setEmailQueued] = useState(false);

  const totals = useMemo(() => computeTotals(lines), [lines]);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleBuild = useCallback(async () => {
    const trimmed = description.trim();
    if (trimmed.length < 8) {
      setError('Tell us a little about your team — size, roles, and what they work on.');
      return;
    }
    setError(null);
    setBuilding(true);
    track({ event: 'bulk_quote_build', eventType: 'ai', metadata: { chars: trimmed.length } });

    try {
      const result = await buildQuoteFromDescription(trimmed);
      setLines(result);
      setPhase('review');
      track({
        event: 'bulk_quote_built',
        eventType: 'ai',
        metadata: { lines: result.length, seats: result.reduce((s, l) => s + l.quantity, 0) },
      });
    } catch (err) {
      const msg =
        err instanceof LLMError || err instanceof Error
          ? err.message
          : 'Something went wrong building your order. Please try again.';
      setError(msg);
    } finally {
      setBuilding(false);
    }
  }, [description]);

  const adjustQty = useCallback((id: string, delta: number) => {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, quantity: Math.max(1, l.quantity + delta) } : l)),
    );
  }, []);

  const setQty = useCallback((id: string, value: string) => {
    const n = Math.max(1, Math.round(parseInt(value, 10) || 1));
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, quantity: n } : l)));
  }, []);

  const removeLine = useCallback((id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const handleSend = useCallback(async () => {
    if (!emailValid) {
      setError('Add a valid email so we can send the formal quote.');
      return;
    }
    if (lines.length === 0) {
      setError('Your order is empty. Add at least one product.');
      return;
    }
    setError(null);
    setSending(true);

    const contact: QuoteContact = {
      company: company.trim(),
      contactName: contactName.trim(),
      email: email.trim(),
    };
    const { ref, subject, body } = buildQuoteEmail(contact, lines, totals);

    // Record the lead on the STABLE analytics backend regardless of delivery.
    track({
      event: 'bulk_quote_requested',
      eventType: 'ecommerce',
      metadata: {
        ref,
        company: contact.company,
        email: contact.email,
        seats: totals.totalSeats,
        total: totals.total,
        tier: totals.tier.label,
        grounded: lines.every((l) => l.grounded),
      },
    });

    // 1) DURABLE record via the always-up Apps Script (no local bridge needed).
    //    This is the formal quote of record that the admin Orders view reads;
    //    submitOrder self-queues if the network is momentarily down, so the
    //    B2B lead can never be lost even when the mail bridge is offline.
    const breakdown = lines
      .map(
        (l) =>
          `${l.quantity} x ${l.name} (${l.edition}) @ ${money(l.unitPrice)}/seat${l.grounded ? '' : ' [indicative]'}`,
      )
      .join('\n');
    submitOrder({
      customerName: contact.contactName || contact.company || 'Bulk quote lead',
      email: contact.email,
      productId: ref,
      productName: `Bulk quote — ${contact.company || 'team'} (${lines.length} lines)`,
      quantity: totals.totalSeats,
      price: totals.total,
      currency: CURRENCY,
      notes: [
        `Bulk Quote Builder ${ref}`,
        `Company: ${contact.company || '—'}`,
        `Tier: ${totals.tier.label} (${Math.round(totals.tier.rate * 100)}% off)`,
        `Subtotal ${money(totals.subtotal)} · Discount -${money(totals.discount)} · Total ${money(totals.total)}`,
        '',
        breakdown,
      ].join('\n'),
    }).catch(() => {
      /* submitOrder already queues on failure; never block the buyer */
    });

    // 2) Deliver the formatted HTML quote by email (best-effort via the bridge).
    try {
      await sendEmail({ to: contact.email, subject, body, html: true });
      setEmailQueued(false);
    } catch {
      // Mail bridge unreachable (admin app not running). Don't block the buyer —
      // park the quote email so it goes out on reconnect, and still show success.
      enqueue(QUEUE_KIND, { to: contact.email, subject, body, html: true });
      setEmailQueued(true);
    }

    setSentRef(ref);
    setPhase('sent');
    setSending(false);
  }, [emailValid, lines, totals, company, contactName, email]);

  const reset = useCallback(() => {
    setPhase('describe');
    setDescription('');
    setLines([]);
    setError(null);
    setSentRef(null);
    setEmailQueued(false);
  }, []);

  // ── Sent confirmation ──────────────────────────────────────────────────
  if (phase === 'sent') {
    return (
      <Card className="border-primary/30">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <CheckCircle2 className="h-12 w-12 text-primary" />
          <div>
            <h3 className="text-xl font-semibold">Your quote is on its way</h3>
            <p className="mt-1 text-muted-foreground">
              {emailQueued
                ? `We've saved your quote (ref ${sentRef}) and will email it to ${email.trim()} shortly.`
                : `We've emailed your formal quote (ref ${sentRef}) to ${email.trim()}.`}
            </p>
          </div>
          <p className="max-w-md text-sm text-muted-foreground">
            {money(totals.total)} for {totals.totalSeats} seats, including your{' '}
            {Math.round(totals.tier.rate * 100)}% volume discount. A DSM specialist will follow up to
            finalise the order.
          </p>
          <Button variant="outline" onClick={reset}>
            Build another order
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Describe + Review ──────────────────────────────────────────────────
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <CardTitle>Bulk Quote Builder</CardTitle>
          <Badge variant="secondary" className="ml-1">
            For teams
          </Badge>
        </div>
        <CardDescription>
          Describe your team in plain English. We'll pick the right licenses, apply your volume
          discount, and email you a formal quote — ready to approve.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Step 1 — describe */}
        <div className="space-y-2">
          <Label htmlFor="bqb-team">Tell us about your team</Label>
          <Textarea
            id="bqb-team"
            placeholder="e.g. We're a 14-person architecture studio on Windows. 8 do drafting in AutoCAD, 4 need Revit for BIM, and 2 designers use the full Adobe suite."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            disabled={building}
          />
          <Button onClick={handleBuild} disabled={building} className="w-full sm:w-auto">
            {building ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Building your order…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Build My Order
              </>
            )}
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Step 2 — review cart */}
        {phase === 'review' && lines.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Your recommended order</h4>
                <Badge variant="outline" className="gap-1">
                  <BadgePercent className="h-3.5 w-3.5" />
                  {totals.tier.label}
                </Badge>
              </div>

              <ul className="space-y-3">
                {lines.map((line) => (
                  <li
                    key={line.id}
                    className="rounded-lg border p-3 sm:flex sm:items-start sm:justify-between sm:gap-4"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{line.name}</p>
                        {line.grounded ? (
                          <Badge variant="outline" className="gap-1 text-[10px]">
                            <PackageCheck className="h-3 w-3" />
                            From catalogue
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">
                            Indicative price
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{line.edition}</p>
                      {line.reason && (
                        <p className="mt-1 text-sm text-muted-foreground">{line.reason}</p>
                      )}
                    </div>

                    <div className="mt-3 flex items-center gap-3 sm:mt-0 sm:flex-col sm:items-end">
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => adjustQty(line.id, -1)}
                          aria-label={`Remove one ${line.name} seat`}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <Input
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) => setQty(line.id, e.target.value)}
                          className="h-8 w-16 text-center"
                          aria-label={`${line.name} seats`}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => adjustQty(line.id, 1)}
                          aria-label={`Add one ${line.name} seat`}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground"
                          onClick={() => removeLine(line.id)}
                          aria-label={`Remove ${line.name} from order`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="whitespace-nowrap text-sm">
                        <span className="text-muted-foreground">{money(line.unitPrice)}/seat · </span>
                        <span className="font-semibold">{money(line.unitPrice * line.quantity)}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Totals */}
              <div className="rounded-lg bg-muted/50 p-4 text-sm">
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Total seats</span>
                  <span>{totals.totalSeats}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{money(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between py-0.5 text-primary">
                  <span>Volume discount ({Math.round(totals.tier.rate * 100)}%)</span>
                  <span>-{money(totals.discount)}</span>
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between text-base font-semibold">
                  <span>Estimated total</span>
                  <span>{money(totals.total)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Per seat, per year. Final pricing confirmed on your formal quote.
                </p>
              </div>

              {/* Step 3 — contact + send */}
              <Separator />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="bqb-company">Company</Label>
                  <Input
                    id="bqb-company"
                    placeholder="Acme Design Studio"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bqb-name">Your name</Label>
                  <Input
                    id="bqb-name"
                    placeholder="Jordan Lee"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="bqb-email">Work email</Label>
                  <Input
                    id="bqb-email"
                    type="email"
                    placeholder="jordan@acme.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <Button onClick={handleSend} disabled={sending} className="w-full">
                {sending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending your quote…
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Email me the formal quote
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Beta-signup degradation (rendered when codex-proxy is down) ──────────────

/**
 * When the LLM is unavailable the AI builder can't plan an order — but we still
 * don't want to drop a B2B lead. This lightweight card captures the team's
 * details and files them on the STABLE Apps Script (submitOrder self-queues if
 * the network flaps), so a DSM specialist can follow up and build the quote by
 * hand. No LLM, no product API — only the always-up backend is touched.
 */
function BulkQuoteBetaSignup() {
  const [company, setCompany] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [team, setTeam] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleSubmit = useCallback(async () => {
    if (!emailValid) {
      setError('Add a valid work email so a specialist can reach you.');
      return;
    }
    if (team.trim().length < 8) {
      setError('Tell us a little about your team so we can prepare the right quote.');
      return;
    }
    setError(null);
    setSubmitting(true);

    const ref = `DSM-BQ-${Date.now().toString(36).toUpperCase()}`;
    track({
      event: 'bulk_quote_beta_signup',
      eventType: 'ecommerce',
      metadata: { ref, company: company.trim(), email: email.trim() },
    });
    submitOrder({
      customerName: contactName.trim() || company.trim() || 'Bulk quote lead',
      email: email.trim(),
      productId: ref,
      productName: `Bulk quote request — ${company.trim() || 'team'}`,
      quantity: 1,
      price: 'TBD',
      currency: CURRENCY,
      notes: [
        `Bulk Quote Builder request ${ref} (AI builder offline — manual follow-up)`,
        `Company: ${company.trim() || '—'}`,
        '',
        team.trim(),
      ].join('\n'),
    }).catch(() => {
      /* submitOrder already queues on failure */
    });

    setDone(true);
    setSubmitting(false);
  }, [emailValid, team, company, contactName, email]);

  if (done) {
    return (
      <Card className="border-primary/30">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <CheckCircle2 className="h-10 w-10 text-primary" />
          <h3 className="text-lg font-semibold">Thanks — we've got your request</h3>
          <p className="max-w-md text-sm text-muted-foreground">
            A DSM specialist will build your volume quote and email it to {email.trim()} shortly.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <CardTitle>Bulk Quote Builder</CardTitle>
          <Badge variant="secondary" className="ml-1">
            Beta
          </Badge>
        </div>
        <CardDescription>
          Our instant AI builder is warming up. Leave your team's details and a DSM specialist will
          prepare a volume quote — usually within one business day.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="bqb-beta-company">Company</Label>
            <Input
              id="bqb-beta-company"
              placeholder="Acme Design Studio"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bqb-beta-name">Your name</Label>
            <Input
              id="bqb-beta-name"
              placeholder="Jordan Lee"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="bqb-beta-email">Work email</Label>
            <Input
              id="bqb-beta-email"
              type="email"
              placeholder="jordan@acme.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="bqb-beta-team">Tell us about your team</Label>
            <Textarea
              id="bqb-beta-team"
              placeholder="e.g. 14-person architecture studio on Windows: 8 on AutoCAD, 4 need Revit, 2 use Adobe."
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={handleSubmit} disabled={submitting} className="w-full sm:w-auto">
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending…
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Request my volume quote
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Public export — resilience wrapper ──────────────────────────────────────

/**
 * B2B Bulk Quote Builder. Renders the AI builder only when the codex-proxy
 * (LLM) is healthy; otherwise it degrades to a beta-signup card that still
 * captures the lead on the STABLE backend, and an `ai_outage` event is fired.
 * Poll every 30s so the AI builder can reappear if the proxy recovers.
 */
export default function BulkQuoteBuilder() {
  return (
    <AIFeature
      backend="codex"
      feature={FEATURE}
      recheckMs={30000}
      fallback={<BulkQuoteBetaSignup />}
    >
      <BulkQuoteBuilderInner />
    </AIFeature>
  );
}
