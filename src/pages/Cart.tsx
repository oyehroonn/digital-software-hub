import { Link } from "react-router-dom";
import { Minus, Plus, Trash2, ArrowRight, ShoppingBag } from "lucide-react";
import AnnouncementBar from "@/components/AnnouncementBar";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductModelViewer from "@/components/ProductModelViewer";
import { useApp } from "@/contexts/AppContext";

const formatAED = (value: number) =>
  new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    maximumFractionDigits: 2,
  }).format(value);

export default function Cart() {
  const { state, updateCartQuantity, removeFromCart, cartTotal } = useApp();
  const items = state.cartItems;

  return (
    <div className="min-h-screen bg-surface-dark">
      <AnnouncementBar />
      <Header />

      <main className="max-w-[1600px] mx-auto px-6 pt-44 pb-16">
        <div className="flex items-end justify-between mb-10">
          <div>
            <span className="inline-block text-[10px] font-semibold text-crimson uppercase tracking-[0.18em] mb-3">
              Your Selection
            </span>
            <h1 className="font-serif text-4xl md:text-5xl text-[#FEFEFE]">Cart</h1>
            <p className="text-sm text-[#B1B2B3]/60 mt-2">
              {items.length} {items.length === 1 ? "item" : "items"} in your cart
            </p>
          </div>
          <Link
            to="/store"
            className="text-xs uppercase tracking-[0.12em] text-[#B1B2B3]/70 hover:text-crimson transition-colors"
          >
            Continue Shopping
          </Link>
        </div>

        {items.length === 0 ? (
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-12 text-center">
            <div className="w-14 h-14 mx-auto rounded-full border border-white/[0.08] flex items-center justify-center mb-5">
              <ShoppingBag className="w-6 h-6 text-[#B1B2B3]/60" />
            </div>
            <h2 className="font-serif text-2xl text-[#FEFEFE] mb-3">Your cart is empty</h2>
            <p className="text-[#B1B2B3]/60 mb-8">
              Add products to begin your premium checkout experience.
            </p>
            <Link
              to="/store"
              className="inline-flex items-center gap-2 px-6 py-3 bg-crimson text-[#FEFEFE] rounded-sm text-xs font-semibold uppercase tracking-[0.12em] hover:bg-crimson-dark transition-colors"
            >
              Browse Store
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            <section className="xl:col-span-2 space-y-4">
              {items.map((item) => (
                <article
                  key={String(item.id)}
                  className="group rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 md:p-5 transition-all hover:border-crimson/30 hover:shadow-crimson-glow"
                >
                  <div className="grid grid-cols-1 md:grid-cols-[160px_1fr_auto] gap-4 items-center">
                    <div className="h-36 rounded-md overflow-hidden border border-white/[0.06] bg-secondary">
                      <ProductModelViewer
                        glbSrc={item.glbSrc}
                        fallbackIcon={
                          <div className="w-16 h-16 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                            <span className="text-xl font-bold text-white/20">{item.name.charAt(0)}</span>
                          </div>
                        }
                      />
                    </div>

                    <div>
                      <h3 className="font-serif text-xl text-[#FEFEFE] mb-2">{item.name}</h3>
                      <p className="text-xs text-[#B1B2B3]/60 uppercase tracking-[0.12em] mb-4">
                        {item.category || "Software"}{item.brand ? ` • ${item.brand}` : ""}
                      </p>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => updateCartQuantity(item.id, item.quantity - 1)}
                          className="w-8 h-8 rounded border border-white/[0.1] text-[#B1B2B3] hover:text-[#FEFEFE] hover:border-crimson/40 transition-colors"
                        >
                          <Minus className="w-3.5 h-3.5 mx-auto" />
                        </button>
                        <span className="min-w-[30px] text-center text-sm text-[#FEFEFE]">{item.quantity}</span>
                        <button
                          onClick={() => updateCartQuantity(item.id, item.quantity + 1)}
                          className="w-8 h-8 rounded border border-white/[0.1] text-[#B1B2B3] hover:text-[#FEFEFE] hover:border-crimson/40 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5 mx-auto" />
                        </button>
                      </div>
                    </div>

                    <div className="md:text-right flex md:block items-center justify-between gap-4">
                      <div>
                        <p className="text-xs text-[#B1B2B3]/50 uppercase tracking-[0.1em]">Line Total</p>
                        <p className="font-serif text-xl text-[#FEFEFE]">
                          {formatAED(item.unitPrice * item.quantity)}
                        </p>
                      </div>
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="p-2 rounded border border-white/[0.08] text-[#B1B2B3]/70 hover:text-crimson hover:border-crimson/30 transition-colors"
                        aria-label={`Remove ${item.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </section>

            <aside className="h-fit sticky top-36 rounded-lg border border-white/[0.06] bg-white/[0.02] p-6">
              <h2 className="font-serif text-2xl text-[#FEFEFE] mb-6">Order Summary</h2>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between text-[#B1B2B3]/75">
                  <span>Subtotal</span>
                  <span>{formatAED(cartTotal)}</span>
                </div>
                <div className="flex items-center justify-between text-[#B1B2B3]/75">
                  <span>VAT (5%)</span>
                  <span>{formatAED(cartTotal * 0.05)}</span>
                </div>
                <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between">
                  <span className="text-[#FEFEFE] font-medium">Total</span>
                  <span className="font-serif text-2xl text-[#FEFEFE]">
                    {formatAED(cartTotal * 1.05)}
                  </span>
                </div>
              </div>

              <Link
                to="/checkout"
                className="mt-8 inline-flex w-full items-center justify-center gap-2 px-6 py-4 bg-crimson text-[#FEFEFE] rounded-sm text-xs font-semibold uppercase tracking-[0.14em] hover:bg-crimson-dark hover:shadow-crimson-glow transition-all"
              >
                Proceed to Checkout
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>

              <p className="mt-4 text-[11px] text-[#B1B2B3]/45 text-center">
                Secure checkout • Genuine software licenses only
              </p>
            </aside>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

