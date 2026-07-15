/**
 * AccountPrompt — tasteful "join DSM (free)" nudge for visitors
 * -------------------------------------------------------------
 * A small, dismissible bottom-left card that invites a non-member to sign in /
 * create a free account to unlock their dashboard + member price. It is
 * deliberately quiet:
 *  - Never shown to signed-in members.
 *  - Appears once per visitor after a short engagement delay (or on scroll),
 *    then respects a "dismissed" flag so it doesn't nag.
 *  - Hidden on the /account and /checkout routes (already in-flow).
 *  - Pure STABLE-backend UI (only opens the account dialog); nothing here can
 *    break the page.
 */

import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Sparkles, X } from 'lucide-react';
import { useAccount } from '@/hooks/useAccount';
import { MEMBER_DISCOUNT_PCT } from '@/lib/account';
import { track } from '@/lib/stable/analytics';

const DISMISS_KEY = 'dsm.account.promptDismissed';
const SHOW_DELAY_MS = 12_000; // let them browse first
const SCROLL_TRIGGER = 900; // …or after a meaningful scroll

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export default function AccountPrompt({ onSignIn }: { onSignIn: () => void }) {
  const { isMember } = useAccount();
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(wasDismissed);

  const suppressedRoute =
    location.pathname.startsWith('/account') || location.pathname.startsWith('/checkout');

  useEffect(() => {
    if (isMember || dismissed || suppressedRoute) return;

    let done = false;
    const reveal = () => {
      if (done) return;
      done = true;
      setVisible(true);
      track({ event: 'account_prompt_shown', eventType: 'custom' });
    };

    const timer = window.setTimeout(reveal, SHOW_DELAY_MS);
    const onScroll = () => {
      if (window.scrollY > SCROLL_TRIGGER) reveal();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
    };
  }, [isMember, dismissed, suppressedRoute]);

  const dismiss = () => {
    setVisible(false);
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    track({ event: 'account_prompt_dismissed', eventType: 'custom' });
  };

  if (isMember || dismissed || suppressedRoute || !visible) return null;

  return (
    <div
      className="fixed bottom-6 left-6 z-[60] w-[320px] max-w-[calc(100vw-3rem)] animate-in fade-in slide-in-from-bottom-4 duration-500"
      role="dialog"
      aria-label="Create a free DSM account"
    >
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#0b0c0e]/95 p-5 shadow-premium-lg backdrop-blur-md">
        <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-crimson/20 blur-2xl" />
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="absolute right-3 top-3 text-[#B1B2B3]/60 transition-colors hover:text-[#FEFEFE]"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative">
          <div className="mb-2 inline-flex items-center gap-1.5 text-crimson">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">
              Free membership
            </span>
          </div>
          <h3 className="font-serif text-lg leading-snug text-[#FEFEFE]">
            Save {MEMBER_DISCOUNT_PCT}% & track every license
          </h3>
          <p className="mt-1.5 text-xs leading-relaxed text-[#B1B2B3]">
            Create a free DSM account to unlock member pricing, one dashboard for all your
            licenses and renewals, and insider launch alerts.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={() => {
                track({ event: 'account_prompt_cta', eventType: 'click' });
                onSignIn();
              }}
              className="btn-magnetic rounded-sm bg-crimson px-4 py-2 text-xs font-medium text-[#FEFEFE] transition-colors hover:bg-crimson-dark"
            >
              Create free account
            </button>
            <button
              onClick={dismiss}
              className="px-2 py-2 text-xs text-[#B1B2B3]/70 transition-colors hover:text-[#FEFEFE]"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
