import { useRef, useCallback, useEffect, useLayoutEffect, memo } from "react";

interface MagnifyTextProps {
  text: string;
  className?: string;
  goldText?: boolean;
}

const RADIUS = 120;
const MAX_SCALE = 0.35;
const MAX_BRIGHTNESS = 0.3;
const MAX_Y = -4;

const MagnifyText = memo(({ text, className = "", goldText = false }: MagnifyTextProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const charsRef = useRef<HTMLSpanElement[]>([]);
  const rafRef = useRef<number>(0);
  const mousePos = useRef({ x: 0, y: 0, active: false });

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    charsRef.current = Array.from(
      container.querySelectorAll<HTMLSpanElement>(".magnify-char")
    );
  }, [text]);

  const animate = useCallback(() => {
    const chars = charsRef.current;
    const { x, y, active } = mousePos.current;

    for (let i = 0; i < chars.length; i++) {
      const el = chars[i];
      if (!el) continue;

      if (!active) {
        el.style.transform = "";
        el.style.filter = "";
        el.style.textShadow = "";
        continue;
      }

      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const t = Math.max(0, 1 - dist / RADIUS);
      const eased = t * t * (3 - 2 * t);

      if (eased < 0.01) {
        el.style.transform = "";
        el.style.filter = "";
        el.style.textShadow = "";
      } else {
        const scale = 1 + eased * MAX_SCALE;
        const moveY = eased * MAX_Y;
        const brightness = 1 + eased * MAX_BRIGHTNESS;
        const glowAlpha = (eased * 0.4).toFixed(2);
        const glowSpread = Math.round(eased * 30);

        el.style.transform = `scale(${scale}) translateY(${moveY}px)`;
        el.style.filter = `brightness(${brightness})`;
        el.style.textShadow = `0 0 ${glowSpread}px hsl(4 65% 54% / ${glowAlpha})`;
      }
    }

    if (mousePos.current.active) {
      rafRef.current = requestAnimationFrame(animate);
    }
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      mousePos.current.x = e.clientX;
      mousePos.current.y = e.clientY;
      if (!mousePos.current.active) {
        mousePos.current.active = true;
        rafRef.current = requestAnimationFrame(animate);
      }
    },
    [animate]
  );

  const handleMouseLeave = useCallback(() => {
    mousePos.current.active = false;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    const chars = charsRef.current;
    for (let i = 0; i < chars.length; i++) {
      const el = chars[i];
      if (el) {
        el.style.transform = "";
        el.style.filter = "";
        el.style.textShadow = "";
      }
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [handleMouseMove, handleMouseLeave]);

  const words = text.split(" ");

  return (
    <div ref={containerRef} className={`magnify-text-container ${className}`}>
      {words.map((word, wi) => (
        <span key={wi} className="magnify-word">
          {word.split("").map((char, ci) => (
            <span
              key={`${wi}-${ci}`}
              className={`magnify-char${goldText ? " magnify-gold" : ""}`}
            >
              {char}
            </span>
          ))}
          {wi < words.length - 1 && (
            <span className="magnify-space">{" "}</span>
          )}
        </span>
      ))}
    </div>
  );
});

MagnifyText.displayName = "MagnifyText";

export default MagnifyText;
