/**
 * ResellerProvider — single mount point for the B2B reseller sign-in pop-up
 * -------------------------------------------------------------------------
 * Mounts <ResellerSignInModal> exactly once and exposes `useResellerDialog()`
 * so any component (Header "Resellers" link, a CTA on a page, the concierge)
 * can open the reseller sign-in / registration modal without prop-drilling —
 * mirroring the member-side <AccountProvider>.
 *
 * It also fires a tasteful FIRST-VISIT trigger: a signed-out, non-reseller
 * visitor who has never seen it is shown the pop-up once (after a delay long
 * enough not to collide with the member AccountPrompt). It is one-time
 * (localStorage) and suppressed on routes that carry their own reseller UI.
 *
 * Purely client-side and resilient by construction: the modal only ever drives
 * lib/reseller.ts, which talks to STABLE backends (and queues on failure).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import ResellerSignInModal from '@/components/ResellerSignInModal';
import { currentReseller } from '@/lib/reseller';
import { track } from '@/lib/stable/analytics';

interface ResellerDialogApi {
  /** Open the reseller sign-in / registration pop-up. */
  open: () => void;
  /** Close it. */
  close: () => void;
}

const Ctx = createContext<ResellerDialogApi | null>(null);

/** One-time first-visit prompt bookkeeping. */
const FIRST_VISIT_KEY = 'dsm.reseller.promptShown';
const FIRST_VISIT_DELAY_MS = 22_000; // after the member prompt, never racing it

function firstVisitSeen(): boolean {
  try {
    return localStorage.getItem(FIRST_VISIT_KEY) === '1';
  } catch {
    return false;
  }
}

export function ResellerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const firedFirstVisit = useRef(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const api = useMemo<ResellerDialogApi>(() => ({ open, close }), [open, close]);

  // First-visit trigger: gentle, one-time, and only for signed-out visitors who
  // are not already resellers. Suppressed where a reseller flow already lives.
  const suppressedRoute =
    location.pathname.startsWith('/reseller') ||
    location.pathname.startsWith('/account') ||
    location.pathname.startsWith('/checkout');

  useEffect(() => {
    if (firedFirstVisit.current || suppressedRoute) return;
    if (firstVisitSeen() || currentReseller()) return;

    const timer = window.setTimeout(() => {
      // Re-check just before firing — the visitor may have signed in meanwhile.
      if (firstVisitSeen() || currentReseller()) return;
      firedFirstVisit.current = true;
      try {
        localStorage.setItem(FIRST_VISIT_KEY, '1');
      } catch {
        /* private mode — still show it this session */
      }
      track({ event: 'reseller_first_visit_prompt', eventType: 'custom' });
      setIsOpen(true);
    }, FIRST_VISIT_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [suppressedRoute]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {/* The one reseller sign-in instance the whole app shares. On success it
          navigates the partner to /reseller. */}
      <ResellerSignInModal open={isOpen} onOpenChange={setIsOpen} />
    </Ctx.Provider>
  );
}

/** Access the shared reseller dialog. Safe no-op API outside the provider. */
export function useResellerDialog(): ResellerDialogApi {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return { open: () => undefined, close: () => undefined };
  }
  return ctx;
}
