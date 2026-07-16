/**
 * Exclusive Members — /exclusive
 * -------------------------------
 * A premium, on-brand landing page whose primary job is MEMBER LOGIN. It reuses
 * the STABLE, passwordless accounts foundation (lib/account.ts) — email quick
 * sign-in plus an optional magic-code — wrapped in a luxe, dark/crimson hero
 * with subtle motion.
 *
 * Resilience: everything here rides ONLY the STABLE backends (Ecommerce Apps
 * Script for the durable member record + the local mail bridge for the optional
 * code). A down mail bridge transparently falls back to quick sign-in — the
 * login never blocks or breaks. No unstable VPS / LLM calls on this page.
 *
 * Already-signed-in members see a warm "you're in" welcome instead of the form.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  Check,
  Crown,
  Gauge,
  Loader2,
  Lock,
  Mail,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  Tag,
} from 'lucide-react';

import Header from '@/components/Header';
import Footer from '@/components/Footer';
import GrainOverlay from '@/components/GrainOverlay';
import MemberOrderingAvatar from '@/components/ai/MemberOrderingAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useAccount } from '@/hooks/useAccount';
import {
  isValidEmail,
  requestLoginCode,
  setInsiderOptIn,
  signIn,
  verifyLoginCode,
  MEMBER_DISCOUNT_PCT,
} from '@/lib/account';
import { track } from '@/lib/stable/analytics';

type Step = 'email' | 'code';

// The four exclusive-member benefits, echoed in the hero rail and the perks band.
const BENEFITS = [
  {
    icon: Tag,
    title: 'Exclusive pricing',
    body: `A standing ${MEMBER_DISCOUNT_PCT}% member price on every license — applied automatically at checkout while you're signed in.`,
  },
  {
    icon: Gauge,
    title: 'License dashboard',
    body: 'One private dashboard for every license you own — purchase dates, expiries and renewals, all in one place.',
  },
  {
    icon: Rocket,
    title: 'Insider launches',
    body: 'First access to new releases and members-only drops before they go public. Be first, every time.',
  },
  {
    icon: Bell,
    title: 'Renewal reminders',
    body: 'Automatic, well-timed reminders so a license never lapses — and you never lose your member discount.',
  },
] as const;

export default function ExclusiveMembers() {
  const navigate = useNavigate();
  const { account, isMember } = useAccount();

  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [insider, setInsider] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    // Trigger the staggered entrance on next frame.
    const id = window.requestAnimationFrame(() => setMounted(true));
    track({ event: 'exclusive_members_view', eventType: 'page' });
    return () => window.cancelAnimationFrame(id);
  }, []);

  const finish = useCallback(
    (verified: boolean) => {
      const acct = signIn(email, { displayName: name.trim() || undefined, verified });
      setInsiderOptIn(insider, acct.email);
      track({
        event: 'exclusive_member_signed_in',
        eventType: 'custom',
        metadata: { verified, insider },
      });
      navigate('/account');
    },
    [email, name, insider, navigate],
  );

  const onQuickSignIn = useCallback(() => {
    setError('');
    if (!isValidEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    finish(false);
  }, [email, finish]);

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
      // Mail bridge down → transparent fallback to quick sign-in (never blocks).
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
      track({
        event: 'exclusive_member_signed_in',
        eventType: 'custom',
        metadata: { verified: true, insider },
      });
      navigate('/account');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code was not accepted.');
    }
  }, [email, code, insider, navigate]);

  // Reveal helper: element index → staggered opacity/transform for the entrance.
  const reveal = useMemo(
    () => (i: number): React.CSSProperties => ({
      opacity: mounted ? 1 : 0,
      transform: mounted ? 'none' : 'translateY(16px)',
      transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${i * 90}ms, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${i * 90}ms`,
    }),
    [mounted],
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-surface-dark text-[#FEFEFE]">
      {/* Scoped luxe motion — aurora drift, orb float, badge shimmer, ring pulse. */}
      <style>{exclusiveCss}</style>

      {/* Ambient background: aurora gradient + drifting crimson/gold orbs. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="excl-aurora absolute inset-0" />
        <div className="excl-orb excl-orb--crimson" />
        <div className="excl-orb excl-orb--gold" />
        <div className="excl-orb excl-orb--azure" />
        <div className="excl-grid absolute inset-0" />
      </div>
      <GrainOverlay />

      <div className="relative z-10">
        <Header />

        <main className="mx-auto max-w-[1500px] px-6 pb-28 pt-32 md:pt-40">
          {isMember ? (
            <SignedInPanel
              name={account?.displayName}
              email={account?.email}
              verified={account?.verified}
              reveal={reveal}
              onDashboard={() => navigate('/account')}
              onStore={() => navigate('/store')}
            />
          ) : (
            <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
              {/* ── Left: exclusive hero + benefit rail ── */}
              <section>
                <div style={reveal(0)} className="excl-badge mb-7 inline-flex items-center gap-2 rounded-full border border-crimson/30 bg-crimson/10 px-4 py-1.5">
                  <Crown className="h-3.5 w-3.5 text-crimson" aria-hidden />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-crimson">
                    Members Only · By Invitation of Purchase
                  </span>
                </div>

                <h1 style={reveal(1)} className="font-serif text-[clamp(2.6rem,6vw,4.6rem)] font-semibold leading-[1.02] tracking-[-0.02em]">
                  DSM{' '}
                  <span className="excl-shine bg-gradient-to-r from-crimson via-[#f0a3a0] to-crimson bg-clip-text text-transparent">
                    Exclusive
                  </span>{' '}
                  Members
                </h1>

                <p style={reveal(2)} className="mt-5 max-w-xl text-lg leading-relaxed text-[#B1B2B3]">
                  A private tier for people who run their business on genuine software.
                  Sign in to your members area for standing exclusive pricing, your full
                  license dashboard, insider launches and automatic renewal reminders.
                </p>

                {/* Benefit rail — the four exclusive perks. */}
                <ul className="mt-10 grid gap-4 sm:grid-cols-2">
                  {BENEFITS.map((b, i) => (
                    <li
                      key={b.title}
                      style={reveal(3 + i)}
                      className="group rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 backdrop-blur-sm transition-colors duration-300 hover:border-crimson/25 hover:bg-crimson/[0.04]"
                    >
                      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-crimson/20 bg-crimson/10 text-crimson transition-transform duration-300 group-hover:scale-110">
                        <b.icon className="h-5 w-5" aria-hidden />
                      </div>
                      <h3 className="text-[15px] font-semibold text-[#FEFEFE]">{b.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-[#B1B2B3]">{b.body}</p>
                    </li>
                  ))}
                </ul>

                {/* Trust line */}
                <div style={reveal(7)} className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[#B1B2B3]/70">
                  <span className="inline-flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-crimson/70" /> Passwordless & private
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-crimson/70" /> Free forever
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-crimson/70" /> We never share your email
                  </span>
                </div>
              </section>

              {/* ── Right: the sign-in card (the primary job) ── */}
              <section style={reveal(3)} className="lg:pl-6">
                <div className="excl-card-ring relative rounded-3xl">
                  <div className="relative rounded-3xl border border-white/10 bg-[#0b0c0e]/80 p-7 shadow-2xl backdrop-blur-xl sm:p-9">
                    <div className="mb-6 flex items-center gap-3">
                      <div className="excl-crest flex h-11 w-11 items-center justify-center rounded-2xl border border-crimson/30 bg-crimson/15 text-crimson">
                        <Crown className="h-5 w-5" aria-hidden />
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-crimson">
                          Member Sign-In
                        </p>
                        <h2 className="font-serif text-xl leading-tight text-[#FEFEFE]">
                          {step === 'email' ? 'Enter your members area' : 'Check your inbox'}
                        </h2>
                      </div>
                    </div>

                    {step === 'email' ? (
                      <div className="space-y-4">
                        <p className="text-sm text-[#B1B2B3]">
                          One email is all it takes — no password. Your licenses are already
                          waiting under the address you bought with.
                        </p>

                        <div className="space-y-3 pt-1">
                          <div>
                            <Label htmlFor="excl-name" className="text-xs text-[#B1B2B3]">
                              Name (optional)
                            </Label>
                            <Input
                              id="excl-name"
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                              placeholder="Your name"
                              autoComplete="name"
                              className="mt-1.5 h-11 border-white/10 bg-white/[0.03] text-[#FEFEFE] placeholder:text-[#B1B2B3]/50 focus-visible:ring-crimson/40"
                            />
                          </div>
                          <div>
                            <Label htmlFor="excl-email" className="text-xs text-[#B1B2B3]">
                              Email
                            </Label>
                            <Input
                              id="excl-email"
                              type="email"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && onQuickSignIn()}
                              placeholder="you@company.com"
                              autoComplete="email"
                              className="mt-1.5 h-11 border-white/10 bg-white/[0.03] text-[#FEFEFE] placeholder:text-[#B1B2B3]/50 focus-visible:ring-crimson/40"
                            />
                          </div>

                          <label className="flex cursor-pointer items-start gap-2.5 pt-0.5">
                            <Checkbox
                              checked={insider}
                              onCheckedChange={(v) => setInsider(v === true)}
                              className="mt-0.5 border-white/20 data-[state=checked]:border-crimson data-[state=checked]:bg-crimson"
                            />
                            <span className="text-xs leading-relaxed text-[#B1B2B3]">
                              Email me insider launch alerts and renewal reminders. Unsubscribe anytime.
                            </span>
                          </label>
                        </div>

                        {error && <p className="text-sm text-crimson">{error}</p>}
                        {notice && <p className="text-sm text-[#B1B2B3]">{notice}</p>}

                        <div className="flex flex-col gap-2 pt-1">
                          <Button
                            onClick={onQuickSignIn}
                            disabled={busy}
                            size="lg"
                            className="excl-cta group h-12 w-full bg-crimson text-[#FEFEFE] hover:bg-crimson-dark"
                          >
                            Enter members area
                            <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={onRequestCode}
                            disabled={busy}
                            className="h-11 w-full text-[#B1B2B3] hover:bg-white/[0.04] hover:text-[#FEFEFE]"
                          >
                            {busy ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending code…
                              </>
                            ) : (
                              <>
                                <Mail className="mr-2 h-4 w-4" /> Verify by email instead
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {notice && <p className="text-sm text-[#B1B2B3]">{notice}</p>}
                        <div>
                          <Label htmlFor="excl-code" className="text-xs text-[#B1B2B3]">
                            6-digit code
                          </Label>
                          <Input
                            id="excl-code"
                            inputMode="numeric"
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            onKeyDown={(e) => e.key === 'Enter' && onVerify()}
                            placeholder="000000"
                            autoFocus
                            className="mt-1.5 h-12 border-white/10 bg-white/[0.03] text-center text-lg tracking-[0.5em] text-[#FEFEFE] focus-visible:ring-crimson/40"
                          />
                        </div>
                        {error && <p className="text-sm text-crimson">{error}</p>}
                        <Button
                          onClick={onVerify}
                          disabled={code.length !== 6}
                          size="lg"
                          className="h-12 w-full bg-crimson text-[#FEFEFE] hover:bg-crimson-dark"
                        >
                          <Check className="mr-1.5 h-4 w-4" /> Verify & enter
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setStep('email');
                            setNotice('');
                            setError('');
                          }}
                          className="w-full text-[#B1B2B3] hover:bg-white/[0.04] hover:text-[#FEFEFE]"
                        >
                          Use a different email
                        </Button>
                      </div>
                    )}

                    <p className="mt-6 text-center text-[11px] text-[#B1B2B3]/60">
                      Signing in creates your free membership if you don't have one yet.
                    </p>
                  </div>
                </div>

                {/* Become-a-member CTA for non-members. */}
                <div className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-crimson/15 bg-gradient-to-r from-crimson/[0.08] to-transparent p-4">
                  <p className="text-sm text-[#B1B2B3]">
                    <span className="font-semibold text-[#FEFEFE]">Not a member yet?</span>{' '}
                    Buy any license and you're in — automatically.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate('/store')}
                    className="shrink-0 border-crimson/30 bg-transparent text-crimson hover:bg-crimson hover:text-[#FEFEFE]"
                  >
                    Become one
                  </Button>
                </div>
              </section>
            </div>
          )}
        </main>

        <Footer />
      </div>
    </div>
  );
}

