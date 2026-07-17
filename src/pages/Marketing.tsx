import { useState, useRef, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import DSMLoader from '../components/DSMLoader';

const Marketing = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isContentReady, setIsContentReady] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleIframeLoad = useCallback(() => {
    // The marketing site is a heavy Webflow "cosmos" build (WebGL globe + GSAP
    // intro sequence). Its `load` event fires before the intro animation has
    // settled, so give it a generous beat before revealing — otherwise the user
    // sees the half-initialised, scattered layout ("ruined").
    setTimeout(() => {
      setIsContentReady(true);
    }, 3000);
  }, []);

  // Resilience only: if the iframe's load event never fires, force-resolve after
  // a HIGH cap so the loader can't hang forever. (Previously 2500ms — far too
  // low; it fired before the heavy iframe was ready and revealed a broken page.)
  useEffect(() => {
    const t = setTimeout(() => setIsContentReady(true), 12000);
    return () => clearTimeout(t);
  }, []);

  const handleLoadComplete = useCallback(() => {
    setIsLoading(false);
  }, []);

  return (
    <div className="fixed inset-0 w-full h-full">
      {/* Back to the main DSM landing page — the marketing site is a full-viewport
          iframe (z-index 9999) with no DSM chrome, so this sits above it at 10000. */}
      <Link
        to="/"
        aria-label="Back to the DSM home page"
        style={{ zIndex: 10000 }}
        className="fixed left-5 top-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/60 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur-md transition-colors hover:border-crimson/60 hover:text-crimson"
      >
        <span aria-hidden className="text-base leading-none">&larr;</span> DSM Store
      </Link>
      {/* DSM 3D Holographic Loader */}
      {isLoading && (
        <DSMLoader 
          onLoadComplete={handleLoadComplete} 
          isContentReady={isContentReady}
        />
      )}

      {/* Marketing Page iframe - loads in background */}
      <iframe
        ref={iframeRef}
        src="/marketing/index.html"
        title="DSM Marketing Portfolio"
        className="w-full h-full border-0"
        style={{ 
          width: '100vw', 
          height: '100vh',
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: isLoading ? 1 : 9999,
          opacity: isLoading ? 0 : 1,
          transition: 'opacity 500ms ease-out'
        }}
        onLoad={handleIframeLoad}
        allowFullScreen
      />
    </div>
  );
};

export default Marketing;
