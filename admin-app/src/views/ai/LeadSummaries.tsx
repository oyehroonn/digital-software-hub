/**
 * AI LEAD SUMMARY + NEXT-BEST-ACTION.
 *
 * Reconstructs leads/customers from the stable Orders sheet (grouped by email),
 * then, per selected lead, asks the LLM for a one-paragraph summary, the single
 * next-best-action, talking points, and a ready-to-send follow-up email. The
 * draft can be copied or (in the desktop app) sent through the Email API.
 *
 * Resilience: the lead list + all facts render with zero LLM. Only the written
 * summary/email needs the model; if it's down we show AiUnavailable per-lead.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Mail, RefreshCw, Search, Send, Sparkles, Target, User } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { fetchOrders, type Order } from "@/lib/ecommerce";
import { buildCustomers, scoreChurn, type ChurnRow } from "@/lib/customers";
import { chatJson } from "@/lib/llm";
import { mailcli, runtime } from "@/lib/rpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/Empty";
import { fmtMoney, timeAgo, cn } from "@/lib/utils";
import { AiSpinner, AiUnavailable, CopyButton, LevelPill, LlmBadge, Prose, useLlmHealth } from "./aiKit";

interface LeadInsight {
  summary: string;
  stage: string;
  nextBestAction: string;
  talkingPoints: string[];
  email: { subject: string; body: string };
}

type AiState = "idle" | "thinking" | "ready" | "error";

export function LeadSummaries({ config }: { config: AppConfig }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [dataErr, setDataErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const [insight, setInsight] = useState<LeadInsight | null>(null);
  const [aiState, setAiState] = useState<AiState>("idle");
  const [aiErr, setAiErr] = useState<string | undefined>();
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [sendMsg, setSendMsg] = useState<string>("");

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

  const leads = useMemo(() => scoreChurn(buildCustomers(orders)), [orders]);

  const filtered = useMemo(() => {
    if (!q) return leads;
    const t = q.toLowerCase();
    return leads.filter((l) =>
      [l.name, l.email, l.location, ...l.products.map((p) => p.name)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(t)),
    );
  }, [leads, q]);

  const selected = useMemo(
    () => leads.find((l) => l.key === selectedKey) ?? null,
    [leads, selectedKey],
  );

  // Reset the AI panel when the selected lead changes.
  useEffect(() => {
    setInsight(null);
    setAiState("idle");
    setAiErr(undefined);
    setSendState("idle");
    setSendMsg("");
  }, [selectedKey]);

  const generate = useCallback(
    async (lead: ChurnRow) => {
      setAiState("thinking");
      setAiErr(undefined);
      const profile = {
        name: lead.name || "Unknown",
        email: lead.email,
        location: lead.location,
        lifetime_spend: Math.round(lead.totalSpend),
        currency: lead.currency,
        orders: lead.orderCount,
        avg_order_value: Math.round(lead.avgOrderValue),
        first_seen_days_ago: lead.firstOrder ? Math.floor((Date.now() - lead.firstOrder) / 86_400_000) : null,
        last_seen_days_ago: lead.recencyDays,
        renewal_due_in_days: lead.daysToRenewal,
        risk_level: lead.riskLevel,
        products_owned: lead.products.map((p) => ({ name: p.name, qty: p.qty })),
      };
      try {
        const result = await chatJson<LeadInsight>(
          config,
          [
            {
              role: "system",
              content:
                "You are a senior account executive at DSM (B2B software & 3D tech). Given a customer's purchase history, produce a concise sell-focused brief. Respond ONLY with JSON of shape " +
                '{"summary": string, "stage": string, "nextBestAction": string, "talkingPoints": string[], "email": {"subject": string, "body": string}}. ' +
                "summary = 2-3 sentences on who they are and where the relationship stands. stage = a short label like 'New lead', 'Repeat buyer', 'Upsell-ready', or 'At-risk renewal'. nextBestAction = the single most valuable move to make now. talkingPoints = 3-4 short bullets. email = a warm, specific, ready-to-send follow-up (no placeholders like [Name]; use their real name). Plain English.",
            },
            { role: "user", content: JSON.stringify(profile) },
          ],
          { temperature: 0.55, maxTokens: 1000 },
        );
        setInsight({
          summary: String(result?.summary ?? ""),
          stage: String(result?.stage ?? lead.riskLevel),
          nextBestAction: String(result?.nextBestAction ?? ""),
          talkingPoints: Array.isArray(result?.talkingPoints) ? result.talkingPoints : [],
          email: {
            subject: String(result?.email?.subject ?? ""),
            body: String(result?.email?.body ?? ""),
          },
        });
        setAiState("ready");
      } catch (e) {
        setAiErr(e instanceof Error ? e.message : String(e));
        setAiState("error");
      }
    },
    [config],
  );

  const sendEmail = useCallback(async () => {
    if (!selected || !insight) return;
    if (!runtime.isTauri) {
      setSendState("error");
      setSendMsg("Sending is only available in the desktop app.");
      return;
    }
    setSendState("sending");
    setSendMsg("");
    try {
      await mailcli(config.email_cli, "sendEmail", {
        to: selected.email,
        subject: insight.email.subject,
        body: insight.email.body,
      });
      setSendState("sent");
      setSendMsg(`Sent to ${selected.email}`);
    } catch (e) {
      setSendState("error");
      setSendMsg(e instanceof Error ? e.message : String(e));
    }
  }, [config, selected, insight]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">AI Lead Summaries</h1>
            <LlmBadge status={llm} />
          </div>
          <p className="text-xs text-muted-foreground">
            Every lead reconstructed from the Orders sheet, with an AI next-best-action.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
        {/* Lead list */}
        <Card className="overflow-hidden">
          <CardHeader className="gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search leads…"
                className="pl-8"
              />
            </div>
            <p className="text-xs text-muted-foreground">{filtered.length} leads</p>
          </CardHeader>
          <CardContent className="max-h-[70vh] overflow-y-auto p-0">
            {dataErr ? (
              <div className="p-4">
                <Empty title="Couldn't load leads" hint={dataErr} />
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-4">
                <Empty icon={<User className="h-8 w-8" />} title={loading ? "Loading…" : "No leads yet"} />
              </div>
            ) : (
              <ul>
                {filtered.map((l) => (
                  <li key={l.key}>
                    <button
                      onClick={() => setSelectedKey(l.key)}
                      className={cn(
                        "flex w-full items-start justify-between gap-2 border-b border-border/50 px-4 py-2.5 text-left transition-colors",
                        selectedKey === l.key ? "bg-accent" : "hover:bg-accent/50",
                      )}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{l.name || l.email || "Unknown"}</div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {l.orderCount} orders · {fmtMoney(l.totalSpend, l.currency)}
                        </div>
                      </div>
                      <LevelPill level={l.riskLevel} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Detail + AI */}
        <div className="flex flex-col gap-4">
          {!selected ? (
            <Card>
              <CardContent className="py-16">
                <Empty
                  icon={<Target className="h-8 w-8" />}
                  title="Select a lead"
                  hint="Pick a lead on the left to see their history and get an AI next-best-action."
                />
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="flex-row items-start justify-between space-y-0">
                  <div>
                    <CardTitle className="text-base">{selected.name || "Unknown"}</CardTitle>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {selected.email || "no email"} {selected.phone ? `· ${selected.phone}` : ""}{" "}
                      {selected.location ? `· ${selected.location}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => generate(selected)}
                    disabled={aiState === "thinking" || llm === "down"}
                    title={llm === "down" ? "AI offline" : "Summarize & recommend"}
                  >
                    <Sparkles className={aiState === "thinking" ? "animate-pulse" : ""} /> Summarize
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <MiniStat label="Lifetime" value={fmtMoney(selected.totalSpend, selected.currency)} />
                    <MiniStat label="Orders" value={String(selected.orderCount)} />
                    <MiniStat label="Avg order" value={fmtMoney(selected.avgOrderValue, selected.currency)} />
                    <MiniStat
                      label="Last seen"
                      value={selected.lastOrder ? timeAgo(selected.lastOrder) : "—"}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {selected.products.map((p) => (
                      <Badge key={p.productId} variant="muted">
                        {p.name}
                        {p.qty > 1 ? ` ×${p.qty}` : ""}
                      </Badge>
                    ))}
                  </div>
                  {selected.reasons.length > 0 && (
                    <p className="mt-3 text-xs text-muted-foreground">{selected.reasons.join(" · ")}</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" /> AI brief
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {aiState === "thinking" ? (
                    <div className="py-8">
                      <AiSpinner label="Studying this lead…" />
                    </div>
                  ) : aiState === "error" ? (
                    <AiUnavailable
                      detail={aiErr}
                      retrying={llm === "checking"}
                      onRetry={async () => {
                        const ok = await recheck();
                        if (ok) void generate(selected);
                      }}
                    />
                  ) : aiState === "ready" && insight ? (
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center gap-2">
                        <Badge>{insight.stage}</Badge>
                      </div>
                      <Prose text={insight.summary} />

                      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                        <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-primary">
                          <Target className="h-3.5 w-3.5" /> Next best action
                        </div>
                        <p className="text-sm">{insight.nextBestAction}</p>
                      </div>

                      {insight.talkingPoints.length > 0 && (
                        <div>
                          <div className="mb-1 text-xs font-semibold text-muted-foreground">Talking points</div>
                          <ul className="ml-4 flex list-disc flex-col gap-1 text-sm marker:text-muted-foreground">
                            {insight.talkingPoints.map((t, i) => (
                              <li key={i}>{t}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Draft email */}
                      <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                            <Mail className="h-3.5 w-3.5" /> Suggested follow-up email
                          </div>
                          <div className="flex items-center gap-2">
                            <CopyButton
                              text={`Subject: ${insight.email.subject}\n\n${insight.email.body}`}
                              label="Copy"
                            />
                            <Button
                              size="sm"
                              onClick={sendEmail}
                              disabled={!selected.email || sendState === "sending" || sendState === "sent"}
                              title={
                                !runtime.isTauri
                                  ? "Sending works in the desktop app"
                                  : !selected.email
                                    ? "No email on file"
                                    : "Send via Email API"
                              }
                            >
                              <Send className={sendState === "sending" ? "animate-pulse" : ""} />{" "}
                              {sendState === "sent" ? "Sent" : "Send"}
                            </Button>
                          </div>
                        </div>
                        <div className="text-sm font-medium">{insight.email.subject}</div>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">{insight.email.body}</p>
                        {sendMsg && (
                          <p className={cn("mt-2 text-xs", sendState === "error" ? "text-down" : "text-ok")}>
                            {sendMsg}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                      <Sparkles className="h-7 w-7 text-primary/60" />
                      <p className="max-w-xs text-sm text-muted-foreground">
                        Press <span className="font-medium text-foreground">Summarize</span> for an AI read on this
                        lead and the next best action.
                      </p>
                      {llm === "down" && <p className="text-xs text-down">AI is offline — history above is live.</p>}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/70 bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
