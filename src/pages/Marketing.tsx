import { useEffect } from 'react';

/**
 * /marketing is served as a STANDALONE page (public/marketing/index.html) — no
 * React app, no iframe — for a fast load. This route exists only for in-app SPA
 * navigation: it hard-redirects to the standalone microsite. Direct/deep hits
 * are caught earlier by the Cloudflare `_redirects` edge rule (public/_redirects).
 */
const Marketing = () => {
  useEffect(() => {
    window.location.replace('/marketing/index.html');
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-[#030305] text-white">
      <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-white/15 border-t-crimson" />
      <p className="text-xs uppercase tracking-[0.16em] text-white/40">Opening DSM Marketing…</p>
    </div>
  );
};

export default Marketing;
