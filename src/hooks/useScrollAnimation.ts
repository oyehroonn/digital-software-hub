import { useEffect, useRef } from "react";

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
      { threshold: 0.15 }
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
    // Small delay to ensure mount
    const timer = setTimeout(() => {
      children.forEach((child) => child.classList.add("visible"));
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  return ref;
}
