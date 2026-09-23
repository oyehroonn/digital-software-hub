import { useEffect } from 'react';

/**
 * The DSM AI Lab / agentic services microsite now lives as its own lean,
 * standalone Cloudflare Pages deployment at agentic.digitalsoftwaremarket.ai
 * (no digimax React bundle, no shared build) — see public/_redirects and
 * CONSOLIDATION.md history. This in-app route only exists for old bookmarks /
 * internal links that still point at /services; it hard-redirects out to the
 * standalone site.
 */
const Services = () => {
  useEffect(() => {
    window.location.replace('https://agentic.digitalsoftwaremarket.ai');
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-[#030305] text-white">
      <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-white/15 border-t-crimson" />
      <p className="text-xs uppercase tracking-[0.16em] text-white/40">Opening the DSM AI Lab…</p>
    </div>
  );
};

export default Services;
