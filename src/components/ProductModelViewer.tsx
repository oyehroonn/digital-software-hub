import { useRef, useState, useEffect, useCallback } from "react";
// NOTE: @google/model-viewer (~large WebGL custom element) is imported
// dynamically once a card scrolls into view — see the IntersectionObserver
// effect below — so it downloads as its own chunk and never bloats the initial
// bundle. The <model-viewer> element only renders after the module registers.

interface ProductModelViewerProps {
  glbSrc: string;
  fallbackIcon: React.ReactNode;
  className?: string;
  // Skip the shared concurrency queue and start loading immediately. Use
  // for the single foreground viewer the user is actually looking at (the
  // product-detail modal) — never for grid/list thumbnails, or it defeats
  // the point of the queue.
  priority?: boolean;
}

const IDLE_SPEED = 0;
// Resting position is a genuine 3/4 tilt (30deg) so the cover AND spine both
// read at rest, not a dead-flat front view. Restored per explicit request —
// this was flattened to 0deg on 2026-07-24 ("keep 3D product motion
// front-facing"), which is the regression being reverted here.
const FRONT_ORBIT = "30deg 75deg 105%";
const SHOWROOM_CENTER = 30;
const SHOWROOM_SWEEP = 14;
const SHOWROOM_CYCLE = 4200;
const EASE_DURATION = 500;
const DECEL_DURATION = 700;
// H7 (revised): a GLB that's genuinely unreachable (dead link / API down)
// should fall back to the static icon quickly, but a GLB that's still
// downloading on a slow connection (mobile data, throttled wifi, a >1MB
// model) shouldn't be punished by a short fixed timer — that was the root
// cause of "sometimes doesn't load": a fixed 20s cutoff fired while the
// model was still legitimately mid-download and would have finished fine
// given a bit longer. Instead we watch model-viewer's `progress` event
// (fires with detail.totalProgress 0..1) and only give up once progress has
// genuinely STALLED for a while, with a generous absolute ceiling as a
// last-resort safety net so a truly dead/looping load can't hang forever.
// Reproduced against a real "Fast 3G"-equivalent throttle (1.6Mbps/750kbps,
// Chrome's own DevTools preset — not a worst-case torture test): with a
// couple of cards loading concurrently, individual `progress` ticks can
// legitimately be >15s apart while a ~1.5MB GLB is still genuinely crawling
// forward. A short stall window was mistaking "slow" for "stuck" and firing
// the fallback while the model would have finished fine. Give real progress
// much more room; only flag a load that has made literally zero headway in
// a long time (a dead link, CORS block, or network drop — not just a slow
// one).
const STALL_TIMEOUT = 30000; // no download progress for this long => give up
const ABSOLUTE_TIMEOUT = 90000; // hard ceiling regardless of progress
const STALL_CHECK_INTERVAL = 2000;

// Reproduced with Playwright (throttled CPU + network, several cards visible
// at once — a normal grid page on a mid/low-end phone): letting every visible
// card start fetching + parsing its GLB simultaneously starves them all of
// main-thread time, so `progress` genuinely stops advancing for many of them
// at once and they were timing out despite the model being fine. Cap how many
// loads run concurrently; the rest wait for a free slot instead of fighting
// for the CPU/GPU and losing.
const MAX_CONCURRENT_LOADS = 1;
let activeLoadSlots = 0;
const slotWaiters: Array<() => void> = [];

