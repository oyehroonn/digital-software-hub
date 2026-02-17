import { useRef, useState, useEffect, useCallback } from "react";
import "@google/model-viewer";

interface ProductModelViewerProps {
  glbSrc: string;
  fallbackIcon: React.ReactNode;
  className?: string;
}

const IDLE_SPEED = 50;
const FRONT_ORBIT = "30deg 75deg 105%";
const EASE_DURATION = 500;
const DECEL_DURATION = 700;

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
      {isVisible ? (
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
