import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';

/**
 * Full-screen loading overlay shown from the instant "Buy Now" is clicked
 * (ProductDetailModal.handleBuyNow, before it even closes the modal) through
 * to the external WooCommerce checkout redirect actually landing
 * (Checkout.tsx's instant-checkout effect). Without this, that gap --
 * modal-close -> route change to /checkout -> external navigation -- had no
 * feedback at all and felt frozen.
 *
 * Lives once at the app root (mounted in App.tsx, a sibling of <Routes>,
 * same as <ProductModalWrapper> / <SettingsPanel>) so it survives both the
 * modal unmounting and the /checkout route mount -- state driving it
 * (`checkoutRedirecting`) is in AppContext for the same reason.
 *
 * Safety net: if something goes wrong and the external redirect never fires
 * (e.g. the woo match turns out not to be the instant-checkout path after
 * all -- Checkout.tsx clears the flag itself in that case -- or some other
 * unexpected stall), this self-clears after a few seconds so the buyer is
 * never stuck staring at a spinner forever.
 */
const SAFETY_TIMEOUT_MS = 8000;

export default function CheckoutRedirectOverlay() {
  const { state, setCheckoutRedirecting } = useApp();
  const { checkoutRedirecting } = state;

  useEffect(() => {
    if (!checkoutRedirecting) return;
    const t = setTimeout(() => setCheckoutRedirecting(false), SAFETY_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [checkoutRedirecting, setCheckoutRedirecting]);

  if (!checkoutRedirecting) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Creating secure payment link"
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 bg-[#060708]/90 backdrop-blur-sm"
    >
      <Loader2 className="h-10 w-10 animate-spin text-crimson" />
      <p className="text-sm font-medium tracking-wide text-[#FEFEFE]">
        Creating secure payment link…
      </p>
    </div>
  );
}
