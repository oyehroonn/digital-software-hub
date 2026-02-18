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
      { threshold: 0.08, rootMargin: "0px 0px -20px 0px" }
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
  const rafPending = useRef(false);
  const mouseX = useRef(0);
  const mouseY = useRef(0);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    mouseX.current = e.clientX;
    mouseY.current = e.clientY;

    if (rafPending.current) return;
    rafPending.current = true;

    requestAnimationFrame(() => {
      const container = containerRef.current;
      const glow = glowRef.current;
      if (container && glow) {
        const rect = container.getBoundingClientRect();
        const x = mouseX.current - rect.left;
        const y = mouseY.current - rect.top;
        glow.style.transform = `translate(${x - 250}px, ${y - 250}px)`;
      }
      rafPending.current = false;
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => container.removeEventListener("mousemove", handleMouseMove);
  }, [handleMouseMove]);

  return { containerRef, glowRef };
}
