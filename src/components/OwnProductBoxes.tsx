import { useEffect, useMemo, useRef, useState } from "react";
import { OWN_PRODUCTS, type OwnProduct } from "@/data/ownProducts";

/**
 * OwnProductBoxes — features our own products as DSM-style 3D boxes, in the
 * fixed priority order defined in src/data/ownProducts.ts.
 *
 * Two layouts:
 *  - variant="grid"    → static responsive grid (AI Lab showcase).
 *  - variant="marquee" → horizontally drifting row (home end-of-page scroll
 *                        animation), revealed on scroll and paused on hover.
 *
 * Performance / resilience notes:
 *  - Pure CSS 3D (no WebGL, no model-viewer, no network) so it renders even
 *    when the VPS / LLM backends are down and stays smooth on mobile.
 *  - The drifting marquee only animates once the section scrolls into view
 *    (IntersectionObserver) and honours prefers-reduced-motion via CSS.
 *  - On coarse-pointer / small screens the box count and depth are trimmed by
 *    CSS to keep paint cheap.
 */

interface OwnProductBoxesProps {
  variant?: "grid" | "marquee";
  className?: string;
}

function isExternal(url: string) {
  return /^https?:\/\//i.test(url);
}

function OwnBox({ product }: { product: OwnProduct }) {
  const external = isExternal(product.url);
  return (
    <a
      href={product.url}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="own-box-card group"
      aria-label={`${product.name} — ${product.tagline}`}
      style={
        {
          ["--accent" as string]: product.accent,
          ["--accent-to" as string]: product.accentTo,
        } as React.CSSProperties
      }
    >
      <div className="own-box-scene">
        <div className="own-box">
          <div className="own-box-face own-box-front">
            <span className="own-box-wordmark">{product.wordmark}</span>
            <span className="own-box-front-name">{product.name}</span>
            <span className="own-box-shine" aria-hidden="true" />
          </div>
          <div className="own-box-face own-box-top" aria-hidden="true" />
          <div className="own-box-face own-box-side" aria-hidden="true" />
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

  // Only "arm" the drift/reveal once the row scrolls into view (marquee) or on
  // mount (grid relies on per-card CSS reveal, but we still gate the drift).
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

  if (variant === "marquee") {
    return (
      <div
        ref={sectionRef}
        className={`own-box-marquee ${active ? "is-active" : ""} ${className}`}
      >
        <div className="own-box-marquee-track" aria-hidden={!active}>
          {marqueeItems.map((product, i) => (
            <OwnBox key={`${product.id}-${i}`} product={product} />
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
          <OwnBox product={product} />
        </div>
      ))}
    </div>
  );
}
