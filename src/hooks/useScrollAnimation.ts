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

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const container = containerRef.current;
    const glow = glowRef.current;
    if (!container || !glow) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    glow.style.left = `${x}px`;
    glow.style.top = `${y}px`;
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("mousemove", handleMouseMove);
    return () => container.removeEventListener("mousemove", handleMouseMove);
  }, [handleMouseMove]);

  return { containerRef, glowRef };
}
