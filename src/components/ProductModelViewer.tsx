import { useRef, useState, useEffect, useCallback } from "react";
// NOTE: @google/model-viewer (~large WebGL custom element) is imported
// dynamically once a card scrolls into view — see the IntersectionObserver
// effect below — so it downloads as its own chunk and never bloats the initial
// bundle. The <model-viewer> element only renders after the module registers.

interface ProductModelViewerProps {
  glbSrc: string;
  fallbackIcon: React.ReactNode;
  className?: string;
}

const IDLE_SPEED = 50;
const FRONT_ORBIT = "30deg 75deg 105%";
const EASE_DURATION = 500;
const DECEL_DURATION = 700;
// H7: if a GLB never resolves (missing box / live API down), fall back to the
// static icon instead of spinning forever. Keeps 3D boxes resilient offline.
const LOAD_TIMEOUT = 8000;

function easeInCubic(t: number) {
  return t * t * t;
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

const ProductModelViewer = ({
  glbSrc,
  fallbackIcon,
  className = "",
}: ProductModelViewerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [mvReady, setMvReady] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const animFrameRef = useRef<number>(0);
  const snapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMobile = useRef(false);

  useEffect(() => {
    isMobile.current = window.matchMedia("(hover: none)").matches;
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Lazily register the <model-viewer> custom element the first time a card is
  // near the viewport. Keeps model-viewer out of the initial JS payload.
  useEffect(() => {
    if (!isVisible || mvReady) return;
    let cancelled = false;
    import("@google/model-viewer")
      .then(() => {
        if (!cancelled) setMvReady(true);
      })
      .catch(() => {
        // model-viewer failed to load — degrade to the static fallback icon.
        if (!cancelled) setHasError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isVisible, mvReady]);

  const animateSpeed = useCallback(
    (from: number, to: number, duration: number, easeFn: (t: number) => number) => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

      const mv = modelRef.current;
      if (!mv) return;

      const start = performance.now();

      const tick = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = easeFn(progress);
        const current = from + (to - from) * eased;

        mv.setAttribute("rotation-per-second", `${current}deg`);

        if (progress < 1) {
          animFrameRef.current = requestAnimationFrame(tick);
        }
      };

      animFrameRef.current = requestAnimationFrame(tick);
    },
    []
  );

  const handleMouseEnter = useCallback(() => {
    if (isMobile.current) return;
    const mv = modelRef.current;
    if (!mv) return;

    if (snapTimeoutRef.current) {
      clearTimeout(snapTimeoutRef.current);
      snapTimeoutRef.current = null;
    }

    const currentStr = mv.getAttribute("rotation-per-second") || `${IDLE_SPEED}deg`;
    const currentVal = parseFloat(currentStr);

    animateSpeed(currentVal, 0, DECEL_DURATION, easeOutCubic);

    snapTimeoutRef.current = setTimeout(() => {
      mv.removeAttribute("auto-rotate");
      mv.setAttribute("camera-orbit", FRONT_ORBIT);
      mv.setAttribute("camera-controls", "");
      snapTimeoutRef.current = null;
    }, DECEL_DURATION);
  }, [animateSpeed]);

  const handleMouseLeave = useCallback(() => {
    if (isMobile.current) return;
    const mv = modelRef.current;
    if (!mv) return;

    if (snapTimeoutRef.current) {
      clearTimeout(snapTimeoutRef.current);
      snapTimeoutRef.current = null;
    }

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }

    mv.removeAttribute("camera-controls");
    mv.setAttribute("camera-orbit", FRONT_ORBIT);
    mv.setAttribute("auto-rotate", "");
    mv.setAttribute("rotation-per-second", `${IDLE_SPEED}deg`);
  }, []);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
    const mv = modelRef.current;
    if (mv) {
      mv.setAttribute("auto-rotate", "");
      mv.setAttribute(
        "rotation-per-second",
        isMobile.current ? "20deg" : `${IDLE_SPEED}deg`
      );
    }
  }, []);

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  // H7: guard against a GLB that never fires load/error (404s on model-viewer
  // don't always emit an error event). Once in view, if it hasn't loaded by
  // LOAD_TIMEOUT, degrade gracefully to the fallback icon.
  useEffect(() => {
    if (!isVisible || isLoaded || hasError) return;
    const t = setTimeout(() => setHasError(true), LOAD_TIMEOUT);
    return () => clearTimeout(t);
  }, [isVisible, isLoaded, hasError]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (snapTimeoutRef.current) clearTimeout(snapTimeoutRef.current);
    };
  }, []);

  if (hasError) {
    return (
      <div className={`w-full h-full flex items-center justify-center p-8 bg-secondary ${className}`}>
        <div className="product-3d-card">
          {fallbackIcon}
          <div className="product-shine" />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`model-viewer-container w-full h-full bg-secondary group-hover:bg-card transition-colors duration-500 ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {isVisible && mvReady ? (
        <>
          {!isLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-secondary z-10">
              <div className="w-8 h-8 border-2 border-border border-t-crimson rounded-full animate-spin" />
            </div>
          )}
          <model-viewer
            ref={(el: HTMLElement | null) => {
              modelRef.current = el;
              if (el) {
                el.addEventListener("load", handleLoad);
                el.addEventListener("error", handleError);
              }
            }}
            src={glbSrc}
            alt="3D product preview"
            camera-orbit="30deg 75deg 105%"
            min-camera-orbit="auto auto auto"
            max-camera-orbit="auto auto auto"
            field-of-view="30deg"
            min-field-of-view="30deg"
            max-field-of-view="30deg"
            interaction-prompt="none"
            shadow-intensity="0.35"
            shadow-softness="1"
            exposure="1.1"
            auto-rotate
            auto-rotate-delay="0"
            rotation-per-second={`${IDLE_SPEED}deg`}
            touch-action="pan-y"
            style={{
              // Let clicks pass through to the product card (which opens the detail
              // modal). model-viewer's camera-controls would otherwise swallow the
              // tap. The box still auto-rotates for visual interest.
              pointerEvents: "none",
              width: "100%",
              height: "100%",
              outline: "none",
              border: "none",
              ["--poster-color" as string]: "transparent",
              ["--progress-bar-color" as string]: "transparent",
              opacity: isLoaded ? 1 : 0,
              transition: "opacity 0.5s ease",
            }}
          />
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center p-8">
          {fallbackIcon}
        </div>
      )}
    </div>
  );
};

export default ProductModelViewer;
