import { useMemo } from "react";
import { Flame, Gauge, MousePointerClick, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { contactKey, type Grade, type ScoredLead } from "@/lib/crm";
import { ScoreBadge, ScoreMeter, SourceBadge, StatCard, StatusBadge, SeedBadge, useCrmStore } from "./components";

const GRADES: Grade[] = ["A", "B", "C", "D"];

export function LeadScoring({ leads, seeded }: { leads: ScoredLead[]; seeded: boolean }) {
  const crm = useCrmStore();

  const dist = useMemo(() => {
    const m: Record<Grade, number> = { A: 0, B: 0, C: 0, D: 0 };
    for (const l of leads) m[l.scoring.grade]++;
    return m;
  }, [leads]);

  const avgIntent = leads.length ? Math.round(leads.reduce((s, l) => s + l.scoring.intentPoints, 0) / leads.length) : 0;
  const avgBehav = leads.length ? Math.round(leads.reduce((s, l) => s + l.scoring.behaviorPoints, 0) / leads.length) : 0;

  if (leads.length === 0) return <Empty icon={<Gauge className="h-8 w-8" />} title="No leads to score yet" />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <p className="text-xs text-muted-foreground">
          Every lead is scored 0–100 from <strong>form intent</strong> (source, contact completeness, budget, team
          size) and <strong>on-site behaviour</strong> (product views, cart, checkout, recency) joined from telemetry.
        </p>
        {seeded && <SeedBadge label="seed leads" />}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {GRADES.map((g) => (
          <StatCard
            key={g}
            label={`Grade ${g}`}
            value={dist[g]}
            tone={g === "A" ? "ok" : g === "D" ? "down" : g === "C" ? "warn" : "default"}
            hint={
              g === "A" ? "75–100 · call now" : g === "B" ? "55–74 · warm" : g === "C" ? "35–54 · nurture" : "0–34 · cold"
            }
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> Avg form intent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">{avgIntent}/55</div>
            <ScoreMeter value={avgIntent} max={55} className="mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MousePointerClick className="h-4 w-4" /> Avg behaviour
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">{avgBehav}/45</div>
            <ScoreMeter value={avgBehav} max={45} className="mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-warn" /> Hottest lead
            </CardTitle>
          </CardHeader>
          <CardContent>
            {leads[0] && (
              <>
                <div className="font-medium">{leads[0].name || leads[0].email || "Anonymous"}</div>
                <div className="mt-1 flex items-center gap-2">
                  <ScoreBadge score={leads[0].scoring.score} grade={leads[0].scoring.grade} />
                  <SourceBadge source={leads[0].source} />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <THead>
            <TR>
              <TH className="w-10">#</TH>
              <TH>Lead</TH>
              <TH>Source</TH>
              <TH className="text-right">Score</TH>
              <TH className="w-48">Intent / Behaviour</TH>
              <TH>Top signals</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {leads.map((l, i) => {
              const status = crm.contacts[contactKey(l)]?.status ?? "new";
              return (
                <TR key={l.id}>
                  <TD className="tabular-nums text-muted-foreground">{i + 1}</TD>
                  <TD>
                    <div className="font-medium">{l.name || "Anonymous"}</div>
                    <div className="text-[11px] text-muted-foreground">{l.email || l.company || "—"}</div>
                  </TD>
                  <TD>
                    <SourceBadge source={l.source} />
                  </TD>
                  <TD className="text-right">
                    <ScoreBadge score={l.scoring.score} grade={l.scoring.grade} />
                  </TD>
                  <TD>
                    <div className="flex flex-col gap-1">
                      <ScoreMeter value={l.scoring.intentPoints} max={55} />
                      <ScoreMeter value={l.scoring.behaviorPoints} max={45} />
                    </div>
                  </TD>
                  <TD className="max-w-xs">
                    <div className="flex flex-wrap gap-1">
                      {l.scoring.reasons.slice(0, 3).map((r, ri) => (
                        <span key={ri} className="rounded bg-accent px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {r.label} +{r.points}
                        </span>
                      ))}
                    </div>
                  </TD>
                  <TD>
                    <StatusBadge value={status} />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
