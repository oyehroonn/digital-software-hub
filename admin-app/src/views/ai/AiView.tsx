/**
 * AI-selling area hub. Hosts the four AI tools (daily briefing, lead summaries,
 * SEO generator, churn predictor) behind one section.
 *
 * Controlled mode: when the shell passes `page` + `onPageChange` it owns the
 * secondary nav, so this hub renders content only. Standalone (no props) it
 * renders its own tab bar and works on its own.
 */
import { useState } from "react";
import { Newspaper, FileText, Search, UserMinus } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { cn } from "@/lib/utils";
import { DailySalesBriefing } from "./DailySalesBriefing";
import { LeadSummaries } from "./LeadSummaries";
import { BulkSeoGenerator } from "./BulkSeoGenerator";
import { ChurnPredictor } from "./ChurnPredictor";

type AiTab = "briefing" | "leads" | "seo" | "churn";

const TABS: { key: AiTab; label: string; icon: typeof Newspaper }[] = [
  { key: "briefing", label: "Daily briefing", icon: Newspaper },
  { key: "leads", label: "Lead summaries", icon: FileText },
  { key: "seo", label: "SEO generator", icon: Search },
  { key: "churn", label: "Churn predictor", icon: UserMinus },
];

export function AiView({
  config,
  page,
  onPageChange,
}: {
  config: AppConfig;
  page?: string;
  onPageChange?: (k: string) => void;
}) {
  const [internal, setInternal] = useState<AiTab>("briefing");
  const controlled = page !== undefined;
  const tab = (controlled ? page : internal) as AiTab;
  const setTab = (k: AiTab) => (onPageChange ? onPageChange(k) : setInternal(k));

  return (
    <div className="flex flex-col gap-4">
      {!controlled && (
        <nav className="flex flex-wrap gap-1 border-b border-border pb-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            );
          })}
        </nav>
      )}

      {tab === "briefing" && <DailySalesBriefing config={config} />}
      {tab === "leads" && <LeadSummaries config={config} />}
      {tab === "seo" && <BulkSeoGenerator config={config} />}
      {tab === "churn" && <ChurnPredictor config={config} />}
    </div>
  );
}

export default AiView;
