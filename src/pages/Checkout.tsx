import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import AnnouncementBar from "@/components/AnnouncementBar";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import InstantQuote from "@/components/ai/InstantQuote";
import { useApp } from "@/contexts/AppContext";
import type { CartItem } from "@/contexts/AppContext";
import { isValidEmail, signIn } from "@/lib/account";
import { submitOrder } from "@/lib/stable/orders";
import { sendProxyEmail, type EmailProxyResult } from "@/lib/emailProxy";
import { isOwnProduct } from "@/data/ownProducts";
import { wooCheckoutUrl, hasWooMatch } from "@/lib/legacyStore";
import { track, reportAiOutage } from "@/lib/stable/analytics";

const formatAED = (value: number) =>
  new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    maximumFractionDigits: 2,
  }).format(value);

/** Pre-fill text for the Instant Quote "what do you need" field from cart items
 *  we don't have a confident WooCommerce checkout match for. */
function quoteNeedText(items: CartItem[]): string {
  const list = items
    .map((i) => (i.quantity > 1 ? `${i.name} (x${i.quantity})` : i.name))
    .join(", ");
  return `I'd like pricing and licensing details for: ${list}.`;
}

// ⚠️ FLAG: placeholder Calendly link for the DSM own-product "book a meeting"
// flow. Replace with the real scheduling link (env: VITE_CALENDLY_URL).
const CALENDLY_URL: string =
  (import.meta.env.VITE_CALENDLY_URL as string | undefined) ??
  "https://calendly.com/dsm/intro";

const REDIRECT_DELAY_MS = 2500;

type Path = "licensing" | "own";

interface OwnResult {
  kind: "own";
  emailOk: boolean;
}
interface LicensingResult {
  kind: "licensing";
  emailOk: boolean;
  /** Items with a confident WooCommerce match — real add-to-cart checkout links. */
  matchedLinks: { name: string; url: string }[];
  /**
   * Items with NO confident WooCommerce match. These no longer get a guessed
   * product-page link — instead the checkout renders a "Request a Quote" CTA
   * (the Instant Quote component) pre-filled with these names.
   */
  quoteItems: CartItem[];
  /** Where we auto-redirect the buyer to finish the purchase — only set when
   *  at least one item has a real checkout link. */
  redirectUrl?: string;
}
type SubmitResult = OwnResult | LicensingResult;

