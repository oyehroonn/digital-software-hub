import { useEffect, useRef, useCallback } from "react";

export function useScrollAnimation(className = "animate-on-scroll") {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("visible");
          observer.unobserve(el);
        }
      },
      // Reproduced live: with the old -20px margin (fire only once the
      // element is genuinely inside the viewport), a section positioned a
      // few screens down (e.g. "Curated by Role" at ~y2440 on a 900px-tall
      // viewport) never gets a single IntersectionObserver callback until
      // the user has actually scrolled all the way to it — so any capture
      // of the page before that real scroll (a quick screenshot, a bot, a
      // restored scroll position) sees the whole card grid sitting at
      // permanent opacity:0, i.e. blank. A large positive bottom margin
      // fires well ahead of the element actually entering view, so content
      // within the first few screens is ready by the time it's reached
      // instead of racing the user's scroll.
      { threshold: 0.08, rootMargin: "0px 0px 2000px 0px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, className };
}

export function useHeroReveal() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const children = el.querySelectorAll(".hero-reveal");
    const spotlightOrbs = el.querySelectorAll(".hero-spotlight-orb");
    const timer = setTimeout(() => {
      spotlightOrbs.forEach((orb) => orb.classList.add("visible"));
      children.forEach((child) => child.classList.add("visible"));
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  return ref;
}

export function useCursorGlow() {
  const containerRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const isHovering = useRef(false);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const container = containerRef.current;
    const glow = glowRef.current;
    if (!container || !glow) return;

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Update position immediately - center the glow on cursor
    glow.style.left = `${x}px`;
    glow.style.top = `${y}px`;
    glow.style.transform = 'translate(-50%, -50%)';
  }, []);

  const handleMouseEnter = useCallback(() => {
    isHovering.current = true;
    const glow = glowRef.current;
    if (glow) {
      glow.style.opacity = '1';
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    isHovering.current = false;
    const glow = glowRef.current;
    if (glow) {
      glow.style.opacity = '0';
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const glow = glowRef.current;
    if (!container || !glow) return;
    
    container.addEventListener("mousemove", handleMouseMove, { passive: true });
    container.addEventListener("mouseenter", handleMouseEnter);
    container.addEventListener("mouseleave", handleMouseLeave);
    
    return () => {
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseenter", handleMouseEnter);
      container.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [handleMouseMove, handleMouseEnter, handleMouseLeave]);

  return { containerRef, glowRef };
}
