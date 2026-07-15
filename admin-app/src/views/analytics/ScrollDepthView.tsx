/**
 * Scroll-depth tab. The existing <ScrollMap> is already a complete, self-fetching
 * view (page selector, fold-line reach curve, heat rail, per-page summary) with
 * its own seed fallback, so this tab simply reuses it.
 */
import type { AppConfig } from "@/lib/config";
import { ScrollMap } from "@/views/ScrollMap";

export function ScrollDepthView({ config }: { config: AppConfig }) {
  return <ScrollMap config={config} />;
}
