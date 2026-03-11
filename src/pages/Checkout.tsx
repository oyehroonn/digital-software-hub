import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CreditCard, ShieldCheck, UserRound, UsersRound, Wallet, X } from "lucide-react";
import AnnouncementBar from "@/components/AnnouncementBar";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useApp } from "@/contexts/AppContext";

const formatAED = (value: number) =>
  new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    maximumFractionDigits: 2,
  }).format(value);

type CheckoutMode = "guest" | "member";
type PaymentMethod = "card" | "apple" | "google" | "paypal";

export default function Checkout() {
  const { state, cartTotal } = useApp();
  const [mode, setMode] = useState<CheckoutMode>("guest");
  const [show3DCheckout, setShow3DCheckout] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [activePopup, setActivePopup] = useState<Exclude<PaymentMethod, "card"> | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const holdTimerRef = useRef<number | null>(null);
  const HOLD_DURATION_MS = 1200;

  const finalTotal = useMemo(() => cartTotal * 1.05, [cartTotal]);
  const checkoutAmountLabel = useMemo(() => formatAED(finalTotal), [finalTotal]);
  const checkoutItemLabel = useMemo(() => {
    if (state.cartItems.length === 0) return "DSM Software Bundle";
    if (state.cartItems.length === 1) return state.cartItems[0].name;
    return `${state.cartItems[0].name} + ${state.cartItems.length - 1} more`;
  }, [state.cartItems]);
  const checkoutIframeSrc = useMemo(
    () =>
      `/checkout/Payment2Iteration3d.html?skipHold=1&amount=${encodeURIComponent(
        checkoutAmountLabel
      )}&item=${encodeURIComponent(checkoutItemLabel)}`,
    [checkoutAmountLabel, checkoutItemLabel]
  );

  const clearHoldTimer = () => {
    if (holdTimerRef.current !== null) {
      window.clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const handleCheckoutTrigger = () => {
    if (paymentMethod === "card") {
      setActivePopup(null);
      setShow3DCheckout(true);
      return;
    }

    setShow3DCheckout(false);
    setActivePopup(paymentMethod);
  };

  const startHold = () => {
    if (isHolding) return;
    setIsHolding(true);
    setHoldProgress(0);
    const startedAt = Date.now();

    clearHoldTimer();
    holdTimerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const nextProgress = Math.min(100, (elapsed / HOLD_DURATION_MS) * 100);
      setHoldProgress(nextProgress);

      if (nextProgress >= 100) {
        clearHoldTimer();
        setIsHolding(false);
        handleCheckoutTrigger();
      }
    }, 16);
  };

  const cancelHold = () => {
    clearHoldTimer();
    setIsHolding(false);
    setHoldProgress(0);
  };

  useEffect(() => {
    return () => clearHoldTimer();
  }, []);

  return (
    <div className="min-h-screen bg-surface-dark">
      <AnnouncementBar />
      <Header />

      <main className="max-w-[1600px] mx-auto px-6 pt-44 pb-16">
        <div className="mb-10">
          <span className="inline-block text-[10px] font-semibold text-crimson uppercase tracking-[0.2em] mb-3">
            Secure Checkout
          </span>
          <h1 className="font-serif text-4xl md:text-5xl text-[#FEFEFE] mb-2">Complete Your Purchase</h1>
          <p className="text-[#B1B2B3]/65">
            Premium DSM checkout flow with account options and multi-method payments.
          </p>
        </div>

        {state.cartItems.length === 0 ? (
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-10 text-center">
            <h2 className="font-serif text-2xl text-[#FEFEFE] mb-3">Your cart is empty</h2>
            <p className="text-[#B1B2B3]/60 mb-6">Add products to begin checkout.</p>
            <Link
              to="/store"
              className="inline-flex items-center gap-2 px-6 py-3 bg-crimson text-[#FEFEFE] rounded-sm text-xs font-semibold uppercase tracking-[0.12em] hover:bg-crimson-dark transition-colors"
            >
              Browse Store
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-8">
            <section className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-6 md:p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <button
                  onClick={() => setMode("guest")}
                  className={`text-left rounded-md border px-4 py-4 transition-all ${
                    mode === "guest"
                      ? "border-crimson/40 bg-crimson/[0.08]"
                      : "border-white/[0.08] bg-white/[0.01] hover:border-white/[0.2]"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <UserRound className="w-4 h-4 text-crimson" />
                    <span className="text-sm font-medium text-[#FEFEFE]">Continue as Guest</span>
                  </div>
                  <p className="text-xs text-[#B1B2B3]/65">Fast checkout without account creation.</p>
                </button>
                <button
                  onClick={() => setMode("member")}
                  className={`text-left rounded-md border px-4 py-4 transition-all ${
                    mode === "member"
                      ? "border-azure/40 bg-azure/[0.08]"
                      : "border-white/[0.08] bg-white/[0.01] hover:border-white/[0.2]"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <UsersRound className="w-4 h-4 text-azure" />
                    <span className="text-sm font-medium text-[#FEFEFE]">DSM Member Checkout</span>
                  </div>
                  <p className="text-xs text-[#B1B2B3]/65">Save purchases, licenses, and invoices in profile.</p>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <input placeholder="Full Name" className="bg-white/[0.03] border border-white/[0.1] rounded-md px-4 py-3 text-sm text-[#FEFEFE] placeholder:text-[#B1B2B3]/45 focus:outline-none focus:border-crimson/40" />
                <input placeholder="Email Address" className="bg-white/[0.03] border border-white/[0.1] rounded-md px-4 py-3 text-sm text-[#FEFEFE] placeholder:text-[#B1B2B3]/45 focus:outline-none focus:border-crimson/40" />
                <input placeholder="Company (Optional)" className="bg-white/[0.03] border border-white/[0.1] rounded-md px-4 py-3 text-sm text-[#FEFEFE] placeholder:text-[#B1B2B3]/45 focus:outline-none focus:border-crimson/40 md:col-span-2" />
              </div>

              <h3 className="text-xs uppercase tracking-[0.16em] text-[#B1B2B3]/70 mb-3">Payment Methods</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                {[
                  { id: "card", label: "Card", icon: CreditCard },
                  { id: "apple", label: "Apple Pay", icon: Wallet },
                  { id: "google", label: "Google Pay", icon: Wallet },
                  { id: "paypal", label: "PayPal", icon: Wallet },
                ].map((method) => (
                  <button
                    key={method.id}
                    onClick={() => {
                      setPaymentMethod(method.id as PaymentMethod);
                      setActivePopup(null);
                      if (method.id !== "card") {
                        setShow3DCheckout(false);
                      }
                    }}
                    className={`rounded-md border px-3 py-3 text-sm transition-all ${
                      paymentMethod === method.id
                        ? "border-crimson/40 bg-crimson/[0.08] text-[#FEFEFE]"
                        : "border-white/[0.1] bg-white/[0.02] text-[#B1B2B3] hover:border-white/[0.25]"
                    }`}
                  >
                    <method.icon className="w-4 h-4 mx-auto mb-1" />
                    {method.label}
                  </button>
                ))}
              </div>

              <button
                onMouseDown={startHold}
                onMouseUp={cancelHold}
                onMouseLeave={cancelHold}
                onTouchStart={(e) => {
                  e.preventDefault();
                  startHold();
                }}
                onTouchEnd={cancelHold}
                onTouchCancel={cancelHold}
                className="relative w-full inline-flex items-center justify-center gap-2 px-6 py-4 bg-crimson text-[#FEFEFE] rounded-sm text-xs font-semibold uppercase tracking-[0.14em] hover:bg-crimson-dark hover:shadow-crimson-glow transition-all overflow-hidden"
              >
                <span
                  className="absolute inset-0 bg-white/25 transition-[clip-path] duration-100"
                  style={{ clipPath: `circle(${holdProgress}% at center)` }}
                />
                <span className="relative z-10 inline-flex items-center gap-2">
                  Press & Hold to Checkout
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </button>
              <p className="mt-3 text-[11px] text-[#B1B2B3]/50">
                Selected method:{" "}
                <span className="text-[#FEFEFE]/80 capitalize">
                  {paymentMethod === "apple" ? "Apple Pay" : paymentMethod === "google" ? "Google Pay" : paymentMethod}
                </span>
              </p>

              <p className="mt-4 text-[11px] text-[#B1B2B3]/45 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                Encrypted payments and official VAT invoice support.
              </p>
            </section>

            <aside className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-6 h-fit sticky top-36">
              <h2 className="font-serif text-2xl text-[#FEFEFE] mb-6">Summary</h2>
              <div className="space-y-3 mb-6">
                {state.cartItems.map((item) => (
                  <div key={String(item.id)} className="flex items-start justify-between gap-3 text-sm">
                    <div className="text-[#B1B2B3]/85">
                      {item.name}
                      <span className="text-[#B1B2B3]/50 ml-1">x{item.quantity}</span>
                    </div>
                    <div className="text-[#FEFEFE]">{formatAED(item.unitPrice * item.quantity)}</div>
                  </div>
                ))}
              </div>
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
                  <span className="text-[#FEFEFE] font-medium">Total</span>
                  <span className="font-serif text-2xl text-[#FEFEFE]">{formatAED(finalTotal)}</span>
                </div>
              </div>
            </aside>
          </div>
        )}

        {show3DCheckout && (
          <section className="mt-10 rounded-lg border border-white/[0.06] bg-black/40 overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
              <h3 className="font-serif text-2xl text-[#FEFEFE]">Complete your card details</h3>
              <button
                onClick={() => setShow3DCheckout(false)}
                className="text-xs uppercase tracking-[0.12em] text-[#B1B2B3] hover:text-crimson transition-colors"
              >
                Close
              </button>
            </div>
            <iframe
              title="DSM Premium Checkout 3D"
              src={checkoutIframeSrc}
              className="w-full h-[800px] border-0 bg-black"
            />
          </section>
        )}

        {activePopup && (
          <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0b0b0d]/95 p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-serif text-2xl text-[#FEFEFE]">
                  {activePopup === "apple"
                    ? "Apple Pay"
                    : activePopup === "google"
                    ? "Google Pay"
                    : "PayPal"}{" "}
                  Checkout
                </h3>
                <button
                  onClick={() => setActivePopup(null)}
                  className="w-8 h-8 rounded-full border border-white/[0.12] text-[#B1B2B3] hover:text-[#FEFEFE] hover:border-crimson/40 transition-colors flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-sm text-[#B1B2B3]/75 mb-6">
                Confirm your payment using your selected method. This popup is the premium handoff step before final authorization.
              </p>

              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 mb-6">
                <div className="flex justify-between text-sm text-[#B1B2B3]/70 mb-2">
                  <span>Amount</span>
                  <span>{formatAED(finalTotal)}</span>
                </div>
                <div className="flex justify-between text-sm text-[#B1B2B3]/70">
                  <span>Method</span>
                  <span className="text-[#FEFEFE]/85">
                    {activePopup === "apple" ? "Apple Pay" : activePopup === "google" ? "Google Pay" : "PayPal"}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setActivePopup(null)}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 bg-crimson text-[#FEFEFE] rounded-sm text-xs font-semibold uppercase tracking-[0.14em] hover:bg-crimson-dark hover:shadow-crimson-glow transition-all"
              >
                Complete Payment
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

