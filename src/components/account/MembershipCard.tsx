/**
 * MembershipCard — the "EXCLUSIVE MEMBER" 3D card for the account dashboard
 * -------------------------------------------------------------------------
 * A premium, tactile membership card that reuses the visual language of the
 * legacy press-and-hold "3D" checkout card (see src/pages/legacy/Checkout.card.tsx
 * and public/checkout/Payment2Iteration3d.html):
 *   - Live 3D tilt that follows the pointer (perspective + rotateX/rotateY).
 *   - The signature press-and-hold interaction, with a radial progress fill,
 *     that "activates" the card and flips it to reveal a holographic back.
 *
 * It is pure presentation over the STABLE account session — no network calls of
 * its own — so it can never break the page. All data is passed in by <Account>.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Fingerprint, ShieldCheck, Sparkles } from 'lucide-react';

export interface MembershipCardProps {
  /** Member display name (falls back to a tasteful default). */
  name?: string;
  /** Account email — used to derive a stable membership number. */
  email: string;
  /** ISO date the person became a member (earliest purchase / first sign-in). */
  memberSince?: string;
  /** True when the email was inbox-verified via the magic-code flow. */
  verified?: boolean;
}

const HOLD_DURATION_MS = 1100;

/** Deterministic 8-digit membership number derived from the email. */
function membershipNumber(email: string): string {
  let h = 0;
  const key = email.trim().toLowerCase();
  for (let i = 0; i < key.length; i += 1) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0;
  }
  const digits = (h % 100000000).toString().padStart(8, '0');
  return `${digits.slice(0, 4)} ${digits.slice(4)}`;
}

function fmtSince(iso?: string): string {
  if (!iso) return '2026';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '2026';
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }).toUpperCase();
}

