import { useState, useRef, useCallback } from 'react';
import DSMAILabLoader from '../components/DSMAILabLoader';

const Services = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isContentReady, setIsContentReady] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleIframeLoad = useCallback(() => {
    setTimeout(() => {
      setIsContentReady(true);
    }, 1000);
  }, []);

  const handleLoadComplete = useCallback(() => {
    setIsLoading(false);
  }, []);

  return (
    <div className="fixed inset-0 w-full h-full">
      {isLoading && (
        <DSMAILabLoader
          onLoadComplete={handleLoadComplete}
          isContentReady={isContentReady}
        />
      )}

      <iframe
        ref={iframeRef}
        src="/services/dsmAIFinal.html"
        title="DSM AI Lab Services"
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

export default Services;
