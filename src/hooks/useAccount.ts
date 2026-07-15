/**
 * useAccount — React binding for the STABLE accounts foundation (lib/account.ts)
 * ------------------------------------------------------------------------------
 * A thin, render-safe hook that exposes the signed-in member and re-renders when
 * they sign in / out (via `onAuthChange`). It holds no network state of its own —
 * identity is the client-side session in `lib/account.ts`, which only ever talks
 * to the STABLE Ecommerce Apps Script + local mail bridge. Safe to call from any
 * component; SSR-safe (returns `null` when there is no window session).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  type Account,
  currentUser,
  isInsider,
  onAuthChange,
  signOut as libSignOut,
} from '@/lib/account';

export interface UseAccount {
  /** The signed-in member, or null. */
  account: Account | null;
  /** Convenience boolean. */
  isMember: boolean;
  /** Whether this member is opted into insider emails. */
  insider: boolean;
  /** Sign out and clear the local session. */
  signOut: () => void;
  /** Force a re-read (e.g. after toggling insider opt-in in the same tab). */
  refresh: () => void;
}

export function useAccount(): UseAccount {
  const [account, setAccount] = useState<Account | null>(() => currentUser());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // Re-sync on mount (session may have been written before hydration).
    setAccount(currentUser());
    const off = onAuthChange((next) => setAccount(next));
    // Cross-tab sign in/out keeps every tab in step.
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'dsm.account' || e.key === null) setAccount(currentUser());
    };
    if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
    return () => {
      off();
      if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
    };
  }, []);

  const refresh = useCallback(() => {
    setAccount(currentUser());
    setTick((t) => t + 1);
  }, []);

  const signOut = useCallback(() => {
    libSignOut();
    setAccount(null);
  }, []);

  // `tick` participates so `insider` recomputes after a refresh() call.
  void tick;

  return {
    account,
    isMember: account !== null,
    insider: account ? isInsider(account.email) : false,
    signOut,
    refresh,
  };
}
