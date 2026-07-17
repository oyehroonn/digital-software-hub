import { useEffect } from 'react';

/**
 * /services is served as a STANDALONE page (public/services/dsmAIFinal.html) —
 * no React app, no iframe — for a fast load. This route exists only for in-app
 * SPA navigation: it hard-redirects to the standalone AI Lab microsite. Direct/
 * deep hits are caught earlier by the Cloudflare `_redirects` edge rule.
 */
const Services = () => {
  useEffect(() => {
    window.location.replace('/services/dsmAIFinal.html');
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-[#030305] text-white">
      <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-white/15 border-t-crimson" />
      <p className="text-xs uppercase tracking-[0.16em] text-white/40">Opening the DSM AI Lab…</p>
    </div>
  );
};

export default Services;
