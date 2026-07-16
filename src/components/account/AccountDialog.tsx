/**
 * AccountDialog — free DSM account sign-in / create modal
 * -------------------------------------------------------
 * The single entry point into a DSM member account. Everything here rides ONLY
 * the STABLE backends (Ecommerce Apps Script for the durable member record +
 * licenses, and the local mail bridge for the optional magic-code). There is no
 * password and no user database — see lib/account.ts.
 *
 * Two paths, both free and instant:
 *  - Quick sign-in: type your email, you're in. Good enough to greet a returning
 *    buyer and show the licenses that are already scoped to that email server-side.
 *  - Verify by email (optional): we email a 6-digit code via the mail bridge. If
 *    the bridge isn't running (admin app offline) we transparently fall back to
 *    quick sign-in — a down bridge never blocks account creation.
 *
 * On success the caller is navigated to the /account portal.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Loader2, Mail, ShieldCheck, Sparkles } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  isValidEmail,
  requestLoginCode,
  setInsiderOptIn,
  signIn,
  signInWithPassword,
  signUp,
  verifyLoginCode,
  MEMBER_DISCOUNT_PCT,
} from '@/lib/account';
import { track } from '@/lib/stable/analytics';
import { captureLead } from '@/lib/captureLead';

export interface AccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where to send the member after they sign in. Default: '/account'. */
  redirectTo?: string;
  /** Called after a successful sign-in (before navigation). */
  onSignedIn?: (email: string) => void;
}

type Step = 'email' | 'code';

const PERKS = [
  { icon: Sparkles, text: `Exclusive ${MEMBER_DISCOUNT_PCT}% member price on every license` },
  { icon: ShieldCheck, text: 'One dashboard for every license, renewal & expiry' },
  { icon: Mail, text: 'Insider alerts on new launches & renewal reminders' },
];

