import { useEffect } from 'react';

/**
 * DSM Marketing now lives as its own lean, standalone Cloudflare Pages
 * deployment at marketing.digitalsoftwaremarket.ai (no digimax React bundle,
 * no shared build) — see public/_redirects and CONSOLIDATION.md history.
 * This in-app route only exists for old bookmarks / internal links that still
 * point at /marketing; it hard-redirects out to the standalone site.
 */
const Marketing = () => {
  useEffect(() => {
    window.location.replace('https://marketing.digitalsoftwaremarket.ai');
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-[#030305] text-white">
      <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-white/15 border-t-crimson" />
      <p className="text-xs uppercase tracking-[0.16em] text-white/40">Opening DSM Marketing…</p>
    </div>
  );
};

export default Marketing;