export default function MembershipCard({
  name,
  email,
  memberSince,
  verified,
}: MembershipCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const holdRaf = useRef<number | null>(null);

  const [tilt, setTilt] = useState({ rx: 0, ry: 0, gx: 50, gy: 50 });
  const [hovering, setHovering] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [activated, setActivated] = useState(false);
  const [flipped, setFlipped] = useState(false);

  const memberName = (name?.trim() || 'Exclusive Member').toUpperCase();
  const number = membershipNumber(email);

  // ── 3D tilt following the pointer (same feel as the legacy card) ────────────
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width; // 0..1
    const py = (e.clientY - rect.top) / rect.height; // 0..1
    const ry = (px - 0.5) * 26; // rotateY
    const rx = (0.5 - py) * 20; // rotateX
    setTilt({ rx, ry, gx: px * 100, gy: py * 100 });
  }, []);

  const resetTilt = useCallback(() => {
    setHovering(false);
    setTilt({ rx: 0, ry: 0, gx: 50, gy: 50 });
  }, []);

  // ── Press-and-hold to activate + flip ───────────────────────────────────────
  const clearHold = useCallback(() => {
    if (holdRaf.current !== null) {
      cancelAnimationFrame(holdRaf.current);
      holdRaf.current = null;
    }
  }, []);

  const startHold = useCallback(() => {
    clearHold();
    const startedAt = performance.now();
    const step = (now: number) => {
      const pct = Math.min(100, ((now - startedAt) / HOLD_DURATION_MS) * 100);
      setHoldProgress(pct);
      if (pct >= 100) {
        clearHold();
        setActivated(true);
        setFlipped((f) => !f);
        window.setTimeout(() => setHoldProgress(0), 260);
        return;
      }
      holdRaf.current = requestAnimationFrame(step);
    };
    holdRaf.current = requestAnimationFrame(step);
  }, [clearHold]);

  const cancelHold = useCallback(() => {
    clearHold();
    setHoldProgress(0);
  }, [clearHold]);

  useEffect(() => () => clearHold(), [clearHold]);

  const holding = holdProgress > 0 && holdProgress < 100;

  return (
    <div className="select-none">
      <div
        className="group relative"
        style={{ perspective: '1400px' }}
        onPointerMove={onPointerMove}
        onPointerEnter={() => setHovering(true)}
        onPointerLeave={resetTilt}
      >
        {/* Ambient glow bed */}
        <div
          className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-crimson/20 opacity-40 blur-3xl transition-opacity duration-500 group-hover:opacity-70"
          aria-hidden
        />

        <div
          ref={cardRef}
          className="relative aspect-[1.586/1] w-full transition-transform duration-200 ease-out"
          style={{
            transformStyle: 'preserve-3d',
            transform: `rotateX(${tilt.rx}deg) rotateY(${flipped ? tilt.ry + 180 : tilt.ry}deg) scale(${
              hovering ? 1.02 : 1
            })`,
          }}
        >
          {/* ── FRONT ─────────────────────────────────────────────────────── */}
          <div
            className="absolute inset-0 overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              background:
                'linear-gradient(135deg, #17060a 0%, #0b0b0d 45%, #050505 100%)',
            }}
          >
            {/* Holographic sheen that tracks the pointer */}
            <div
              className="pointer-events-none absolute inset-0 opacity-60 mix-blend-screen transition-opacity duration-300"
              style={{
                background: `radial-gradient(600px circle at ${tilt.gx}% ${tilt.gy}%, hsl(var(--crimson) / 0.35), transparent 45%)`,
              }}
              aria-hidden
            />
            {/* Subtle guilloché grid */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.07]"
              style={{
                backgroundImage:
                  'linear-gradient(to right, rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.6) 1px, transparent 1px)',
                backgroundSize: '26px 26px',
                maskImage: 'radial-gradient(circle at center, black, transparent 78%)',
                WebkitMaskImage: 'radial-gradient(circle at center, black, transparent 78%)',
              }}
              aria-hidden
            />
            {/* Moving highlight sweep on hover */}
            <div
              className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-hover:animate-[shimmer_2.2s_ease-in-out_infinite]"
              aria-hidden
            />

            <div className="relative flex h-full flex-col justify-between p-5 sm:p-6">
              {/* Top row: brand + tier */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-crimson">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.22em]">
                      Exclusive Member
                    </span>
                  </div>
                  <div className="mt-1 font-serif text-lg font-semibold tracking-tight text-[#FEFEFE]">
                    Digital Software Market
                  </div>
                </div>
                <span className="rounded border border-gold/30 bg-gold/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-gold">
                  Priority
                </span>
              </div>

              {/* EMV chip */}
              <div className="flex items-center gap-3">
                <div
                  className="h-8 w-11 rounded-md border border-yellow-200/30 shadow-inner sm:h-9 sm:w-12"
                  style={{
                    background:
                      'linear-gradient(135deg, #d9c07a 0%, #a8863f 40%, #f0e2a6 60%, #8f6f2e 100%)',
                  }}
                  aria-hidden
                >
                  <div className="mx-auto mt-1 h-6 w-8 rounded-sm border border-black/20 sm:h-7 sm:w-9" style={{ background: 'repeating-linear-gradient(90deg, rgba(0,0,0,0.18) 0 2px, transparent 2px 5px)' }} />
                </div>
                <span className="font-mono text-[11px] tracking-[0.35em] text-[#B1B2B3]/70">
                  {number}
                </span>
              </div>

              {/* Bottom row: name + since */}
              <div className="flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[8px] font-semibold uppercase tracking-[0.2em] text-[#B1B2B3]/50">
                    Member
                  </div>
                  <div className="truncate font-mono text-sm font-medium uppercase tracking-wider text-[#FEFEFE] sm:text-base">
                    {memberName}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[8px] font-semibold uppercase tracking-[0.2em] text-[#B1B2B3]/50">
                    Member Since
                  </div>
                  <div className="font-mono text-sm font-medium tracking-wider text-[#FEFEFE]">
                    {fmtSince(memberSince)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── BACK ──────────────────────────────────────────────────────── */}
          <div
            className="absolute inset-0 overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              background:
                'linear-gradient(135deg, #0b0b0d 0%, #17060a 55%, #050505 100%)',
            }}
          >
            {/* Holographic foil */}
            <div
              className="pointer-events-none absolute inset-0 opacity-70 mix-blend-screen"
              style={{
                background: `linear-gradient(115deg, transparent 20%, hsl(var(--crimson) / 0.35) 40%, hsl(var(--gold) / 0.3) 50%, hsl(var(--azure) / 0.3) 60%, transparent 80%)`,
                backgroundSize: '200% 200%',
                backgroundPosition: `${tilt.gx}% ${tilt.gy}%`,
              }}
              aria-hidden
            />
            {/* Magnetic stripe */}
            <div className="absolute inset-x-0 top-6 h-11 bg-black/80" aria-hidden />

            <div className="relative flex h-full flex-col justify-between p-5 sm:p-6">
              <div className="mt-14 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#B1B2B3]/60">
                  Authorized signature
                </span>
                <div className="flex h-6 items-center rounded bg-white/85 px-3 font-mono text-[11px] italic tracking-wider text-black/80">
                  {memberName.slice(0, 18)}
                </div>
              </div>

              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="flex items-center gap-1.5 text-crimson">
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.2em]">
                      {verified ? 'Verified Member' : 'Exclusive Member'}
                    </span>
                  </div>
                  <p className="mt-1 max-w-[15rem] text-[10px] leading-relaxed text-[#B1B2B3]/60">
                    This card confirms exclusive standing, priority support and
                    member pricing across the DSM catalog.
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[10px] tracking-[0.3em] text-[#B1B2B3]/50">
                  No. {number}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Press-and-hold activator (the legacy card's signature interaction) */}
      <button
        type="button"
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
        className="relative mt-5 flex w-full items-center justify-center gap-2 overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#FEFEFE] transition-colors hover:border-crimson/40 hover:bg-crimson/[0.08]"
        aria-label={flipped ? 'Press and hold to view the front of your card' : 'Press and hold to reveal your card'}
      >
        <span
          className="absolute inset-0 bg-crimson/30 transition-[clip-path] duration-75"
          style={{ clipPath: `circle(${holdProgress}% at center)` }}
          aria-hidden
        />
        <span className="relative z-10 inline-flex items-center gap-2">
          <Fingerprint className="h-4 w-4" aria-hidden />
          {holding
            ? 'Keep holding…'
            : flipped
              ? 'Press & hold to flip back'
              : activated
                ? 'Press & hold to flip card'
                : 'Press & hold to activate card'}
        </span>
      </button>
    </div>
  );
}
