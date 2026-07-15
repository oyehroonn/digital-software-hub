/**
 * AccountProvider — single mount point for the member account UI
 * --------------------------------------------------------------
 * Mounts the AccountDialog and the (visitor) AccountPrompt exactly once, and
 * exposes `useAccountDialog()` so any component (Header, portal, AI features)
 * can open the sign-in / create-account modal without prop-drilling.
 *
 * Purely client-side; obeys the resilience contract by construction (it only
 * ever drives lib/account.ts, which talks to STABLE backends only).
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import AccountDialog from './AccountDialog';
import AccountPrompt from './AccountPrompt';

interface AccountDialogApi {
  /** Open the sign-in / create-account modal. */
  open: (redirectTo?: string) => void;
  /** Close it. */
  close: () => void;
}

const Ctx = createContext<AccountDialogApi | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [redirectTo, setRedirectTo] = useState('/account');

  const open = useCallback((to = '/account') => {
    setRedirectTo(to);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);

  const api = useMemo<AccountDialogApi>(() => ({ open, close }), [open, close]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {/* Tasteful visitor prompt — self-gates to non-members, opens the dialog. */}
      <AccountPrompt onSignIn={() => open('/account')} />
      {/* The one dialog instance the whole app shares. */}
      <AccountDialog open={isOpen} onOpenChange={setIsOpen} redirectTo={redirectTo} />
    </Ctx.Provider>
  );
}

/** Access the shared account dialog. Safe no-op API if used outside the provider. */
export function useAccountDialog(): AccountDialogApi {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return { open: () => undefined, close: () => undefined };
  }
  return ctx;
}
