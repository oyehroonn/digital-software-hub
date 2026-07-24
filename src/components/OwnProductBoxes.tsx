import { useEffect, useMemo, useRef, useState } from "react";
import { OWN_PRODUCTS, type OwnProduct } from "@/data/ownProducts";
import ProductModelViewer from "@/components/ProductModelViewer";

/**
 * OwnProductBoxes — features our own products as interactive thin 3D cartons,
 * in the fixed priority order defined in src/data/ownProducts.ts.
 *
 * Interaction model (per the "animated 3D showcase" brief):
 *  - The same GLB template used by standard catalogue products renders every
 *    DSM-owned product; supplied creative packaging is reserved for products
 *    that have approved creative artwork.
 *  - Hover interaction comes from ProductModelViewer; click opens the product.
 *
 * Two layouts:
 *  - variant="grid"    → static responsive grid (AI Lab showcase).
 *  - variant="marquee" → horizontally drifting row (home end-of-page scroll),
 *                        revealed on scroll and paused on hover.
 *
 * Performance / resilience notes:
 *  - The models are local static assets (`/models/90001.glb` through
 *    `/models/90013.glb`) and fall back gracefully if a single model fails.
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
function OwnBox({ product }: { product: OwnProduct }) {
  const external = isExternal(product.url);

  return (
    <a
      href={product.url}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="own-box-card group"
      aria-label={`${product.name} — ${product.tagline}`}
    >
      <div className="relative aspect-[3/4] w-[132px] overflow-hidden rounded-md border border-white/[0.08] bg-[#0b0c0f] shadow-[0_18px_34px_rgba(0,0,0,0.35)] transition duration-300 group-hover:-translate-y-1 group-hover:border-crimson/50">
        <ProductModelViewer
          glbSrc={`/models/${product.modelId}.glb`}
          className="bg-transparent"
          fallbackIcon={<span className="text-2xl font-bold text-white/30">{product.wordmark}</span>}
        />
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
