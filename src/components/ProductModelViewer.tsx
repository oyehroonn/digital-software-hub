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

const IDLE_SPEED = 0;
const FRONT_ORBIT = "30deg 75deg 105%";
const SHOWROOM_CENTER = 30;
const SHOWROOM_SWEEP = 14;
const SHOWROOM_CYCLE = 4200;
const EASE_DURATION = 500;
const DECEL_DURATION = 700;
// H7: if a GLB never resolves (missing box / live API down), fall back to the
// static icon instead of spinning forever.  Start this only after the
// model-viewer module has registered: the first visible product cards trigger
// the dynamic import and must not be treated as failed while it downloads.
const LOAD_TIMEOUT = 20000;

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
  const [modelAttempt, setModelAttempt] = useState(0);
  const animFrameRef = useRef<number>(0);
  const showroomFrameRef = useRef<number>(0);
  const snapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMobile = useRef(false);
  const retryCountRef = useRef(0);

  useEffect(() => {
    isMobile.current = window.matchMedia("(hover: none)").matches;
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Keep WebGL scoped to cards that are actually on-screen. The old
        // one-way activation kept every previously viewed model and animation
        // alive for the rest of a long catalogue session.
        setIsVisible(entry.isIntersecting);
      },
      { rootMargin: "0px" }
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

  const stopShowroomMotion = useCallback(() => {
    if (showroomFrameRef.current) {
      cancelAnimationFrame(showroomFrameRef.current);
      showroomFrameRef.current = 0;
    }
  }, []);

  const startShowroomMotion = useCallback(() => {
    stopShowroomMotion();
    const mv = modelRef.current;
    if (!mv) return;

    // Mobile retains the 3D box but skips continuous GPU animation. This
    // avoids overwhelming constrained devices and automated mobile audits.
    if (isMobile.current) {
      mv.setAttribute("camera-orbit", FRONT_ORBIT);
      return;
    }

    const started = performance.now();
    const tick = (now: number) => {
      const phase = ((now - started) / SHOWROOM_CYCLE) * Math.PI * 2;
      const azimuth = SHOWROOM_CENTER + Math.sin(phase) * SHOWROOM_SWEEP;
      mv.setAttribute("camera-orbit", `${azimuth}deg 75deg 105%`);
      showroomFrameRef.current = requestAnimationFrame(tick);
    };
    showroomFrameRef.current = requestAnimationFrame(tick);
  }, [stopShowroomMotion]);

  useEffect(() => {
    if (!isVisible) stopShowroomMotion();
  }, [isVisible, stopShowroomMotion]);

  const handleMouseEnter = useCallback(() => {
    if (isMobile.current) return;
    const mv = modelRef.current;
    if (!mv) return;
    stopShowroomMotion();

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
  }, [animateSpeed, stopShowroomMotion]);

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
    mv.setAttribute("rotation-per-second", `${IDLE_SPEED}deg`);
    startShowroomMotion();
  }, [startShowroomMotion]);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
    const mv = modelRef.current;
    if (mv) {
      // Sway around the product-facing angle rather than doing a full 360°
      // spin, which would expose the thin side or rear artwork in the grid.
      mv.removeAttribute("auto-rotate");
      mv.setAttribute("rotation-per-second", `${IDLE_SPEED}deg`);
      startShowroomMotion();
    }
  }, [startShowroomMotion]);

  const handleError = useCallback(() => {
    // The first few concurrently mounted WebGL viewers can emit a transient
    // error while the custom element is initialising. Remount once before
    // showing a letter placeholder; genuine broken links still degrade safely.
    if (retryCountRef.current < 1) {
      retryCountRef.current += 1;
      window.setTimeout(() => {
        setIsLoaded(false);
        setModelAttempt((attempt) => attempt + 1);
      }, 350);
      return;
    }
    setHasError(true);
  }, []);

  // H7: guard against a GLB that never fires load/error (404s on model-viewer
  // don't always emit an error event).  Crucially, do not begin the timeout
  // until the dynamic import has registered the custom element. Otherwise the
  // first cards on a store page can expire before they have even mounted it.
  useEffect(() => {
    if (!isVisible || !mvReady || isLoaded || hasError) return;
    const t = setTimeout(() => setHasError(true), LOAD_TIMEOUT);
    return () => clearTimeout(t);
  }, [isVisible, mvReady, isLoaded, hasError]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (showroomFrameRef.current) cancelAnimationFrame(showroomFrameRef.current);
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
            key={modelAttempt}
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
            rotation-per-second={`${IDLE_SPEED}deg`}
            touch-action="pan-y"
            style={{
              // Let clicks pass through to the product card (which opens the detail
              // modal). model-viewer's camera-controls would otherwise swallow the
              // tap. The box stays on its product-facing angle while scanning.
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
