/**
 * Reseller portal — /reseller
 * ---------------------------
 * The B2B partner dashboard, distinct from the end-customer member portal
 * (/account). Everything here is served by STABLE backends via lib/reseller.ts:
 *  - The reseller identity + tier are the client-side session (reusing the shared
 *    member session in lib/account.ts).
 *  - Order / commission history is the secret-free, email-scoped Orders read.
 *  - Deal registrations & bulk-quote requests POST to the Ecommerce Apps Script
 *    (`type:"order"` tagged reseller) and notify via /api/email — both resilient
 *    (queue on failure), so a partner can register a deal even fully offline.
 *  - The price list is generated client-side and downloaded as CSV.
 *
 * Signed-out visitors get a partner pitch + a CTA that opens the reseller
 * sign-in pop-up (this page mounts its own instance so it works standalone).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  Coins,
  Download,
  Handshake,
  Layers,
  Loader2,
  LogOut,
  Percent,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ResellerSignInModal from '@/components/ResellerSignInModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  currentReseller,
  deriveTier,
  downloadPriceList,
  getResellerOrders,
  listDeals,
  onResellerChange,
  registerDeal,
  RESELLER_PRICE_LIST,
  RESELLER_TIERS,
  signOutReseller,
  summariseCommissions,
  tierSpec,
  updateResellerProfile,
  type DealRegistration,
  type ResellerOrder,
  type ResellerProfile,
} from '@/lib/reseller';
import { track } from '@/lib/stable/analytics';

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtMoney(value: number, currency = '$'): string {
  return `${currency || '$'}${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/** Small binding to the reseller session (re-renders on register / sign-out). */
function useReseller(): ResellerProfile | null {
  const [profile, setProfile] = useState<ResellerProfile | null>(() => currentReseller());
  useEffect(() => {
    setProfile(currentReseller());
    const off = onResellerChange(setProfile);
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'dsm.reseller' || e.key === 'dsm.account' || e.key === null) {
        setProfile(currentReseller());
      }
    };
    if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
    return () => {
      off();
      if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
    };
  }, []);
  return profile;
}