// H9: the download queue above grants/releases correctly (verified live with
// Playwright — cards do get a slot, their GLB fully downloads, `progress`
// reaches 1). The actual "never load, never error" hang is downstream of
// that: once loaded, every card starts an UNBOUNDED, endless per-frame
// requestAnimationFrame loop (see startShowroomMotion below) that mutates
// model-viewer's `camera-orbit` on every tick — which forces a real WebGL
// re-render (incl. a shadow/AO pass) 60x/sec, visible in DevTools as
// repeated "GPU stall due to ReadPixels" driver warnings. Reproduced live:
// with the hero, nav-featured card, and several DSM CHOICE cards all
// simultaneously mounted and swaying, the accumulating per-frame GPU/main-
// thread cost eventually starves any card still trying to do its FIRST
// render — its network fetch finishes fine, but it can never get a GPU slot
// to actually paint, so `load` never fires (confirmed: `progress` hits 1.0
// and then nothing — no further progress/load/error — for up to the full
// 90s ABSOLUTE_TIMEOUT ceiling). More cards succeed -> more endless sway
// loops pile up -> the next card has even less chance, a self-reinforcing
// pile-up. Cap how many cards may run the idle sway loop at once; the rest
// settle on the static product-facing pose (still a fully loaded 3D box,
// just not swaying) instead of competing forever for a GPU slot that never
// frees up on its own.
const MAX_ACTIVE_SHOWROOM = 1;
let activeShowroomSlots = 0;

