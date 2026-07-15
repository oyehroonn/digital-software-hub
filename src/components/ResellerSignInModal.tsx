/**
 * ResellerSignInModal — free B2B reseller sign-in / registration pop-up
 * ---------------------------------------------------------------------
 * The single entry point into the DSM reseller (B2B) portal — distinct from the
 * member AccountDialog. A returning partner signs in with just their email; a
 * new partner registers their company to unlock wholesale pricing, deal
 * registration and commissions.
 *
 * Rides ONLY the STABLE backends via lib/reseller.ts (which reuses the shared
 * member session in lib/account.ts and the Ecommerce Apps Script). There is no
 * password and no user database. On success the caller is navigated to
 * `/reseller`.
 *
 * Controlled component: mount it once and drive `open` / `onOpenChange`. The
 * portal page mounts its own instance for signed-out visitors; the integration
 * step can additionally trigger it from a nav "Become a reseller" CTA or when a
 * signed-out visitor lands on `/reseller`.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  Layers,
  Loader2,
  Percent,
  ShieldCheck,
  Sparkles,
  Tag,
} from 'lucide-react';

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
import { isValidEmail } from '@/lib/account';
import { registerReseller, resellerSignIn, RESELLER_TIERS } from '@/lib/reseller';
import { track } from '@/lib/stable/analytics';

export interface ResellerSignInModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where to send the partner after sign-in. Default: '/reseller'. */
  redirectTo?: string;
  /** Called after a successful register / sign-in (before navigation). */
  onSignedIn?: (email: string) => void;
}

type Mode = 'register' | 'returning';

const TOP_MARGIN = RESELLER_TIERS[RESELLER_TIERS.length - 1].marginPct;

const PERKS = [
  { icon: Percent, text: `Wholesale pricing — up to ${TOP_MARGIN}% margin, tier by volume` },
  { icon: ShieldCheck, text: 'Register & protect your deals against channel conflict' },
  { icon: Layers, text: 'Bulk quotes, a downloadable price list & commission tracking' },
];

