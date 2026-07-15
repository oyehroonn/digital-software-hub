/**
 * Marketing area container. Presents the eight marketing tools under one sub-nav
 * so a single app-level nav entry ("Marketing") wires the whole area. Each tool
 * is a self-loading view that reads the stable data layer (Orders + Telemetry)
 * and the local marketing store; the integration step only needs to render
 * <MarketingView config={config} />.
 */
import { useState } from "react";
import {
  Megaphone, Send, Ticket, FlaskConical, Mail, Share2, CalendarClock, Globe,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { cn } from "@/lib/utils";
import { CampaignsView } from "./CampaignsView";
import { BlastComposer } from "./BlastComposer";
import { DiscountsView } from "./DiscountsView";
import { ABTestsView } from "./ABTestsView";
import { SendLogView } from "./SendLogView";
import { ReferralsView } from "./ReferralsView";
import { SchedulerView } from "./SchedulerView";
import { LandingCompareView } from "./LandingCompareView";

type SubTab =
  | "campaigns" | "blast" | "discounts" | "abtests" | "sendlog" | "referrals" | "scheduler" | "landing";

const SUBTABS: { key: SubTab; label: string; icon: typeof Megaphone }[] = [
  { key: "campaigns", label: "Campaigns", icon: Megaphone },
  { key: "blast", label: "Blast", icon: Send },
  { key: "discounts", label: "Discounts", icon: Ticket },
  { key: "abtests", label: "A/B tests", icon: FlaskConical },
  { key: "scheduler", label: "Scheduler", icon: CalendarClock },
  { key: "referrals", label: "Referrals", icon: Share2 },
  { key: "landing", label: "Landing pages", icon: Globe },
  { key: "sendlog", label: "Send log", icon: Mail },
];

export function MarketingView({ config }: { config: AppConfig }) {
  const [tab, setTab] = useState<SubTab>("campaigns");

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex flex-wrap gap-1 border-b border-border pb-2">
        {SUBTABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          );
        })}
      </nav>

      {tab === "campaigns" && <CampaignsView config={config} />}
      {tab === "blast" && <BlastComposer config={config} />}
      {tab === "discounts" && <DiscountsView />}
      {tab === "abtests" && <ABTestsView config={config} />}
      {tab === "scheduler" && <SchedulerView />}
      {tab === "referrals" && <ReferralsView />}
      {tab === "landing" && <LandingCompareView config={config} />}
      {tab === "sendlog" && <SendLogView />}
    </div>
  );
}
