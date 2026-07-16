/**
 * MemberOrderingAvatar — the members-only "AI ordering concierge" surface
 * =======================================================================
 * A beautiful animated crimson SPHERE / orb (the AI concierge) with an
 * "Activate Ordering Avatar" button. This is the single, drop-in, MEMBER-GATED
 * entry point to the Ordering Avatar experience, used on both the Exclusive
 * Members page and the Cart page.
 *
 * MEMBER GATING (the whole point):
 *   • Gate source of truth: `useAccount()` → `isMember` (true when a signed-in
 *     member session exists in `lib/account.ts`). The hook re-renders on sign
 *     in / out and across tabs, so the surface flips instantly.
 *   • MEMBERS see the live orb + "Activate Ordering Avatar". Clicking it opens a
 *     premium modal that mounts <OrderingAvatar/> — the Simli talking concierge
 *     that finds + orders products (degrading to text chat per the resilience
 *     contract). The heavy avatar code is lazy-loaded, so non-members never even
 *     download it.
 *   • NON-MEMBERS see a subtle, tasteful teaser ("Members get an AI ordering
 *     concierge — sign in") that links to /exclusive. No avatar, no LLM, no
 *     Simli — nothing gated is reachable without a session.
 *
 * Two layout variants: `hero` (a showcase panel for the Exclusive Members page)
 * and `cart` (a compact aside for the Cart page). Both share the same orb, the
 * same gate, and the same modal.
 */

import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2, Lock, Mic, Sparkles, X } from 'lucide-react';

import { useAccount } from '@/hooks/useAccount';
import { track, trackClick } from '@/lib/stable/analytics';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Lazy-load the avatar (and its Simli/WebRTC + LLM deps) so it only ever ships
// to a member who actually activates it.
const OrderingAvatar = lazy(() => import('@/components/ai/OrderingAvatar'));

export interface MemberOrderingAvatarProps {
  /** `hero` = showcase panel (Exclusive Members); `cart` = compact aside (Cart). */
  variant?: 'hero' | 'cart';
  /** Show the sign-in teaser to guests. Off when the host already gates members. */
  showGuestTeaser?: boolean;
  className?: string;
}

// ── The animated concierge orb ────────────────────────────────────────────────

function ConciergeOrb({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  return (
    <div
      className={cn('moa-orb-wrap relative shrink-0', size === 'lg' ? 'h-36 w-36' : 'h-24 w-24')}
      aria-hidden
    >
      <span className="moa-orb-glow absolute inset-0 rounded-full" />
      <span className="moa-orb-ring absolute inset-0 rounded-full" />
      <span className="moa-orb absolute inset-[10%] rounded-full">
        <span className="moa-orb-core absolute inset-0 rounded-full" />
        <span className="moa-orb-sheen absolute inset-0 rounded-full" />
      </span>
      <span className="moa-orb-spark absolute inset-0 rounded-full" />
    </div>
  );
}

// ── The activation modal (member-only) ────────────────────────────────────────

function AvatarModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="DSM Ordering Concierge"
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-[#0b0c0e]/95 p-5 shadow-2xl sm:p-8">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-crimson/30 bg-crimson/15 text-crimson">
            <Sparkles className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-crimson">
              Members-only
            </p>
            <h2 className="font-serif text-xl leading-tight text-[#FEFEFE]">Ordering Concierge</h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-[#B1B2B3] transition-colors hover:bg-white/[0.06] hover:text-[#FEFEFE]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <Suspense
          fallback={
            <div className="flex h-64 items-center justify-center text-[#B1B2B3]">
              <Loader2 className="h-6 w-6 animate-spin text-crimson" aria-hidden />
            </div>
          }
        >
          <OrderingAvatar />
        </Suspense>
      </div>
    </div>
  );
}

// ── Guest teaser (no gated code reachable) ────────────────────────────────────

function GuestTeaser({ variant, className }: { variant: 'hero' | 'cart'; className?: string }) {
  const navigate = useNavigate();
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-5',
        variant === 'hero' ? 'sm:p-7' : '',
        className,
      )}
    >
      <style>{orbCss}</style>
      <div className={cn('flex items-center gap-4', variant === 'hero' && 'sm:gap-6')}>
        <div className="relative">
          <ConciergeOrb size="sm" />
          <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-[#0b0c0e] text-[#B1B2B3]">
            <Lock className="h-3.5 w-3.5" aria-hidden />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-crimson">
            Members-only
          </p>
          <p className="mt-1 text-sm text-[#B1B2B3]">
            <span className="font-semibold text-[#FEFEFE]">Members get an AI ordering concierge</span>{' '}
            — a talking avatar that finds your genuine licenses at member price and adds them to
            your cart. Sign in to unlock it.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              trackClick('ordering_avatar_guest_signin', {
                elementId: 'ordering-avatar-guest',
                metadata: { feature: 'ordering-avatar', variant },
              });
              navigate('/exclusive');
            }}
            className="mt-3 border-crimson/30 bg-transparent text-crimson hover:bg-crimson hover:text-[#FEFEFE]"
          >
            Sign in to activate
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Public component ─────────────────────────────────────────────────────────