export default function AccountDialog({
  open,
  onOpenChange,
  redirectTo = '/account',
  onSignedIn,
}: AccountDialogProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [code, setCode] = useState('');
  const [insider, setInsider] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Reset transient state whenever the dialog is (re)opened.
  useEffect(() => {
    if (open) {
      setStep('email');
      setCode('');
      setPassword('');
      setError('');
      setNotice('');
      setBusy(false);
      track({ event: 'account_dialog_open', eventType: 'custom' });
    }
  }, [open]);

  const finish = useCallback(
    (verified: boolean) => {
      const acct = signIn(email, { displayName: name.trim() || undefined, verified });
      setInsiderOptIn(insider, acct.email);
      captureLead({
        email: acct.email,
        source: 'account',
        name: name.trim() || undefined,
        productName: 'Member account signup',
        notes: `Free DSM member account created / signed in.${insider ? ' Opted into insider alerts.' : ''}`,
        metadata: { verified, insider },
      });
      track({
        event: 'account_signed_in',
        eventType: 'custom',
        metadata: { verified, insider },
      });
      onSignedIn?.(acct.email);
      onOpenChange(false);
      navigate(redirectTo);
    },
    [email, name, insider, onSignedIn, onOpenChange, navigate, redirectTo],
  );

  const onQuickSignIn = useCallback(() => {
    setError('');
    if (!isValidEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    finish(false);
  }, [email, finish]);

  // Primary action. Password is OPTIONAL: leave it blank for instant email-only
  // sign-in; set one to create / sign into a password-protected account.
  const onContinue = useCallback(async () => {
    setError('');
    if (!isValidEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password.trim()) {
      finish(false); // no password → passwordless quick sign-in
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signup') {
        await signUp(email, password, { displayName: name.trim() || undefined });
        finish(false);
      } else {
        await signInWithPassword(email, password);
        finish(true); // password-verified
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed. Please try again.';
      setError(
        mode === 'signin' && /no account/i.test(msg)
          ? 'No account for that email yet — switch to “Create account” below.'
          : msg,
      );
    } finally {
      setBusy(false);
    }
  }, [email, password, mode, name, finish]);

  const onRequestCode = useCallback(async () => {
    setError('');
    setNotice('');
    if (!isValidEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    setBusy(true);
    try {
      await requestLoginCode(email);
      setStep('code');
      setNotice(`We emailed a 6-digit code to ${email.trim()}. It expires in 10 minutes.`);
    } catch {
      // Mail bridge down → transparent fallback to quick sign-in.
      setNotice('Signing you in…');
      finish(false);
    } finally {
      setBusy(false);
    }
  }, [email, finish]);

  const onVerify = useCallback(() => {
    setError('');
    try {
      verifyLoginCode(email, code);
      setInsiderOptIn(insider, email.trim().toLowerCase());
      captureLead({
        email: email.trim().toLowerCase(),
        source: 'account',
        name: name.trim() || undefined,
        productName: 'Member account signup',
        notes: `Free DSM member account verified by email code.${insider ? ' Opted into insider alerts.' : ''}`,
        metadata: { verified: true, insider },
      });
      track({ event: 'account_signed_in', eventType: 'custom', metadata: { verified: true, insider } });
      onSignedIn?.(email.trim().toLowerCase());
      onOpenChange(false);
      navigate(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code was not accepted.');
    }
  }, [email, code, insider, onSignedIn, onOpenChange, navigate, redirectTo]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] bg-[#0b0c0e] border-white/10 text-[#FEFEFE]">
        <DialogHeader>
          <div className="mb-1 inline-flex items-center gap-2 text-crimson">
            <Sparkles className="h-4 w-4" aria-hidden />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">
              Exclusive Member Access
            </span>
          </div>
          <DialogTitle className="font-serif text-2xl leading-tight text-[#FEFEFE]">
            {step === 'email' ? 'Become an Exclusive Member' : 'Check your inbox'}
          </DialogTitle>
          <DialogDescription className="text-[#B1B2B3]">
            {step === 'email'
              ? 'Sign in or create your free account — email only, or add a password.'
              : 'Enter the 6-digit code we just sent to confirm it’s you.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'email' ? (
          <div className="space-y-4">
            <ul className="space-y-2">
              {PERKS.map((p) => (
                <li key={p.text} className="flex items-center gap-2.5 text-sm text-[#B1B2B3]">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-crimson/15 text-crimson">
                    <p.icon className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  {p.text}
                </li>
              ))}
            </ul>

            <div className="space-y-3 pt-1">
              <div>
                <Label htmlFor="acct-name" className="text-xs text-[#B1B2B3]">
                  Name (optional)
                </Label>
                <Input
                  id="acct-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  className="mt-1.5 bg-white/[0.03] border-white/10 text-[#FEFEFE] placeholder:text-[#B1B2B3]/50"
                />
              </div>
              <div>
                <Label htmlFor="acct-email" className="text-xs text-[#B1B2B3]">
                  Email
                </Label>
                <Input
                  id="acct-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onContinue()}
                  placeholder="you@company.com"
                  autoComplete="email"
                  autoFocus
                  className="mt-1.5 bg-white/[0.03] border-white/10 text-[#FEFEFE] placeholder:text-[#B1B2B3]/50"
                />
              </div>
              <div>
                <Label htmlFor="acct-password" className="text-xs text-[#B1B2B3]">
                  Password{' '}
                  <span className="text-[#B1B2B3]/50">(optional — leave blank for quick email sign-in)</span>
                </Label>
                <Input
                  id="acct-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onContinue()}
                  placeholder={mode === 'signup' ? 'Choose a password' : 'Your password'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  className="mt-1.5 bg-white/[0.03] border-white/10 text-[#FEFEFE] placeholder:text-[#B1B2B3]/50"
                />
                <button
                  type="button"
                  onClick={() => {
                    setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
                    setError('');
                  }}
                  className="mt-1.5 text-[11px] text-crimson hover:underline"
                >
                  {mode === 'signin'
                    ? 'New here? Create an account'
                    : 'Already have an account? Sign in'}
                </button>
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 pt-0.5">
                <Checkbox
                  checked={insider}
                  onCheckedChange={(v) => setInsider(v === true)}
                  className="mt-0.5 border-white/20 data-[state=checked]:bg-crimson data-[state=checked]:border-crimson"
                />
                <span className="text-xs leading-relaxed text-[#B1B2B3]">
                  Email me insider new-launch alerts and renewal reminders. Unsubscribe anytime.
                </span>
              </label>
            </div>

            {error && <p className="text-sm text-crimson">{error}</p>}
            {notice && <p className="text-sm text-[#B1B2B3]">{notice}</p>}

            <div className="flex flex-col gap-2 pt-1">
              <Button
                onClick={onContinue}
                disabled={busy}
                className="w-full bg-crimson text-[#FEFEFE] hover:bg-crimson-dark"
              >
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {mode === 'signup' ? 'Creating account…' : 'Signing in…'}
                  </>
                ) : (
                  <>
                    {password.trim()
                      ? mode === 'signup'
                        ? 'Create account'
                        : 'Sign in'
                      : 'Continue with email'}{' '}
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                onClick={onRequestCode}
                disabled={busy}
                className="w-full text-[#B1B2B3] hover:text-[#FEFEFE] hover:bg-white/[0.04]"
              >
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending code…
                  </>
                ) : (
                  <>Verify by email instead</>
                )}
              </Button>
            </div>
            <p className="text-center text-[11px] text-[#B1B2B3]/60">
              Free forever. We never share your email.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {notice && <p className="text-sm text-[#B1B2B3]">{notice}</p>}
            <div>
              <Label htmlFor="acct-code" className="text-xs text-[#B1B2B3]">
                6-digit code
              </Label>
              <Input
                id="acct-code"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(e) => e.key === 'Enter' && onVerify()}
                placeholder="000000"
                autoFocus
                className="mt-1.5 bg-white/[0.03] border-white/10 text-center text-lg tracking-[0.4em] text-[#FEFEFE]"
              />
            </div>
            {error && <p className="text-sm text-crimson">{error}</p>}
            <Button
              onClick={onVerify}
              disabled={code.length !== 6}
              className="w-full bg-crimson text-[#FEFEFE] hover:bg-crimson-dark"
            >
              <Check className="mr-1.5 h-4 w-4" /> Verify & sign in
            </Button>
            <Button
              variant="ghost"
              onClick={() => setStep('email')}
              className="w-full text-[#B1B2B3] hover:text-[#FEFEFE] hover:bg-white/[0.04]"
            >
              Use a different email
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