export default function ResellerPortal() {
  const reseller = useReseller();
  const [modalOpen, setModalOpen] = useState(false);

  const [orders, setOrders] = useState<ResellerOrder[]>([]);
  const [deals, setDeals] = useState<DealRegistration[]>([]);
  const [loading, setLoading] = useState(true);

  const email = reseller?.email;
  const tier = reseller?.tier ?? 'authorized';
  const spec = tierSpec(tier);

  const load = useCallback(() => {
    if (!email) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setDeals(listDeals(email));
    getResellerOrders(email, tier)
      .then(setOrders)
      .finally(() => setLoading(false));
  }, [email, tier]);

  useEffect(() => {
    if (!email) {
      setLoading(false);
      return;
    }
    load();
    track({ event: 'reseller_portal_view', eventType: 'page', metadata: { email, tier } });
  }, [email, tier, load]);

  const commissions = useMemo(() => summariseCommissions(orders), [orders]);

  // Auto-upgrade the stored tier when volume qualifies for a higher one.
  useEffect(() => {
    if (!reseller) return;
    const qualifies = deriveTier(commissions.units);
    if (qualifies !== reseller.tier) {
      const idx = RESELLER_TIERS.findIndex((t) => t.id === qualifies);
      const currentIdx = RESELLER_TIERS.findIndex((t) => t.id === reseller.tier);
      if (idx > currentIdx) updateResellerProfile({ tier: qualifies });
    }
  }, [commissions.units, reseller]);

  // ── Signed-out state ─────────────────────────────────────────────────────────
  if (!reseller) {
    return (
      <div className="min-h-screen bg-surface-dark">
        <Header />
        <main className="mx-auto max-w-[1100px] px-6 pt-40 pb-32">
          <div className="text-center">
            <div className="mb-3 inline-flex items-center gap-2 text-crimson">
              <Building2 className="h-4 w-4" aria-hidden />
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">
                DSM Reseller Program
              </span>
            </div>
            <h1 className="font-serif text-4xl text-[#FEFEFE] md:text-5xl">
              Sell DSM. Keep the margin.
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-[#B1B2B3]">
              Join the free B2B partner program for wholesale pricing, protected deal registration,
              bulk quotes and commission tracking — all in one dashboard.
            </p>
            <Button
              onClick={() => setModalOpen(true)}
              className="mt-8 bg-crimson text-[#FEFEFE] hover:bg-crimson-dark"
              size="lg"
            >
              Become a reseller <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>

          {/* Tier ladder */}
          <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {RESELLER_TIERS.map((t) => (
              <div
                key={t.id}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#FEFEFE]">{t.label}</span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-crimson/20 bg-crimson/10 px-2 py-0.5 text-[11px] font-medium text-crimson">
                    <Percent className="h-3 w-3" /> {t.marginPct}%
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-[#B1B2B3]">{t.blurb}</p>
              </div>
            ))}
          </div>
        </main>
        <Footer />
        <ResellerSignInModal open={modalOpen} onOpenChange={setModalOpen} />
      </div>
    );
  }

  // ── Signed-in dashboard ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-surface-dark">
      <Header />
      <main className="mx-auto max-w-[1200px] px-6 pt-32 pb-24">
        {/* Header row */}
        <div className="mb-10 flex flex-col gap-4 border-b border-white/[0.06] pb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-crimson/20 bg-crimson/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-crimson">
              <ShieldCheck className="h-3.5 w-3.5" /> {spec.label} Partner · {spec.marginPct}% margin
            </div>
            <h1 className="font-serif text-3xl text-[#FEFEFE] md:text-4xl">{reseller.company}</h1>
            <p className="mt-1 text-sm text-[#B1B2B3]">
              {reseller.contactName ? `${reseller.contactName} · ` : ''}
              {reseller.email}
              {reseller.country ? ` · ${reseller.country}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              className="border-white/10 text-[#B1B2B3] hover:text-[#FEFEFE]"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={signOutReseller}
              className="text-[#B1B2B3] hover:text-[#FEFEFE]"
            >
              <LogOut className="mr-1.5 h-3.5 w-3.5" /> Sign out
            </Button>
          </div>
        </div>

        {/* Stat tiles */}
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Your margin" value={`${spec.marginPct}%`} icon={Percent} accent />
          <StatTile label="Units sold" value={String(commissions.units)} icon={TrendingUp} />
          <StatTile
            label="Est. commission"
            value={fmtMoney(commissions.commission, commissions.currency)}
            icon={Coins}
          />
          <StatTile label="Open deals" value={String(deals.length)} icon={Handshake} />
        </div>

        {/* Tier-upgrade nudge */}
        {commissions.qualifiesFor !== tier &&
          RESELLER_TIERS.findIndex((t) => t.id === commissions.qualifiesFor) >
            RESELLER_TIERS.findIndex((t) => t.id === tier) && (
            <div className="mb-8 rounded-xl border border-gold/20 bg-gold/[0.06] p-5">
              <div className="mb-1 flex items-center gap-2 text-gold">
                <Sparkles className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-[0.12em]">
                  Tier upgrade unlocked
                </span>
              </div>
              <p className="text-sm text-[#B1B2B3]">
                Your volume now qualifies for{' '}
                <strong className="text-[#FEFEFE]">
                  {tierSpec(commissions.qualifiesFor).label}
                </strong>{' '}
                — {tierSpec(commissions.qualifiesFor).marginPct}% margin. It applies automatically.
              </p>
            </div>
          )}

        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          {/* Left column: deals + orders */}
          <div className="space-y-10">
            <DealSection email={reseller.email} deals={deals} onChange={() => setDeals(listDeals(reseller.email))} />

            <section>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-[#FEFEFE]">
                Order & commission history
              </h2>
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-16 animate-pulse rounded-lg border border-white/[0.06] bg-white/[0.02]"
                    />
                  ))}
                </div>
              ) : orders.length === 0 ? (
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-8 text-center">
                  <p className="text-[#B1B2B3]">
                    No orders are linked to{' '}
                    <strong className="text-[#FEFEFE]">{reseller.email}</strong> yet.
                  </p>
                  <p className="mt-1 text-sm text-[#B1B2B3]/70">
                    Orders you place at wholesale will appear here with your estimated commission.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-[0.1em] text-[#B1B2B3]">
                        <th className="px-4 py-3 font-semibold">Product</th>
                        <th className="px-4 py-3 text-right font-semibold">Qty</th>
                        <th className="px-4 py-3 text-right font-semibold">Value</th>
                        <th className="px-4 py-3 text-right font-semibold">Commission</th>
                        <th className="px-4 py-3 text-right font-semibold">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((o, i) => (
                        <tr
                          key={`${o.product}-${o.purchasedAt}-${i}`}
                          className="border-b border-white/[0.04] last:border-0"
                        >
                          <td className="px-4 py-3 text-[#FEFEFE]">{o.product}</td>
                          <td className="px-4 py-3 text-right text-[#B1B2B3]">{o.quantity}</td>
                          <td className="px-4 py-3 text-right text-[#B1B2B3]">
                            {o.unitPrice
                              ? fmtMoney(o.unitPrice * o.quantity, o.currency)
                              : '—'}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-emerald-400">
                            {o.commission ? fmtMoney(o.commission, o.currency) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-[#B1B2B3]">
                            {fmtDate(o.purchasedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          {/* Right column: pricing + price list */}
          <aside className="space-y-4">
            <div className="rounded-xl border border-crimson/20 bg-gradient-to-br from-crimson/10 to-transparent p-5">
              <div className="mb-2 flex items-center gap-2 text-crimson">
                <Percent className="h-4 w-4" />
                <h3 className="text-sm font-semibold text-[#FEFEFE]">Wholesale pricing</h3>
              </div>
              <p className="font-serif text-3xl text-[#FEFEFE]">{spec.marginPct}% margin</p>
              <p className="mt-1 text-xs text-[#B1B2B3]">{spec.blurb}</p>
              <Button
                onClick={() => downloadPriceList(tier)}
                className="mt-4 w-full bg-crimson text-[#FEFEFE] hover:bg-crimson-dark"
              >
                <Download className="mr-1.5 h-4 w-4" /> Download price list (CSV)
              </Button>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <div className="mb-3 flex items-center gap-2 text-[#FEFEFE]">
                <Layers className="h-4 w-4 text-crimson" />
                <h3 className="text-sm font-semibold">Your price list</h3>
              </div>
              <ul className="space-y-2.5">
                {RESELLER_PRICE_LIST.slice(0, 6).map((item) => {
                  const wholesale =
                    Math.round(item.retail * (1 - spec.marginPct / 100) * 100) / 100;
                  return (
                    <li key={item.sku} className="flex items-center justify-between text-xs">
                      <span className="min-w-0 truncate pr-3 text-[#B1B2B3]">{item.product}</span>
                      <span className="shrink-0 text-right">
                        <span className="text-[#B1B2B3]/50 line-through">
                          {fmtMoney(item.retail)}
                        </span>{' '}
                        <span className="font-medium text-[#FEFEFE]">{fmtMoney(wholesale)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-[11px] text-[#B1B2B3]/60">
                {RESELLER_PRICE_LIST.length} products in the full CSV.
              </p>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <div className="mb-2 flex items-center gap-2 text-[#FEFEFE]">
                <ShieldCheck className="h-4 w-4 text-crimson" />
                <h3 className="text-sm font-semibold">Account</h3>
              </div>
              <dl className="space-y-1.5 text-xs text-[#B1B2B3]">
                <Row label="Tier" value={spec.label} />
                <Row label="Member since" value={fmtDate(reseller.registeredAt)} />
                {reseller.phone ? <Row label="Phone" value={reseller.phone} /> : null}
                {reseller.taxId ? <Row label="Reseller ID" value={reseller.taxId} /> : null}
              </dl>
            </div>
          </aside>
        </div>
      </main>
      <Footer />
      {/* Mounted so integration can also drive the pop-up; harmless when closed. */}
      <ResellerSignInModal open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
}

// ── Deal registration section ─────────────────────────────────────────────────

function DealSection({
  email,
  deals,
  onChange,
}: {
  email: string;
  deals: DealRegistration[];
  onChange: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [bulkQuote, setBulkQuote] = useState(false);
  const [dealName, setDealName] = useState('');
  const [endCustomer, setEndCustomer] = useState('');
  const [product, setProduct] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [estValue, setEstValue] = useState('');
  const [closeDate, setCloseDate] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const reset = () => {
    setDealName('');
    setEndCustomer('');
    setProduct('');
    setQuantity('1');
    setEstValue('');
    setCloseDate('');
    setNotes('');
  };

  const submit = useCallback(async () => {
    setError('');
    setDone('');
    if (!dealName.trim() || !endCustomer.trim() || !product.trim()) {
      setError('Deal name, end customer and product are required.');
      return;
    }
    setBusy(true);
    try {
      const res = await registerDeal({
        dealName: dealName.trim(),
        endCustomer: endCustomer.trim(),
        product: product.trim(),
        quantity: Number.parseInt(quantity, 10) || 1,
        estValue: estValue ? Number.parseFloat(estValue) : undefined,
        closeDate: closeDate || undefined,
        notes: notes.trim() || undefined,
        bulkQuote,
      });
      onChange();
      reset();
      setShowForm(false);
      setDone(
        res.order.confirmed
          ? bulkQuote
            ? 'Bulk quote request sent — we’ll email you shortly.'
            : 'Deal registered and protected.'
          : 'Captured — it will sync automatically when you’re back online.',
      );
      window.setTimeout(() => setDone(''), 6000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [dealName, endCustomer, product, quantity, estValue, closeDate, notes, bulkQuote, onChange]);

  const fieldCls =
    'mt-1.5 bg-white/[0.03] border-white/10 text-[#FEFEFE] placeholder:text-[#B1B2B3]/50';

  const statusCls: Record<DealRegistration['status'], string> = {
    registered: 'bg-azure/10 text-azure border-azure/20',
    quoted: 'bg-gold/10 text-gold border-gold/20',
    won: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    lost: 'bg-crimson/10 text-crimson border-crimson/20',
  };

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#FEFEFE]">
          Deal registrations
        </h2>
        <Button
          size="sm"
          onClick={() => {
            setShowForm((s) => !s);
            setError('');
          }}
          className="bg-crimson text-[#FEFEFE] hover:bg-crimson-dark"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Register a deal
        </Button>
      </div>

      {done && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] p-3 text-sm text-emerald-400">
          <CheckCircle2 className="h-4 w-4" /> {done}
        </div>
      )}

      {showForm && (
        <div className="mb-5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="mb-4 inline-flex rounded-lg border border-white/10 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setBulkQuote(false)}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                !bulkQuote ? 'bg-crimson text-[#FEFEFE]' : 'text-[#B1B2B3] hover:text-[#FEFEFE]'
              }`}
            >
              Register a deal
            </button>
            <button
              type="button"
              onClick={() => setBulkQuote(true)}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                bulkQuote ? 'bg-crimson text-[#FEFEFE]' : 'text-[#B1B2B3] hover:text-[#FEFEFE]'
              }`}
            >
              Request bulk quote
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="d-name" className="text-xs text-[#B1B2B3]">
                Deal name
              </Label>
              <Input
                id="d-name"
                value={dealName}
                onChange={(e) => setDealName(e.target.value)}
                placeholder="Acme Corp — Q3 rollout"
                className={fieldCls}
              />
            </div>
            <div>
              <Label htmlFor="d-customer" className="text-xs text-[#B1B2B3]">
                End customer
              </Label>
              <Input
                id="d-customer"
                value={endCustomer}
                onChange={(e) => setEndCustomer(e.target.value)}
                placeholder="Acme Corp"
                className={fieldCls}
              />
            </div>
            <div>
              <Label htmlFor="d-product" className="text-xs text-[#B1B2B3]">
                Product
              </Label>
              <Input
                id="d-product"
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                placeholder="DSM Platform"
                list="reseller-products"
                className={fieldCls}
              />
              <datalist id="reseller-products">
                {RESELLER_PRICE_LIST.map((p) => (
                  <option key={p.sku} value={p.product} />
                ))}
              </datalist>
            </div>
            <div>
              <Label htmlFor="d-qty" className="text-xs text-[#B1B2B3]">
                Quantity
              </Label>
              <Input
                id="d-qty"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value.replace(/\D/g, '').slice(0, 5))}
                className={fieldCls}
              />
            </div>
            <div>
              <Label htmlFor="d-value" className="text-xs text-[#B1B2B3]">
                Est. value (optional)
              </Label>
              <Input
                id="d-value"
                inputMode="decimal"
                value={estValue}
                onChange={(e) => setEstValue(e.target.value.replace(/[^\d.]/g, ''))}
                placeholder="12000"
                className={fieldCls}
              />
            </div>
            <div>
              <Label htmlFor="d-close" className="text-xs text-[#B1B2B3]">
                Expected close (optional)
              </Label>
              <Input
                id="d-close"
                type="date"
                value={closeDate}
                onChange={(e) => setCloseDate(e.target.value)}
                className={`${fieldCls} [color-scheme:dark]`}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="d-notes" className="text-xs text-[#B1B2B3]">
                Notes (optional)
              </Label>
              <Textarea
                id="d-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything we should know to prepare the quote…"
                rows={2}
                className={fieldCls}
              />
            </div>
          </div>

          {error && <p className="mt-3 text-sm text-crimson">{error}</p>}

          <div className="mt-4 flex items-center gap-2">
            <Button
              onClick={submit}
              disabled={busy}
              className="bg-crimson text-[#FEFEFE] hover:bg-crimson-dark"
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…
                </>
              ) : bulkQuote ? (
                'Request bulk quote'
              ) : (
                'Register & protect deal'
              )}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setShowForm(false)}
              className="text-[#B1B2B3] hover:text-[#FEFEFE]"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {deals.length === 0 ? (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-8 text-center">
          <p className="text-[#B1B2B3]">No deals registered yet.</p>
          <p className="mt-1 text-sm text-[#B1B2B3]/70">
            Register a deal to protect it against channel conflict and lock in your margin.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {deals.map((d) => (
            <li
              key={d.id}
              className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 transition-colors hover:border-white/10"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-medium text-[#FEFEFE]">{d.dealName}</h3>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#B1B2B3]">
                    <span>{d.endCustomer}</span>
                    <span>
                      {d.product} · Qty {d.quantity}
                    </span>
                    {d.estValue != null ? <span>Est. {fmtMoney(d.estValue)}</span> : null}
                    {d.closeDate ? (
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="h-3 w-3" /> {fmtDate(d.closeDate)}
                      </span>
                    ) : null}
                  </div>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize ${statusCls[d.status]}`}
                >
                  {d.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Small presentational helpers ──────────────────────────────────────────────

function StatTile({
  label,
  value,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: string;
  icon: typeof Percent;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-5 ${
        accent ? 'border-crimson/20 bg-crimson/[0.06]' : 'border-white/[0.06] bg-white/[0.02]'
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${accent ? 'text-crimson' : 'text-[#B1B2B3]'}`} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#B1B2B3]">
          {label}
        </span>
      </div>
      <p className="font-serif text-2xl text-[#FEFEFE] md:text-3xl">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-[#B1B2B3]/70">{label}</dt>
      <dd className="text-[#FEFEFE]">{value}</dd>
    </div>
  );
}