export default function MemberOrderingAvatar({
  variant = 'hero',
  showGuestTeaser = true,
  className,
}: MemberOrderingAvatarProps) {
  const { isMember } = useAccount();
  const [open, setOpen] = useState(false);

  const activate = useCallback(() => {
    setOpen(true);
    track({
      event: 'ordering_avatar_activate',
      eventType: 'ai',
      metadata: { feature: 'ordering-avatar', variant },
    });
  }, [variant]);

  // Non-members: nothing gated is reachable — only a tasteful teaser (or nothing).
  if (!isMember) {
    return showGuestTeaser ? <GuestTeaser variant={variant} className={className} /> : null;
  }

  return (
    <>
      <style>{orbCss}</style>
      <div
        className={cn(
          'moa-panel relative overflow-hidden rounded-2xl border border-crimson/20 bg-gradient-to-br from-crimson/[0.10] via-white/[0.02] to-transparent',
          variant === 'hero' ? 'p-6 sm:p-8' : 'p-5',
          className,
        )}
      >
        <div
          className={cn(
            'flex items-center gap-5',
            variant === 'hero' ? 'flex-col text-center sm:flex-row sm:text-left sm:gap-7' : 'gap-4',
          )}
        >
          <ConciergeOrb size={variant === 'hero' ? 'lg' : 'sm'} />

          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-crimson/30 bg-crimson/10 px-3 py-1">
              <Sparkles className="h-3 w-3 text-crimson" aria-hidden />
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-crimson">
                AI Ordering Concierge
              </span>
            </div>
            <h3
              className={cn(
                'mt-3 font-serif font-semibold leading-tight text-[#FEFEFE]',
                variant === 'hero' ? 'text-2xl sm:text-3xl' : 'text-xl',
              )}
            >
              Order at the speed of thought
            </h3>
            <p className={cn('mt-2 text-sm leading-relaxed text-[#B1B2B3]', variant === 'hero' ? 'max-w-lg' : '')}>
              Meet your personal concierge. Tell it what you need — by voice or text — and it finds
              the right genuine licenses at your member price and drops them straight into your cart.
            </p>

            <div
              className={cn(
                'mt-5 flex flex-wrap items-center gap-3',
                variant === 'hero' ? 'justify-center sm:justify-start' : '',
              )}
            >
              <Button
                onClick={activate}
                size={variant === 'hero' ? 'lg' : 'default'}
                className="moa-cta bg-crimson text-[#FEFEFE] hover:bg-crimson-dark"
              >
                <Mic className="h-4 w-4" aria-hidden />
                Activate Ordering Avatar
              </Button>
              <span className="text-[11px] text-[#B1B2B3]/60">
                Members-only · your member price already applied
              </span>
            </div>
          </div>
        </div>
      </div>

      {open && <AvatarModal onClose={() => setOpen(false)} />}
    </>
  );
}

// ── Scoped orb / panel motion (self-contained; respects reduced-motion) ───────

const orbCss = `
.moa-orb-wrap { display: inline-block; }
.moa-orb-glow {
  background: radial-gradient(circle, hsl(var(--crimson) / 0.45), transparent 68%);
  filter: blur(14px);
  animation: moaGlow 4.5s ease-in-out infinite;
}
.moa-orb-ring {
  padding: 2px;
  background: conic-gradient(from 0deg, transparent, hsl(var(--crimson) / 0.9), #f0a3a0, hsl(var(--crimson) / 0.9), transparent 75%);
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px));
  mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px));
  animation: moaSpin 7s linear infinite;
  opacity: 0.85;
}
.moa-orb {
  overflow: hidden;
  box-shadow: 0 10px 40px hsl(var(--crimson) / 0.35), inset 0 -8px 22px rgba(0,0,0,0.55);
  animation: moaFloat 6s ease-in-out infinite;
}
.moa-orb-core {
  background: radial-gradient(circle at 34% 28%, #ffd9d6, #f0a3a0 18%, #cf4840 46%, #7d1f1b 74%, #2a0a09 100%);
}
.moa-orb-sheen {
  background:
    radial-gradient(40% 30% at 32% 24%, rgba(255,255,255,0.55), transparent 60%),
    conic-gradient(from 210deg at 50% 50%, transparent, rgba(255,255,255,0.10), transparent 40%);
  mix-blend-mode: screen;
  animation: moaSpin 9s linear infinite reverse;
}
.moa-orb-spark {
  background: radial-gradient(2px 2px at 70% 30%, rgba(255,255,255,0.9), transparent 60%),
              radial-gradient(1.5px 1.5px at 28% 68%, rgba(255,210,206,0.8), transparent 60%);
  animation: moaGlow 5.5s ease-in-out infinite;
}
.moa-cta { box-shadow: 0 8px 30px hsl(var(--crimson) / 0.30); }
.moa-panel::after {
  content: "";
  position: absolute; inset: 0;
  background: radial-gradient(60% 80% at 100% 0%, hsl(var(--crimson) / 0.10), transparent 60%);
  pointer-events: none;
}
@keyframes moaSpin { to { transform: rotate(360deg); } }
@keyframes moaFloat {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-6px) scale(1.02); }
}
@keyframes moaGlow {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .moa-orb-glow, .moa-orb-ring, .moa-orb, .moa-orb-sheen, .moa-orb-spark { animation: none !important; }
}
`;
