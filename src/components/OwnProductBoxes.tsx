import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OWN_PRODUCTS, type OwnProduct } from "@/data/ownProducts";

/**
 * OwnProductBoxes — features our own products as interactive 3D showcase boxes,
 * in the fixed priority order defined in src/data/ownProducts.ts.
 *
 * Interaction model (per the "animated 3D showcase" brief):
 *  - AUTO-ROTATE: each closed 6-face box slowly spins around its Y axis on its
 *    own (staggered so the row doesn't pulse in unison).
 *  - HOVER TO SPIN: pointer position over a box drives a live parallax spin —
 *    the auto-rotate freezes and the box turns to follow the cursor, lifting
 *    forward. Keyboard focus gets a clean brought-forward pose.
 *  - CLICK TO OPEN: the whole box is an anchor to that product.
 *
 * Two layouts:
 *  - variant="grid"    → static responsive grid (AI Lab showcase).
 *  - variant="marquee" → horizontally drifting row (home end-of-page scroll),
 *                        revealed on scroll and paused on hover.
 *
 * Performance / resilience notes:
 *  - Pure CSS 3D (no WebGL, no model-viewer, no network) so it renders even
 *    when the VPS / LLM backends are down.
 *  - The spin layer and the pointer tilt live on SEPARATE elements so the
 *    keyframe auto-rotate and the JS-set tilt transform compose instead of
 *    fighting; only the hovered card runs a rAF loop, and it's cancelled on
 *    leave, so idle cost is zero JS.
 *  - prefers-reduced-motion disables the auto-rotate, float, drift AND the
 *    pointer tilt (CSS + a JS guard), leaving a static, fully clickable box.
 *  - On coarse-pointer / small screens CSS trims the continuous spin so paint
 *    stays cheap on mobile; the boxes still float + drift.
 */

interface OwnProductBoxesProps {
  variant?: "grid" | "marquee";
  className?: string;
}

function isExternal(url: string) {
  return /^https?:\/\//i.test(url);
}

// Shared reduced-motion guard so we never wire up the rAF tilt loop for users
// who asked their OS to minimise motion.
function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function OwnBox({ product, spinDelay }: { product: OwnProduct; spinDelay: number }) {
  const external = isExternal(product.url);
  // The element that receives the live pointer-driven tilt (inner of the
  // spin layer, so the two transforms compose).
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef<{ x: number; y: number } | null>(null);

  const applyTilt = useCallback(() => {
    frameRef.current = null;
    const el = boxRef.current;
    const p = pendingRef.current;
    if (!el || !p) return;
    // px/py are -0.5..0.5 across the box; turn cursor position into a spin.
    el.style.setProperty("--tilt-y", `${p.x * 40}deg`);
    el.style.setProperty("--tilt-x", `${-p.y * 24}deg`);
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLAnchorElement>) => {
      if (e.pointerType === "touch" || prefersReducedMotion()) return;
      const rect = e.currentTarget.getBoundingClientRect();
      pendingRef.current = {
        x: (e.clientX - rect.left) / rect.width - 0.5,
        y: (e.clientY - rect.top) / rect.height - 0.5,
      };
      if (frameRef.current == null) {
        frameRef.current = requestAnimationFrame(applyTilt);
      }
    },
    [applyTilt]
  );

  const handlePointerLeave = useCallback(() => {
    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    pendingRef.current = null;
    const el = boxRef.current;
    if (el) {
      el.style.removeProperty("--tilt-y");
      el.style.removeProperty("--tilt-x");
    }
  }, []);

  useEffect(
    () => () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    },
    []
  );

  return (
    <a
      href={product.url}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="own-box-card group"
      aria-label={`${product.name} — ${product.tagline}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={
        {
          ["--accent" as string]: product.accent,
          ["--accent-to" as string]: product.accentTo,
        } as React.CSSProperties
      }
    >
      <div className="own-box-scene">
        {/* Spin layer: continuous auto-rotate (paused on hover/focus). */}
        <div
          className="own-box-spin"
          style={{ ["--spin-delay" as string]: `${spinDelay}s` }}
        >
          {/* Tilt layer: base pose + live pointer-driven parallax spin. */}
          <div className="own-box" ref={boxRef}>
            <div className="own-box-face own-box-front">
              <span className="own-box-wordmark">{product.wordmark}</span>
              <span className="own-box-front-name">{product.name}</span>
              <span className="own-box-shine" aria-hidden="true" />
            </div>
            <div className="own-box-face own-box-back" aria-hidden="true">
              <span className="own-box-back-mark">{product.wordmark}</span>
            </div>
            <div className="own-box-face own-box-right" aria-hidden="true">
              <span className="own-box-spine-text">{product.wordmark}</span>
            </div>
            <div className="own-box-face own-box-left" aria-hidden="true" />
            <div className="own-box-face own-box-top" aria-hidden="true" />
            <div className="own-box-face own-box-bottom" aria-hidden="true" />
          </div>
        </div>
      </div>
      <div className="own-box-label">
        <span className="own-box-name">{product.name}</span>
        <span className="own-box-tagline">{product.tagline}</span>
      </div>
    </a>
  );
}

export default function OwnProductBoxes({
  variant = "grid",
  className = "",
}: OwnProductBoxesProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  // Only "arm" the drift/reveal/spin once the row scrolls into view so the
  // animations don't burn cycles while off-screen.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setActive(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // For the marquee we duplicate the list so the translateX loop is seamless.
  const marqueeItems = useMemo(
    () => (variant === "marquee" ? [...OWN_PRODUCTS, ...OWN_PRODUCTS] : OWN_PRODUCTS),
    [variant]
  );

  // Stagger the per-box auto-rotate so the row never spins in lockstep.
  const spinDelay = (i: number) => -(i % 6) * 3.4;

  if (variant === "marquee") {
    return (
      <div
        ref={sectionRef}
        className={`own-box-marquee ${active ? "is-active" : ""} ${className}`}
      >
        <div className="own-box-marquee-track" aria-hidden={!active}>
          {marqueeItems.map((product, i) => (
            <OwnBox key={`${product.id}-${i}`} product={product} spinDelay={spinDelay(i)} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={sectionRef}
      className={`own-box-grid ${active ? "is-active" : ""} ${className}`}
    >
      {OWN_PRODUCTS.map((product, i) => (
        <div
          key={product.id}
          className="own-box-grid-item"
          style={{ ["--reveal-delay" as string]: `${Math.min(i, 8) * 70}ms` }}
        >
          <OwnBox product={product} spinDelay={spinDelay(i)} />
        </div>
      ))}
    </div>
  );
}