export default function ResellerSignInModal({
  open,
  onOpenChange,
  redirectTo = '/reseller',
  onSignedIn,
}: ResellerSignInModalProps) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('register');
  const [company, setCompany] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('');
  const [taxId, setTaxId] = useState('');
  const [estUnits, setEstUnits] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (open) {
      setMode('register');
      setError('');
      setNotice('');
      setBusy(false);
      track({ event: 'reseller_modal_open', eventType: 'custom' });
    }
  }, [open]);

  const succeed = useCallback(
    (addr: string) => {
      onSignedIn?.(addr);
      onOpenChange(false);
      navigate(redirectTo);
    },
    [onSignedIn, onOpenChange, navigate, redirectTo],
  );

  const onRegister = useCallback(() => {
    setError('');
    if (!company.trim()) {
      setError('Please enter your company / trading name.');
      return;
    }
    if (!isValidEmail(email)) {
      setError('Please enter a valid business email address.');
      return;
    }
    setBusy(true);
    try {
      const parsedUnits = Number.parseInt(estUnits, 10);
      const profile = registerReseller({
        email,
        company: company.trim(),
        contactName: contactName.trim() || undefined,
        phone: phone.trim() || undefined,
        country: country.trim() || undefined,
        taxId: taxId.trim() || undefined,
        estAnnualUnits: Number.isFinite(parsedUnits) ? parsedUnits : undefined,
      });
      succeed(profile.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete registration.');
      setBusy(false);
    }
  }, [company, email, contactName, phone, country, taxId, estUnits, succeed]);

  const onReturning = useCallback(() => {
    setError('');
    setNotice('');
    if (!isValidEmail(email)) {
      setError('Please enter the email you registered with.');
      return;
    }
    setBusy(true);
    try {
      const profile = resellerSignIn(email);
      if (profile) {
        succeed(profile.email);
      } else {
        // No stored reseller profile on this device — guide them to register.
        setNotice(
          "We couldn't find a reseller profile for this email on this device. Please register your company below — it takes a moment.",
        );
        setMode('register');
        setBusy(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign you in.');
      setBusy(false);
    }
  }, [email, succeed]);

  const fieldCls =
    'mt-1.5 bg-white/[0.03] border-white/10 text-[#FEFEFE] placeholder:text-[#B1B2B3]/50';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto bg-[#0b0c0e] border-white/10 text-[#FEFEFE]">
        <DialogHeader>
          <div className="mb-1 inline-flex items-center gap-2 text-crimson">
            <Building2 className="h-4 w-4" aria-hidden />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">
              DSM Reseller Program
            </span>
          </div>
          <DialogTitle className="font-serif text-2xl leading-tight text-[#FEFEFE]">
            {mode === 'register' ? 'Become a DSM reseller' : 'Welcome back, partner'}
          </DialogTitle>
          <DialogDescription className="text-[#B1B2B3]">
            {mode === 'register'
              ? 'Free B2B account — unlock wholesale pricing, deal registration and commissions. No password.'
              : 'Sign in with the email you registered your company with.'}
          </DialogDescription>
        </DialogHeader>

        {mode === 'register' ? (
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

            <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="rs-company" className="text-xs text-[#B1B2B3]">
                  Company / trading name
                </Label>
                <Input
                  id="rs-company"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Acme Software Distribution"
                  autoComplete="organization"
                  autoFocus
                  className={fieldCls}
                />
              </div>
              <div>
                <Label htmlFor="rs-contact" className="text-xs text-[#B1B2B3]">
                  Contact name
                </Label>
                <Input
                  id="rs-contact"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  className={fieldCls}
                />
              </div>
              <div>
                <Label htmlFor="rs-email" className="text-xs text-[#B1B2B3]">
                  Business email
                </Label>
                <Input
                  id="rs-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                  className={fieldCls}
                />
              </div>
              <div>
                <Label htmlFor="rs-phone" className="text-xs text-[#B1B2B3]">
                  Phone (optional)
                </Label>
                <Input
                  id="rs-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 555 000 0000"
                  autoComplete="tel"
                  className={fieldCls}
                />
              </div>
              <div>
                <Label htmlFor="rs-country" className="text-xs text-[#B1B2B3]">
                  Country (optional)
                </Label>
                <Input
                  id="rs-country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="United States"
                  autoComplete="country-name"
                  className={fieldCls}
                />
              </div>
              <div>
                <Label htmlFor="rs-tax" className="text-xs text-[#B1B2B3]">
                  Reseller / VAT ID (optional)
                </Label>
                <Input
                  id="rs-tax"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  placeholder="For tax-exempt orders"
                  className={fieldCls}
                />
              </div>
              <div>
                <Label htmlFor="rs-units" className="text-xs text-[#B1B2B3]">
                  Est. units / year
                </Label>
                <Input
                  id="rs-units"
                  inputMode="numeric"
                  value={estUnits}
                  onChange={(e) => setEstUnits(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => e.key === 'Enter' && onRegister()}
                  placeholder="e.g. 50 — sets your tier"
                  className={fieldCls}
                />
              </div>
            </div>

            {error && <p className="text-sm text-crimson">{error}</p>}
            {notice && <p className="text-sm text-gold">{notice}</p>}

            <div className="flex flex-col gap-2 pt-1">
              <Button
                onClick={onRegister}
                disabled={busy}
                className="w-full bg-crimson text-[#FEFEFE] hover:bg-crimson-dark"
              >
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Setting up…
                  </>
                ) : (
                  <>
                    Create reseller account <ArrowRight className="ml-1.5 h-4 w-4" />
                  </>
                )}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setMode('returning');
                  setError('');
                  setNotice('');
                }}
                className="text-center text-xs text-[#B1B2B3] transition-colors hover:text-[#FEFEFE]"
              >
                Already a partner? Sign in
              </button>
            </div>
            <p className="text-center text-[11px] text-[#B1B2B3]/60">
              Free to join. Your tier auto-upgrades as your volume grows.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="mb-1 flex items-center gap-2 text-crimson">
                <Sparkles className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-[0.12em]">
                  Partner sign-in
                </span>
              </div>
              <p className="text-xs leading-relaxed text-[#B1B2B3]">
                Enter your registered email to reopen your reseller dashboard — pricing, deals and
                commissions.
              </p>
            </div>

            <div>
              <Label htmlFor="rs-email-ret" className="text-xs text-[#B1B2B3]">
                Business email
              </Label>
              <Input
                id="rs-email-ret"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onReturning()}
                placeholder="you@company.com"
                autoComplete="email"
                autoFocus
                className={fieldCls}
              />
            </div>

            {error && <p className="text-sm text-crimson">{error}</p>}

            <div className="flex flex-col gap-2 pt-1">
              <Button
                onClick={onReturning}
                disabled={busy}
                className="w-full bg-crimson text-[#FEFEFE] hover:bg-crimson-dark"
              >
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in…
                  </>
                ) : (
                  <>
                    <Tag className="mr-1.5 h-4 w-4" /> Sign in to portal
                  </>
                )}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError('');
                  setNotice('');
                }}
                className="text-center text-xs text-[#B1B2B3] transition-colors hover:text-[#FEFEFE]"
              >
                New to DSM? Register your company
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