// ── Signed-in welcome ─────────────────────────────────────────────────────────

function SignedInPanel({
  name,
  email,
  verified,
  reveal,
  onDashboard,
  onStore,
}: {
  name?: string;
  email?: string;
  verified?: boolean;
  reveal: (i: number) => React.CSSProperties;
  onDashboard: () => void;
  onStore: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl py-10 text-center">
      <div style={reveal(0)} className="excl-crest mx-auto mb-7 flex h-16 w-16 items-center justify-center rounded-3xl border border-crimson/30 bg-crimson/15 text-crimson">
        <Crown className="h-8 w-8" aria-hidden />
      </div>
      <div style={reveal(1)} className="excl-badge mb-5 inline-flex items-center gap-2 rounded-full border border-crimson/30 bg-crimson/10 px-4 py-1.5">
        <BadgeCheck className="h-3.5 w-3.5 text-crimson" aria-hidden />
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-crimson">
          Exclusive Member · {MEMBER_DISCOUNT_PCT}% off
        </span>
      </div>
      <h1 style={reveal(2)} className="font-serif text-[clamp(2.2rem,5vw,3.4rem)] font-semibold leading-tight tracking-[-0.02em]">
        Welcome back{name ? `, ${name}` : ''}
      </h1>
      <p style={reveal(3)} className="mx-auto mt-4 max-w-md text-[#B1B2B3]">
        You're signed in as <span className="text-[#FEFEFE]">{email}</span>
        {verified ? (
          <span className="ml-2 inline-flex items-center gap-1 text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5" /> verified
          </span>
        ) : null}
        . Your exclusive pricing, license dashboard and insider access are all live.
      </p>
      <div style={reveal(4)} className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button
          onClick={onDashboard}
          size="lg"
          className="excl-cta h-12 bg-crimson px-7 text-[#FEFEFE] hover:bg-crimson-dark"
        >
          <Gauge className="mr-2 h-4 w-4" /> Open my dashboard
        </Button>
        <Button
          onClick={onStore}
          size="lg"
          variant="outline"
          className="h-12 border-white/15 bg-transparent px-7 text-[#FEFEFE] hover:bg-white/[0.05]"
        >
          <Tag className="mr-2 h-4 w-4" /> Shop with member pricing
        </Button>
      </div>

      {/* Members-only AI ordering concierge — the animated orb + activation. */}
      <div style={reveal(5)} className="mx-auto mt-12 max-w-2xl text-left">
        <MemberOrderingAvatar variant="hero" showGuestTeaser={false} />
      </div>

      {/* Perks reminder */}
      <ul className="mx-auto mt-8 grid max-w-xl gap-3 text-left sm:grid-cols-2">
        {BENEFITS.map((b, i) => (
          <li
            key={b.title}
            style={reveal(5 + i)}
            className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-crimson/12 text-crimson">
              <b.icon className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-[#FEFEFE]">{b.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-[#B1B2B3]">{b.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Scoped motion / ambience ────────────────────────────────────────────────
// Kept inline so the page is self-contained and the effects don't leak into the
// global stylesheet. All animations respect prefers-reduced-motion.

const exclusiveCss = `
.excl-aurora {
  background:
    radial-gradient(60% 50% at 18% 12%, hsl(var(--crimson) / 0.18), transparent 70%),
    radial-gradient(50% 45% at 88% 78%, hsl(var(--gold) / 0.10), transparent 70%),
    radial-gradient(45% 40% at 60% 30%, hsl(var(--azure) / 0.08), transparent 70%);
  background-size: 200% 200%;
  animation: exclAurora 22s ease-in-out infinite;
}
.excl-grid {
  background-image:
    linear-gradient(hsl(var(--foreground) / 0.035) 1px, transparent 1px),
    linear-gradient(90deg, hsl(var(--foreground) / 0.035) 1px, transparent 1px);
  background-size: 64px 64px;
  mask-image: radial-gradient(circle at 50% 30%, black, transparent 78%);
  -webkit-mask-image: radial-gradient(circle at 50% 30%, black, transparent 78%);
}
.excl-orb {
  position: absolute;
  border-radius: 9999px;
  filter: blur(90px);
  opacity: 0.5;
  will-change: transform;
}
.excl-orb--crimson {
  width: 520px; height: 520px;
  top: -160px; left: -120px;
  background: radial-gradient(circle, hsl(var(--crimson) / 0.55), transparent 65%);
  animation: exclFloatA 18s ease-in-out infinite;
}
.excl-orb--gold {
  width: 420px; height: 420px;
  bottom: -140px; right: -80px;
  background: radial-gradient(circle, hsl(var(--gold) / 0.28), transparent 65%);
  animation: exclFloatB 24s ease-in-out infinite;
}
.excl-orb--azure {
  width: 360px; height: 360px;
  top: 40%; right: 22%;
  background: radial-gradient(circle, hsl(var(--azure) / 0.22), transparent 65%);
  animation: exclFloatA 30s ease-in-out infinite reverse;
}
.excl-badge { position: relative; overflow: hidden; }
.excl-badge::after {
  content: "";
  position: absolute; inset: 0;
  background: linear-gradient(115deg, transparent 30%, hsl(var(--foreground) / 0.28) 50%, transparent 70%);
  transform: translateX(-120%);
  animation: exclShimmer 5.5s ease-in-out infinite;
}
.excl-shine {
  background-size: 200% auto;
  animation: exclTextShine 6s linear infinite;
}
.excl-card-ring::before {
  content: "";
  position: absolute; inset: -1px;
  border-radius: 24px;
  padding: 1px;
  background: linear-gradient(140deg, hsl(var(--crimson) / 0.5), transparent 40%, transparent 60%, hsl(var(--crimson) / 0.25));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  animation: exclRing 8s ease-in-out infinite;
  pointer-events: none;
}
.excl-crest { box-shadow: 0 0 24px hsl(var(--crimson) / 0.35); }
.excl-cta { box-shadow: 0 8px 30px hsl(var(--crimson) / 0.28); }

@keyframes exclAurora {
  0%, 100% { background-position: 0% 0%; }
  50% { background-position: 100% 100%; }
}
@keyframes exclFloatA {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(40px, 30px) scale(1.08); }
}
@keyframes exclFloatB {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(-36px, -28px) scale(1.1); }
}
@keyframes exclShimmer {
  0%, 100% { transform: translateX(-120%); }
  55%, 70% { transform: translateX(120%); }
}
@keyframes exclTextShine {
  to { background-position: 200% center; }
}
@keyframes exclRing {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .excl-aurora, .excl-orb, .excl-badge::after, .excl-shine, .excl-card-ring::before {
    animation: none !important;
  }
}
`;
