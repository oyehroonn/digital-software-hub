import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/Empty";
import { openTaskCount, subscribe as subscribeCrm } from "@/lib/crmStore";
import { useCrmData } from "./useCrmData";
import { SubTabs } from "./components";
import { LeadInbox } from "./LeadInbox";
import { LeadScoring } from "./LeadScoring";
import { Customer360 } from "./Customer360";
import { LicenseTracker } from "./LicenseTracker";
import { SegmentBuilder } from "./SegmentBuilder";
import { FollowUps } from "./FollowUps";
import { WinBack } from "./WinBack";
import { UnifiedLeadInbox } from "./UnifiedLeadInbox";
import { LegacyWoo } from "./LegacyWoo";

type CrmTab =
  | "inbox"
  | "siteleads"
  | "scoring"
  | "customers"
  | "licenses"
  | "segments"
  | "tasks"
  | "winback"
  | "legacy";

/**
 * CRM / Leads area entry point. Owns the single data load and routes between the
 * eight sub-tools. Drop this straight into the app's nav as one "CRM" tab.
 */
export function CrmView({
  config,
  page,
  onPageChange,
}: {
  config: AppConfig;
  /** Controlled active tab (shell owns the sub-nav). Omit to run standalone. */
  page?: string;
  onPageChange?: (k: string) => void;
}) {
  const [internal, setInternal] = useState<CrmTab>("inbox");
  const controlled = page !== undefined;
  const tab = (controlled ? page : internal) as CrmTab;
  const setTab = (k: CrmTab) => (onPageChange ? onPageChange(k) : setInternal(k));
  const [focusEmail, setFocusEmail] = useState<string | null>(null);
  const [openTasks, setOpenTasks] = useState(0);
  const data = useCrmData(config);

  useEffect(() => subscribeCrm(() => setOpenTasks(openTaskCount())), []);

  const hot = data.leads.filter((l) => l.scoring.grade === "A" || l.scoring.grade === "B").length;

  const tabs: { key: CrmTab; label: string; badge?: number }[] = [
    { key: "inbox", label: "Lead Inbox", badge: hot },
    { key: "siteleads", label: "Site leads" },
    { key: "scoring", label: "Scoring" },
    { key: "customers", label: "Customer 360" },
    { key: "licenses", label: "Licences", badge: data.renewals.length },
    { key: "segments", label: "Segments" },
    { key: "tasks", label: "Follow-ups", badge: openTasks },
    { key: "winback", label: "Win-back", badge: data.winBack.filter((w) => w.customer.email).length },
    { key: "legacy", label: "Legacy (Woo)" },
  ];

  const openCustomer = (email: string) => {
    setFocusEmail(email);
    setTab("customers");
  };

  return (
    <div className="flex flex-col gap-4">
      {controlled ? (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={data.refresh} disabled={data.loading}>
            <RefreshCw className={data.loading ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold">CRM &amp; Leads</h1>
              <p className="text-xs text-muted-foreground">
                Unified inbox, scoring, customer 360, renewals, segments, tasks &amp; win-back — from the stable Orders
                &amp; Telemetry sheets.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={data.refresh} disabled={data.loading}>
                <RefreshCw className={data.loading ? "animate-spin" : ""} /> Refresh
              </Button>
            </div>
          </div>

          <SubTabs<CrmTab> tabs={tabs} active={tab} onChange={setTab} />
        </>
      )}

      {data.error ? (
        <Empty title="Couldn't load CRM data" hint={data.error} />
      ) : tab === "inbox" ? (
        <LeadInbox leads={data.leads} onOpenCustomer={openCustomer} />
      ) : tab === "siteleads" ? (
        <UnifiedLeadInbox config={config} onOpenCustomer={openCustomer} onRefresh={data.refresh} />
      ) : tab === "scoring" ? (
        <LeadScoring leads={data.leads} />
      ) : tab === "customers" ? (
        <Customer360 config={config} customers={data.customers} leads={data.leads} focusEmail={focusEmail} />
      ) : tab === "licenses" ? (
        <LicenseTracker config={config} renewals={data.renewals} customers={data.customers} />
      ) : tab === "segments" ? (
        <SegmentBuilder leads={data.leads} customers={data.customers} />
      ) : tab === "tasks" ? (
        <FollowUps />
      ) : tab === "legacy" ? (
        <LegacyWoo />
      ) : (
        <WinBack config={config} winBack={data.winBack} />
      )}
    </div>
  );
}

export default CrmView;