export default function Checkout() {
  const { state, cartTotal, clearCart } = useApp();
  const items = state.cartItems;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [intent, setIntent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SubmitResult | null>(null);

  const finalTotal = useMemo(() => cartTotal * 1.05, [cartTotal]);

  // Split the cart into DSM-owned products (book a meeting) and third-party
  // licenses (redirect to the legacy store). The path is "own" only when the
  // cart is PURELY own products; any resellable license means we route to the
  // storefront so the buyer can actually complete a purchase.
  const { ownItems, licenseItems, path } = useMemo(() => {
    const own: CartItem[] = [];
    const lic: CartItem[] = [];
    for (const it of items) {
      if (isOwnProduct({ id: it.id, name: it.name })) own.push(it);
      else lic.push(it);
    }
    const p: Path = lic.length === 0 && own.length > 0 ? "own" : "licensing";
    return { ownItems: own, licenseItems: lic, path: p };
  }, [items]);

  const isOwnPath = path === "own";

  // Split the license items themselves into a confident WooCommerce
  // add-to-cart-and-checkout deep-link vs. no match at all. Computed once,
  // up front, so both the render (deciding whether to show the name/email
  // gate at all) and the submit handler agree on the exact same split.
  const { matchedLinks, quoteItems } = useMemo(() => {
    const matched = licenseItems
      .filter((i) => hasWooMatch({ id: i.id, name: i.name }))
      .map((i) => ({
        name: i.name,
        url: wooCheckoutUrl({ id: i.id, name: i.name }, i.quantity) as string,
      }));
    const quote = licenseItems.filter((i) => !hasWooMatch({ id: i.id, name: i.name }));
    return { matchedLinks: matched, quoteItems: quote };
  }, [licenseItems]);

  // True when EVERY license item in the cart has no confident WooCommerce
  // match — i.e. this submit can only end in a quote request, never a real
  // checkout redirect. Used to set expectations before the buyer submits.
  const isQuoteOnlyPath = !isOwnPath && licenseItems.length > 0 && matchedLinks.length === 0;

  // True when we already know EXACTLY where to send the buyer for every item
  // in the cart — a real WooCommerce checkout link for each one, nothing
  // unmatched. This is the case the "Create Order Request" name/email screen
  // was needlessly gating: we don't need the buyer's name or email to send
  // them to a checkout page we already have the URL for, so we skip that
  // screen entirely and redirect the instant they land here (see the effect
  // below). The name/email gate stays reserved for the genuine cases where a
  // human follow-up actually needs a way to reach the buyer: booking a demo
  // for DSM's own products, or quoting an item with no confident match.
  const isInstantCheckoutPath = !isOwnPath && matchedLinks.length > 0 && quoteItems.length === 0;

  async function recordOrders(customerName: string) {
    // One durable order row per line item on the STABLE Ecommerce Apps Script,
    // so every request shows up in the admin Orders sheet. Resilient by design
    // (never rejects); we don't block the UI on confirmation.
    await Promise.all(
      items.map((it) =>
        submitOrder({
          customerName,
          email: email.trim(),
          phone: phone.trim() || undefined,
          productId: it.id,
          productName: it.name,
          quantity: it.quantity,
          price: it.unitPrice,
          currency: "AED",
          notes: [
            `path=${path}`,
            isOwnProduct({ id: it.id, name: it.name })
              ? "type=own-product/meeting-request"
              : hasWooMatch({ id: it.id, name: it.name })
                ? "type=license/redirect-to-legacy"
                : "type=license/quote-request",
            intent.trim() ? `intent: ${intent.trim()}` : "",
          ]
            .filter(Boolean)
            .join(" | "),
        }),
      ),
    );
  }

  // Guards the instant-checkout effect below against firing twice (React 18
  // dev-mode double-invoke, or a re-render before the navigation completes).
  const instantFiredRef = useRef(false);

  // The actual fix: when every item in the cart has a confident WooCommerce
  // checkout link, skip the "Create Order Request" name/email screen
  // entirely and send the buyer straight to checkout — the moment they land
  // on this page, with no click required past the one that got them here
  // (Buy Now, or Proceed to Checkout from the cart). We still record the
  // order and fire the same UTM-tagged link the form path used to build, but
  // neither blocks the redirect: order-recording is fire-and-forget, and the
  // UTM tagging lives in the URL itself (`wooCheckoutUrl`), not in anything
  // the buyer types.
  useEffect(() => {
    if (!isInstantCheckoutPath || instantFiredRef.current) return;
    const redirectUrl = matchedLinks[0]?.url;
    if (!redirectUrl) return; // shouldn't happen given the guard above, but never redirect to nothing
    instantFiredRef.current = true;

    // Fire-and-forget: never awaited, never blocks the redirect. We don't
    // have a buyer-supplied name/email here (that's the point — we already
    // know where to send them), so this is recorded as a guest lead; the
    // real customer details are captured by WooCommerce's own checkout.
    void recordOrders("Guest (instant checkout)").catch(() => {});

    track({
      event: "checkout_license_request",
      eventType: "ecommerce",
      metadata: {
        itemCount: licenseItems.length,
        matchedCount: matchedLinks.length,
        quoteCount: 0,
        instant: true,
        redirectUrl,
      },
    });

    clearCart();
    window.location.assign(redirectUrl);
    // Deliberately narrow deps: recordOrders/track/clearCart close over
    // component state that doesn't need to re-trigger this redirect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInstantCheckoutPath, matchedLinks, licenseItems.length]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const cleanEmail = email.trim();
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (!isValidEmail(cleanEmail)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (items.length === 0) {
      setError("Your cart is empty.");
      return;
    }

    setSubmitting(true);
    try {
      // 1) Easy login — open a passwordless session + record the member on the
      //    STABLE backend (accounts-lib).
      signIn(cleanEmail, { displayName: name.trim() });

      // 2) Durable order request(s) → admin Orders sheet (STABLE).
      await recordOrders(name.trim());

      // 3) Branch: own product (book a meeting) vs license (redirect to buy).
      if (isOwnPath) {
        const productList = ownItems.map((i) => `• ${i.name}`).join("\n");
        const emailRes = await sendProxyEmail({
          to: cleanEmail,
          subject: "Let's book your DSM demo",
          body:
            `Hi ${name.trim()},\n\n` +
            `Thanks for your interest in:\n${productList}\n\n` +
            `Pick a time that suits you and we'll walk you through it live:\n` +
            `${CALENDLY_URL}\n\n` +
            (intent.trim() ? `Your note: ${intent.trim()}\n\n` : "") +
            `Talk soon,\nThe DSM Team`,
        });
        if (!emailRes.ok) reportAiOutage("email-proxy", "checkout-meeting", emailRes.error);

        track({
          event: "checkout_meeting_request",
          eventType: "ecommerce",
          metadata: { itemCount: ownItems.length, emailOk: emailRes.ok },
        });

        setResult({ kind: "own", emailOk: emailRes.ok });
        clearCart();
      } else {
        // NOTE: this branch only runs when the buyer actually submitted the
        // name/email form, which by this point in the flow only happens when
        // `isInstantCheckoutPath` was false — i.e. there's at least one item
        // with NO confident WooCommerce match, so a genuine follow-up (quote
        // or, further up, an own-product demo) needs a way to reach the
        // buyer. A pure confident-match cart never reaches here — it's
        // redirected straight to WooCommerce checkout by the effect below,
        // before this form is ever shown. `matchedLinks` / `quoteItems` are
        // the same split computed above (shared with the render).
        // Only auto-redirect when at least one item has a real checkout link.
        const redirectUrl = matchedLinks[0]?.url;

        let emailRes: EmailProxyResult = { ok: true };
        if (matchedLinks.length > 0) {
          emailRes = await sendProxyEmail({
            to: cleanEmail,
            subject: "Your DSM order request — complete your purchase",
            body:
              `Hi ${name.trim()},\n\n` +
              `Here are the products you asked about — click to complete your ` +
              `licensed purchase on our store:\n\n` +
              matchedLinks.map((l) => `• ${l.name}\n  ${l.url}`).join("\n\n") +
              (quoteItems.length > 0
                ? `\n\nWe don't have instant checkout set up yet for:\n${quoteItems
                    .map((i) => `• ${i.name}`)
                    .join("\n")}\n` +
                  `A DSM specialist will follow up with a tailored quote for those.`
                : "") +
              `\n\n` +
              (intent.trim() ? `Your note: ${intent.trim()}\n\n` : "") +
              `We've also opened the first product for you now.\n\nThe DSM Team`,
          });
          if (!emailRes.ok) reportAiOutage("email-proxy", "checkout-license", emailRes.error);
        }

        track({
          event: "checkout_license_request",
          eventType: "ecommerce",
          metadata: {
            itemCount: licenseItems.length,
            matchedCount: matchedLinks.length,
            quoteCount: quoteItems.length,
            emailOk: emailRes.ok,
            redirectUrl,
          },
        });

        setResult({ kind: "licensing", emailOk: emailRes.ok, matchedLinks, quoteItems, redirectUrl });
        clearCart();

        // Redirect to the legacy store to finish the purchase — only when we
        // actually have somewhere real to send the buyer.
        if (redirectUrl) {
          window.setTimeout(() => {
            window.location.assign(redirectUrl);
          }, REDIRECT_DELAY_MS);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface-dark">
      <AnnouncementBar />
      <Header />

      <main className="max-w-[1600px] mx-auto px-6 pt-44 pb-16">
        <div className="mb-10">
          <span className="inline-block text-[10px] font-semibold text-crimson uppercase tracking-[0.2em] mb-3">
            {isOwnPath ? "Request a Demo" : isInstantCheckoutPath ? "Checkout" : "Complete Your Request"}
          </span>
          <h1 className="font-serif text-4xl md:text-5xl text-[#FEFEFE] mb-2">
            {result
              ? "You're all set"
              : isInstantCheckoutPath
              ? "Taking You to Checkout"
              : isOwnPath
              ? "Book Your DSM Session"
              : "Create Order Request"}
          </h1>
          <p className="text-[#B1B2B3]/65">
            {result
              ? "We've saved your request and sent you an email."
              : isInstantCheckoutPath
              ? "We already know exactly what you're buying — no forms needed. Sending you straight to our licensed store to pay."
              : isOwnPath
              ? "Tell us who you are — we'll email a booking link and set up a live walkthrough."
              : "Sign in with just your email, and we'll get you straight to checkout — or a tailored quote for anything we don't sell instantly."}
          </p>
        </div>

        {/* ── Confirmation states ─────────────────────────────────────────── */}
        {result?.kind === "own" && (
          <section className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-6 md:p-8">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              <h2 className="font-serif text-2xl text-[#FEFEFE]">Check your inbox</h2>
            </div>
            <p className="text-[#B1B2B3]/80 mb-2">
              We've emailed <span className="text-[#FEFEFE]">{email.trim()}</span> a link to book
              your session. It usually arrives within a minute —{" "}
              <span className="text-[#FEFEFE]">please check your spam folder</span> if you don't see it.
            </p>
            {!result.emailOk && (
              <p className="text-[11px] text-amber-400/80 mb-2">
                (The email is still sending in the background — you can book right here in the
                meantime.)
              </p>
            )}
            <p className="text-[#B1B2B3]/70 mb-6 flex items-center gap-2 text-sm">
              <CalendarClock className="w-4 h-4 text-crimson" />
              Or pick a time now:
            </p>
            <div className="rounded-lg overflow-hidden border border-white/[0.08] bg-black/30">
              <iframe
                title="Book a DSM session"
                src={CALENDLY_URL}
                className="w-full h-[720px] border-0"
                loading="lazy"
              />
            </div>
            <div className="mt-6">
              <Link
                to="/store"
                className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-[#B1B2B3]/70 hover:text-crimson transition-colors"
              >
                Back to store
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </section>
        )}

        {result?.kind === "licensing" && (
          <div className="max-w-3xl space-y-8">
            {result.matchedLinks.length > 0 && (
              <section className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-6 md:p-8">
                <div className="flex items-center gap-3 mb-4">
                  <Loader2 className="w-6 h-6 text-crimson animate-spin" />
                  <h2 className="font-serif text-2xl text-[#FEFEFE]">Taking you to checkout…</h2>
                </div>
                <p className="text-[#B1B2B3]/80 mb-2">
                  Your request is saved and we've emailed{" "}
                  <span className="text-[#FEFEFE]">{email.trim()}</span> your purchase links.
                  Redirecting you to complete the purchase now.
                </p>
                {!result.emailOk && (
                  <p className="text-[11px] text-amber-400/80 mb-2">
                    (The email is still sending in the background.)
                  </p>
                )}
                <div className="mt-5 space-y-2">
                  {result.matchedLinks.map((l) => (
                    <a
                      key={l.url}
                      href={l.url}
                      className="flex items-center justify-between gap-3 rounded-md border border-white/[0.1] bg-white/[0.02] px-4 py-3 text-sm text-[#FEFEFE] hover:border-crimson/40 transition-colors"
                    >
                      <span className="truncate">{l.name}</span>
                      <ExternalLink className="w-4 h-4 text-crimson shrink-0" />
                    </a>
                  ))}
                </div>
                {result.redirectUrl && (
                  <a
                    href={result.redirectUrl}
                    className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-crimson text-[#FEFEFE] rounded-sm text-xs font-semibold uppercase tracking-[0.14em] hover:bg-crimson-dark transition-colors"
                  >
                    Continue now
                    <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                )}
              </section>
            )}

            {result.quoteItems.length > 0 && (
              <section>
                <div className="mb-4 flex items-center gap-3">
                  <FileText className="w-5 h-5 text-crimson" />
                  <div>
                    <h2 className="font-serif text-2xl text-[#FEFEFE]">
                      {result.matchedLinks.length > 0
                        ? "Get a quote for the rest"
                        : "Let's get you a tailored quote"}
                    </h2>
                    <p className="mt-1 text-sm text-[#B1B2B3]/70">
                      We don't have instant checkout set up yet for{" "}
                      {result.quoteItems.length === 1
                        ? result.quoteItems[0].name
                        : `${result.quoteItems.length} of your items`}
                      . Confirm below and we'll send you a priced quote right away.
                    </p>
                  </div>
                </div>
                <InstantQuote
                  initialNeed={quoteNeedText(result.quoteItems)}
                  initialEmail={email.trim()}
                  leadSource="checkout-unmatched-product"
                />
              </section>
            )}
          </div>
        )}

        {/* ── Instant checkout: every item has a confident WooCommerce match ──
            No name/email screen at all — the effect above fires the redirect
            the moment this renders. This panel is purely informational (it
            asks for nothing) and is on screen only as long as the browser
            takes to act on window.location.assign. ─────────────────────── */}
        {!result && items.length > 0 && isInstantCheckoutPath && (
          <section className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-6 md:p-8 max-w-2xl">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="w-6 h-6 text-crimson animate-spin" />
              <h2 className="font-serif text-2xl text-[#FEFEFE]">Taking you to checkout…</h2>
            </div>
            <p className="text-[#B1B2B3]/80 mb-2">
              No sign-in needed — we already know exactly what you're buying.
            </p>
            <div className="mt-5 space-y-2">
              {matchedLinks.map((l) => (
                <a
                  key={l.url}
                  href={l.url}
                  className="flex items-center justify-between gap-3 rounded-md border border-white/[0.1] bg-white/[0.02] px-4 py-3 text-sm text-[#FEFEFE] hover:border-crimson/40 transition-colors"
                >
                  <span className="truncate">{l.name}</span>
                  <ExternalLink className="w-4 h-4 text-crimson shrink-0" />
                </a>
              ))}
            </div>
            <a
              href={matchedLinks[0]?.url}
              className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-crimson text-[#FEFEFE] rounded-sm text-xs font-semibold uppercase tracking-[0.14em] hover:bg-crimson-dark transition-colors"
            >
              Continue now
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </section>
        )}

        {/* ── Empty cart ──────────────────────────────────────────────────── */}
        {!result && items.length === 0 && (
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-10 text-center">
            <h2 className="font-serif text-2xl text-[#FEFEFE] mb-3">Your cart is empty</h2>
            <p className="text-[#B1B2B3]/60 mb-6">Add products to begin.</p>
            <Link
              to="/store"
              className="inline-flex items-center gap-2 px-6 py-3 bg-crimson text-[#FEFEFE] rounded-sm text-xs font-semibold uppercase tracking-[0.12em] hover:bg-crimson-dark transition-colors"
            >
              Browse Store
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        {/* ── The form ────────────────────────────────────────────────────── */}
        {!result && items.length > 0 && !isInstantCheckoutPath && (
          <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-8">
            <section className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-6 md:p-8">
              <div className="flex items-center gap-2 mb-6">
                <UserRound className="w-4 h-4 text-crimson" />
                <span className="text-sm font-medium text-[#FEFEFE]">Easy login — no password</span>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full Name"
                    autoComplete="name"
                    className="bg-white/[0.03] border border-white/[0.1] rounded-md px-4 py-3 text-sm text-[#FEFEFE] placeholder:text-[#B1B2B3]/45 focus:outline-none focus:border-crimson/40"
                  />
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email Address"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    className="bg-white/[0.03] border border-white/[0.1] rounded-md px-4 py-3 text-sm text-[#FEFEFE] placeholder:text-[#B1B2B3]/45 focus:outline-none focus:border-crimson/40"
                  />
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Phone (Optional)"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    className="bg-white/[0.03] border border-white/[0.1] rounded-md px-4 py-3 text-sm text-[#FEFEFE] placeholder:text-[#B1B2B3]/45 focus:outline-none focus:border-crimson/40 md:col-span-2"
                  />
                  <textarea
                    value={intent}
                    onChange={(e) => setIntent(e.target.value)}
                    placeholder={
                      isOwnPath
                        ? "What would you like to see in the demo? (Optional)"
                        : "Anything we should know about your order? (Optional)"
                    }
                    rows={3}
                    className="bg-white/[0.03] border border-white/[0.1] rounded-md px-4 py-3 text-sm text-[#FEFEFE] placeholder:text-[#B1B2B3]/45 focus:outline-none focus:border-crimson/40 md:col-span-2 resize-none"
                  />
                </div>

                {error && (
                  <p className="text-xs text-crimson bg-crimson/[0.08] border border-crimson/20 rounded-md px-3 py-2">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 bg-crimson text-[#FEFEFE] rounded-sm text-xs font-semibold uppercase tracking-[0.14em] hover:bg-crimson-dark hover:shadow-crimson-glow transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Submitting…
                    </>
                  ) : isOwnPath ? (
                    <>
                      <CalendarClock className="w-4 h-4" />
                      Request Demo & Book Meeting
                    </>
                  ) : isQuoteOnlyPath ? (
                    <>
                      <FileText className="w-4 h-4" />
                      Request My Quote
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4" />
                      Get My Purchase Links
                    </>
                  )}
                </button>

                <p className="text-[11px] text-[#B1B2B3]/50 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  {isOwnPath
                    ? "We'll email a booking link and set up a live session — no payment now."
                    : isQuoteOnlyPath
                    ? "We save your request and get you a tailored, priced quote right here."
                    : "We save your request, email your purchase links, and take you to our licensed store to pay."}
                </p>
              </form>
            </section>

            <aside className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-6 h-fit sticky top-36">
              <h2 className="font-serif text-2xl text-[#FEFEFE] mb-6">
                {isOwnPath ? "Your Interest" : "Your Request"}
              </h2>
              <div className="space-y-3 mb-6">
                {items.map((item) => (
                  <div key={String(item.id)} className="flex items-start justify-between gap-3 text-sm">
                    <div className="text-[#B1B2B3]/85">
                      {item.name}
                      <span className="text-[#B1B2B3]/50 ml-1">x{item.quantity}</span>
                      {isOwnProduct({ id: item.id, name: item.name }) && (
                        <span className="ml-2 inline-block text-[9px] uppercase tracking-wider text-azure/80 border border-azure/30 rounded px-1.5 py-0.5 align-middle">
                          DSM
                        </span>
                      )}
                    </div>
                    <div className="text-[#FEFEFE]">
                      {isOwnProduct({ id: item.id, name: item.name })
                        ? "—"
                        : formatAED(item.unitPrice * item.quantity)}
                    </div>
                  </div>
                ))}
              </div>

              {!isOwnPath && (
                <div className="space-y-2 text-sm border-t border-white/[0.08] pt-4">
                  <div className="flex justify-between text-[#B1B2B3]/75">
                    <span>Subtotal</span>
                    <span>{formatAED(cartTotal)}</span>
                  </div>
                  <div className="flex justify-between text-[#B1B2B3]/75">
                    <span>VAT (5%)</span>
                    <span>{formatAED(cartTotal * 0.05)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <span className="text-[#FEFEFE] font-medium">Est. Total</span>
                    <span className="font-serif text-2xl text-[#FEFEFE]">{formatAED(finalTotal)}</span>
                  </div>
                  <p className="text-[10px] text-[#B1B2B3]/45 pt-1">
                    {isQuoteOnlyPath
                      ? "Final price is confirmed on your tailored quote."
                      : "Final price is confirmed on our licensed store at checkout."}
                  </p>
                </div>
              )}
              {isOwnPath && (
                <p className="text-xs text-[#B1B2B3]/60 border-t border-white/[0.08] pt-4">
                  These are DSM's own products. We'll set up a live walkthrough — no payment is taken
                  here.
                </p>
              )}
            </aside>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