// H8: the product-detail modal reuses this same viewer, but it used to queue
// for a slot behind whatever's-off-screen the background product grid was
// still loading — measured with Playwright against the live site: the
// modal's own GLB would finish downloading in well under a second, yet the
// spinner sat there for 7+ seconds because <model-viewer> never even got
// mounted until a slot freed up, stuck in the same FIFO queue as ~20
// concurrently-loading grid thumbnails the user isn't looking at (the grid
// is behind the modal's backdrop). A `priority` request (the modal is a
// singleton — at most one is ever open) skips the queue and gets a slot
// immediately instead of waiting its turn, so the foreground view the user
// actually opened isn't held hostage by background thumbnail loads.
function acquireLoadSlot(onGranted: () => void, priority = false): () => void {
  let granted = false;
  let released = false;
  const grant = () => {
    if (released) return;
    granted = true;
    activeLoadSlots++;
    onGranted();
  };
  if (priority || activeLoadSlots < MAX_CONCURRENT_LOADS) {
    grant();
  } else {
    slotWaiters.push(grant);
  }
  // Idempotent: safe to call more than once (completion + unmount can both
  // try to release the same slot).
  return () => {
    if (released) return;
    released = true;
    if (granted) {
      activeLoadSlots = Math.max(0, activeLoadSlots - 1);
      const next = slotWaiters.shift();
      if (next) next();
    } else {
      const idx = slotWaiters.indexOf(grant);
      if (idx !== -1) slotWaiters.splice(idx, 1);
    }
  };
}

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
  priority = false,
}: ProductModelViewerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [mvReady, setMvReady] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [modelAttempt, setModelAttempt] = useState(0);
  const [hasSlot, setHasSlot] = useState(false);
  const releaseSlotRef = useRef<(() => void) | null>(null);
  const animFrameRef = useRef<number>(0);
  const showroomFrameRef = useRef<number>(0);
  const hasShowroomSlotRef = useRef(false);
  const snapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMobile = useRef(false);
  const retryCountRef = useRef(0);
  // Tracks the model-viewer `progress` event so the stall-timeout below can
  // tell "still genuinely downloading" apart from "actually stuck".
  const lastProgressRef = useRef({ value: 0, at: 0 });
  const loadStartedAtRef = useRef(0);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMobile.current = window.matchMedia("(hover: none)").matches;
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
            hideTimeoutRef.current = null;
          }
          setIsVisible(true);
          return;
        }
        // Debounce tear-down: scrolling a card a few px out of view and
        // straight back in used to unmount <model-viewer> instantly, which
        // aborted whatever was in flight and restarted the GLB fetch from
        // zero on the way back — on a slow connection that restart loop
        // could outrun a fixed timeout and never finish. Give it a couple of
        // seconds of grace before actually releasing the WebGL context.
        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = setTimeout(() => {
          hideTimeoutRef.current = null;
          setIsVisible(false);
        }, 2000);
      },
      { rootMargin: "200px 0px" }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
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
    // Release this instance's showroom slot (if it held one) so a card
    // that's still waiting for its first render gets a fair shot at the
    // GPU instead of competing against a permanently growing pile of idle
    // sway loops. Idempotent — safe to call when no slot was held.
    if (hasShowroomSlotRef.current) {
      hasShowroomSlotRef.current = false;
      activeShowroomSlots = Math.max(0, activeShowroomSlots - 1);
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

    // At capacity: hold the static product-facing pose (box is fully loaded
    // and visible, just not swaying) instead of adding yet another endless
    // per-frame animation loop on top of an already-busy render pipeline —
    // see the MAX_ACTIVE_SHOWROOM comment above.
    if (activeShowroomSlots >= MAX_ACTIVE_SHOWROOM) {
      mv.setAttribute("camera-orbit", FRONT_ORBIT);
      return;
    }
    activeShowroomSlots++;
    hasShowroomSlotRef.current = true;

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
    if (glbSrc.includes("9900")) console.log("[PMV_DEBUG] load fired", glbSrc);
    setIsLoaded(true);
    const mv = modelRef.current;
    if (mv) {
      // Sway around the product-facing angle rather than doing a full 360°
      // spin, which would expose the thin side or rear artwork in the grid.
      mv.removeAttribute("auto-rotate");
      mv.setAttribute("rotation-per-second", `${IDLE_SPEED}deg`);
      startShowroomMotion();
    }
  }, [startShowroomMotion, glbSrc]);

  // Track real download progress (model-viewer dispatches `progress` with
  // detail.totalProgress in [0, 1]) so the stall-detector below can tell a
  // slow-but-advancing load apart from one that's actually wedged.
  const handleProgress = useCallback((e: Event) => {
    const detail = (e as CustomEvent<{ totalProgress?: number }>).detail;
    const value = detail?.totalProgress ?? 0;
    if (glbSrc.includes("9900")) console.log("[PMV_DEBUG] progress", glbSrc.slice(-40), value);
    if (value > lastProgressRef.current.value || lastProgressRef.current.at === 0) {
      lastProgressRef.current = { value, at: performance.now() };
    }
  }, [glbSrc]);

  const handleError = useCallback(() => {
    if (glbSrc.includes("9900")) console.log("[PMV_DEBUG] error fired", glbSrc, "retryCount", retryCountRef.current);
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
  }, [glbSrc]);

  // Wait for a free concurrency slot before actually mounting <model-viewer>.
  // Re-acquire on every fresh attempt (visibility regained, or the one
  // auto-retry after an error swaps the element key).
  useEffect(() => {
    if (!isVisible || !mvReady) return;
    if (glbSrc.includes("9900")) console.log("[PMV_DEBUG] requesting slot", glbSrc.slice(-40), "activeLoadSlots=", activeLoadSlots, "waiters=", slotWaiters.length);
    setHasSlot(false);
    let cancelled = false;
    const release = acquireLoadSlot(() => {
      if (!cancelled) {
        if (glbSrc.includes("9900")) console.log("[PMV_DEBUG] slot GRANTED", glbSrc.slice(-40));
        setHasSlot(true);
      }
    }, priority);
    releaseSlotRef.current = release;
    return () => {
      cancelled = true;
      release();
      if (releaseSlotRef.current === release) releaseSlotRef.current = null;
    };
  }, [isVisible, mvReady, modelAttempt, priority, glbSrc]);

  // Free the slot as soon as there's a result so the next queued card can
  // start — the already-mounted viewer keeps rendering regardless.
  useEffect(() => {
    if (!isLoaded && !hasError) return;
    releaseSlotRef.current?.();
    releaseSlotRef.current = null;
  }, [isLoaded, hasError]);

  // Reset the progress/stall trackers every time a fresh load attempt
  // actually starts (i.e. once a slot has been granted and the element is
  // about to mount).
  useEffect(() => {
    if (!isVisible || !mvReady || !hasSlot) return;
    lastProgressRef.current = { value: 0, at: performance.now() };
    loadStartedAtRef.current = performance.now();
  }, [isVisible, mvReady, hasSlot, modelAttempt]);

  // H7 (revised): guard against a GLB that never fires load/error (404s on
  // model-viewer don't always emit an error event) — but base the give-up
  // decision on whether download PROGRESS has stalled, not a fixed clock.
  // A model that's still advancing (slow connection, large file) keeps
  // getting time, up to a generous absolute ceiling; one that stops
  // advancing (dead link, CORS block, network drop) gets flagged quickly.
  useEffect(() => {
    if (!isVisible || !mvReady || !hasSlot || isLoaded || hasError) return;
    if (glbSrc.includes("9900")) console.log("[PMV_DEBUG] stall-check EFFECT (re)started", glbSrc.slice(-40));

    // handleError()'s retry remount is async (a 350ms setTimeout before
    // modelAttempt changes and this effect re-runs), so guard against this
    // same interval firing a second time in that window and immediately
    // exhausting the one retry before it's had a chance to run.
    let fired = false;

    const interval = window.setInterval(() => {
      if (fired) return;
      const now = performance.now();
      const sinceProgress = now - (lastProgressRef.current.at || now);
      const sinceStart = now - (loadStartedAtRef.current || now);
      if (glbSrc.includes("9900")) console.log("[PMV_DEBUG] tick", glbSrc.slice(-40), "sinceProgress=", Math.round(sinceProgress), "sinceStart=", Math.round(sinceStart), "progressVal=", lastProgressRef.current.value);

      if (sinceProgress >= STALL_TIMEOUT || sinceStart >= ABSOLUTE_TIMEOUT) {
        fired = true;
        if (glbSrc.includes("9900")) console.log("[PMV_DEBUG] STALL FIRED -> handleError()", glbSrc.slice(-40));
        // Route through the same give-up-or-retry path as a genuine `error`
        // event, rather than jumping straight to the fallback icon. Isolated
        // testing (a single <model-viewer> alone on a blank page, nothing
        // else competing) shows these exact GLBs load in well under a
        // second — so a stall here isn't a bad file, it's some concurrent-
        // mount race inside model-viewer's own init path that wedges just
        // this one instance. Removing every OTHER already-loaded viewer on
        // the page doesn't unstick it either (confirmed live) — it's a
        // dead, unrecoverable instance, not something waiting on a shared
        // resource that frees up. A fresh remount (new key -> brand new
        // <model-viewer> + new internal state) reliably works because by
        // the time the retry fires, the initial pile-up of simultaneous
        // mounts has long since settled.
        handleError();
      }
    }, STALL_CHECK_INTERVAL);

    return () => {
      if (glbSrc.includes("9900")) console.log("[PMV_DEBUG] stall-check effect CLEANUP (interval cleared)", glbSrc.slice(-40));
      window.clearInterval(interval);
    };
  }, [isVisible, mvReady, hasSlot, isLoaded, hasError, modelAttempt, glbSrc, handleError]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (showroomFrameRef.current) cancelAnimationFrame(showroomFrameRef.current);
      if (hasShowroomSlotRef.current) {
        hasShowroomSlotRef.current = false;
        activeShowroomSlots = Math.max(0, activeShowroomSlots - 1);
      }
      if (snapTimeoutRef.current) clearTimeout(snapTimeoutRef.current);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      releaseSlotRef.current?.();
      releaseSlotRef.current = null;
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
          {/* Wait for a free concurrency slot before mounting the actual
              WebGL element — see MAX_CONCURRENT_LOADS above. The spinner
              above already covers this wait, so there's nothing else to
              render here in the meantime. */}
          {hasSlot && (
          <model-viewer
            key={modelAttempt}
            ref={(el: HTMLElement | null) => {
              modelRef.current = el;
              if (el) {
                el.addEventListener("load", handleLoad);
                el.addEventListener("error", handleError);
                el.addEventListener("progress", handleProgress);
              }
            }}
            src={
              // Cache-bust the single auto-retry: a failure that came from a
              // transient bad response (a 5xx edge cache entry, a dropped
              // CORS preflight) would otherwise just replay identically
              // against the exact same URL.
              modelAttempt > 0
                ? `${glbSrc}${glbSrc.includes("?") ? "&" : "?"}dsm_retry=${modelAttempt}`
                : glbSrc
            }
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
          )}
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
