/**
 * AI CHURN / RENEWAL-RISK PREDICTOR.
 *
 * Turns the Orders sheet into per-customer RFM + annual-renewal risk scores
 * (deterministic, computed locally in lib/customers), ranks who's most likely
 * to lapse, and then asks the LLM for a concrete retention play per at-risk
 * account (action + offer + urgency).
 *
 * Resilience: the risk table, scores and "revenue at risk" are pure math and
 * always render. Only the written retention plays need the model; if it's down
 * we show AiUnavailable and keep the table fully usable.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, ShieldAlert, Sparkles, TrendingDown } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { fetchOrders, type Order } from "@/lib/ecommerce";
import { buildCustomers, scoreChurn, type ChurnRow } from "@/lib/customers";
import { chatJson } from "@/lib/llm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { fmtMoney, cn } from "@/lib/utils";
import { AiSpinner, AiUnavailable, LevelPill, LlmBadge, Stat, useLlmHealth } from "./aiKit";

interface Retention {
  action: string;
  offer: string;
  urgency: "low" | "medium" | "high";
}

const MAX_AI = 12; // cap the retention batch so one call covers the worst accounts

export function ChurnPredictor({ config }: { config: AppConfig }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [dataErr, setDataErr] = useState<string | null>(null);

  const [plays, setPlays] = useState<Record<string, Retention>>({});
  const [aiState, setAiState] = useState<"idle" | "thinking" | "ready" | "error">("idle");
  const [aiErr, setAiErr] = useState<string | undefined>();

  const { status: llm, recheck } = useLlmHealth(config);

  const load = useCallback(async () => {
    setLoading(true);
    setDataErr(null);
    try {
      setOrders(await fetchOrders(config));
    } catch (e) {
      setDataErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => scoreChurn(buildCustomers(orders)), [orders]);

  const summary = useMemo(() => {
    let high = 0;
    let medium = 0;
    let revenueAtRisk = 0;
    let currency = "USD";
    for (const r of rows) {
      if (r.riskLevel === "high") {
        high += 1;
        revenueAtRisk += r.totalSpend;
      } else if (r.riskLevel === "medium") medium += 1;
      if (r.currency) currency = r.currency;
    }
    return { total: rows.length, high, medium, revenueAtRisk, currency };
  }, [rows]);

  const atRisk = useMemo(
    () => rows.filter((r) => r.riskLevel !== "low").slice(0, MAX_AI),
    [rows],
  );

  const generate = useCallback(async () => {
    if (!atRisk.length) return;
    setAiState("thinking");
    setAiErr(undefined);
    const payload = atRisk.map((r, i) => ({
      id: i,
      name: r.name || r.email || `Customer ${i + 1}`,
      lifetime_spend: Math.round(r.totalSpend),
      currency: r.currency,
      orders: r.orderCount,
      last_purchase_days_ago: r.recencyDays,
      renewal_due_in_days: r.daysToRenewal,
      risk: r.riskLevel,
      products: r.products.map((p) => p.name).slice(0, 4),
    }));
    try {
      const result = await chatJson<{ recommendations: Array<{ id: number } & Retention> }>(
        config,
        [
          {
            role: "system",
            content:
              "You are a retention strategist at DSM (B2B software & 3D tech). For each at-risk customer, recommend ONE concrete retention play. Respond ONLY with JSON of shape " +
              '{"recommendations": [{"id": number, "action": string, "offer": string, "urgency": "low"|"medium"|"high"}]}. ' +
              "Return one object per input id. action = the outreach move (specific, one sentence). offer = a specific incentive or hook to include. urgency mirrors how close the renewal / how high the value. Plain English, no fluff.",
          },
          { role: "user", content: JSON.stringify({ customers: payload }) },
        ],
        { temperature: 0.5, maxTokens: 1200 },
      );
      const recs = Array.isArray(result?.recommendations) ? result.recommendations : [];
      const map: Record<string, Retention> = {};
      for (const rec of recs) {
        const target = atRisk[rec.id];
        if (!target) continue;
        map[target.key] = {
          action: String(rec.action ?? ""),
          offer: String(rec.offer ?? ""),
          urgency: (["low", "medium", "high"].includes(rec.urgency) ? rec.urgency : target.riskLevel) as Retention["urgency"],
        };
      }
      setPlays(map);
      setAiState("ready");
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : String(e));
      setAiState("error");
    }
  }, [config, atRisk]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">AI Churn & Renewal Risk</h1>
            <LlmBadge status={llm} />
          </div>
          <p className="text-xs text-muted-foreground">
            Renewal-risk scored from purchase recency, cadence & the annual licence cycle.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
          <Button
            size="sm"
            onClick={generate}
            disabled={aiState === "thinking" || llm === "down" || atRisk.length === 0}
            title={llm === "down" ? "AI offline" : "Draft retention plays for at-risk accounts"}
          >
            <Sparkles className={aiState === "thinking" ? "animate-pulse" : ""} /> Retention plan
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Customers" value={String(summary.total)} />
        <Stat label="High risk" value={String(summary.high)} tone="down" />
        <Stat label="Medium risk" value={String(summary.medium)} tone="warn" />
        <Stat label="Revenue at risk" value={fmtMoney(summary.revenueAtRisk, summary.currency)} sub="high-risk lifetime value" tone="down" />
      </div>

      {aiState === "thinking" && (
        <Card>
          <CardContent className="py-6">
            <AiSpinner label="Drafting retention plays for the worst accounts…" />
          </CardContent>
        </Card>
      )}
      {aiState === "error" && (
        <AiUnavailable
          detail={aiErr}
          retrying={llm === "checking"}
          onRetry={async () => {
            const ok = await recheck();
            if (ok) void generate();
          }}
        />
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-down" /> Renewal risk board
            </CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Ranked by risk. {aiState === "ready" ? "AI retention plays attached to the top accounts." : "Generate a retention plan to attach AI plays."}
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {dataErr ? (
            <div className="p-4">
              <Empty title="Couldn't load customers" hint={dataErr} />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-4">
              <Empty icon={<TrendingDown className="h-8 w-8" />} title={loading ? "Loading…" : "No customers yet"} />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Customer</TH>
                  <TH>Risk</TH>
                  <TH className="text-right">Score</TH>
                  <TH className="text-right">Last order</TH>
                  <TH className="text-right">Renewal</TH>
                  <TH className="text-right">Orders</TH>
                  <TH className="text-right">Lifetime</TH>
                  <TH>AI retention play</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <ChurnTableRow key={r.key} row={r} play={plays[r.key]} />
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ChurnTableRow({ row, play }: { row: ChurnRow; play?: Retention }) {
  const renewalLabel =
    row.daysToRenewal < 0
      ? `${Math.abs(row.daysToRenewal)}d overdue`
      : `in ${row.daysToRenewal}d`;
  return (
    <TR>
      <TD className="max-w-[180px]">
        <div className="truncate font-medium">{row.name || row.email || "Unknown"}</div>
        <div className="truncate text-[11px] text-muted-foreground">{row.email}</div>
      </TD>
      <TD>
        <LevelPill level={row.riskLevel} />
      </TD>
      <TD className="text-right">
        <div className="flex items-center justify-end gap-2">
          <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full",
                row.riskLevel === "high" ? "bg-down" : row.riskLevel === "medium" ? "bg-warn" : "bg-ok",
              )}
              style={{ width: `${row.riskScore}%` }}
            />
          </div>
          <span className="tabular-nums text-xs">{row.riskScore}</span>
        </div>
      </TD>
      <TD className="text-right tabular-nums text-muted-foreground">
        {row.lastOrder ? `${row.recencyDays}d ago` : "—"}
      </TD>
      <TD className="text-right tabular-nums">
        <span className={row.daysToRenewal < 0 ? "text-down" : row.daysToRenewal <= 60 ? "text-warn" : "text-muted-foreground"}>
          {renewalLabel}
        </span>
      </TD>
      <TD className="text-right tabular-nums">{row.orderCount}</TD>
      <TD className="text-right tabular-nums">{fmtMoney(row.totalSpend, row.currency)}</TD>
      <TD className="max-w-[320px]">
        {play ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-start gap-1.5">
              <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
              <span className="text-xs">{play.action}</span>
            </div>
            {play.offer && (
              <div className="flex items-center gap-1.5">
                <Badge variant="ok">Offer</Badge>
                <span className="text-[11px] text-muted-foreground">{play.offer}</span>
              </div>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TD>
    </TR>
  );
}
