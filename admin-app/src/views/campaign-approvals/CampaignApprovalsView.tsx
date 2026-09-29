/**
 * Campaign Approvals — the human-approval inbox for the waleed_ai outbound
 * email initiative (see ~/.rpidrive/notes/dsm-waleed-ai-campaign-ops.md).
 *
 * One row per track (A services sequence, B website launch, C cold software
 * suggestion, D cold services credibility), pulled live from
 * `GET /api/campaign-ops/approvals` on dsm-analytics-api — real segment
 * sizes, real subject/body/banner preview, real suppression-filter status.
 * "Approve & Send" is REAL, exactly like Merge Requests' "Approve & Merge to
 * Production": it creates a brand-new, batch-scoped ActiveCampaign list,
 * adds a small (max `max_test_volume`, default 10) set of real, suppression
 * -filtered recipients to it, and sends them a real campaign immediately.
 * There is no simulate/dry-run mode — same philosophy as MergeRequestsView.
 * "Reject" has no side effects; it just records the batch as dismissed.
 *
 * After an approval, the row keeps showing REAL status (sent count,
 * ActiveCampaign campaign id, or the real error) instead of disappearing —
 * this is the inbox-style overview the operator keeps checking back on.
 */
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { cn } from "@/lib/utils";
import {
  approveCampaignBatch,
  dismissCampaignBatch,
  fetchCampaignApprovals,
  type CampaignApprovalsFeed,
  type CampaignTrack,
} from "@/lib/campaignOpsApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Empty } from "@/components/Empty";

function fmt(ts: string | undefined | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

const TRACK_LABEL: Record<string, string> = {
  A_services_sequence: "Track A — Services sequence (warm)",
  B_website_launch: "Track B — Website launch (warm)",
  C_cold_software_suggestion: "Track C — Cold software suggestion",
  D_cold_services_credibility: "Track D — Cold services credibility",
};

function BannerPreview({ html }: { html: string }) {
  if (!html) return null;
  return (
    <div
      className="pointer-events-none overflow-hidden rounded-md border border-border"
      style={{ height: 110 }}
    >
      <div style={{ transform: "scale(0.34)", transformOrigin: "top left", width: "294%" }} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

function TrackCard({
  track,
  config,
  configured,
  onChanged,
}: {
  track: CampaignTrack;
  config: AppConfig;
  configured: boolean;
  onChanged: () => void;
}) {
  const [volume, setVolume] = useState(track.default_test_volume);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState("");

  const lastRun = track.history[0];
  const isSent = lastRun?.status === "sent";
  const isFailed = lastRun?.status === "failed";
  const lastDismissed = track.dismissed[0];
  const isDismissed = !!lastDismissed && (!lastRun || Date.parse(lastDismissed.dismissed_at) > Date.parse(lastRun.requested_at || "0"));

  const clampedVolume = Math.max(1, Math.min(volume || 1, track.max_test_volume));

  async function handleApprove() {
    if (!track.content) return;
    const confirmed = window.confirm(
      `Approve & Send — REAL send\n\n` +
        `Track: ${TRACK_LABEL[track.track_id] ?? track.track_id}\n` +
        `Recipients: ${clampedVolume} real ${track.list_kind} contacts (suppression-filtered${track.suppression_applies ? "" : " — N/A for this track"})\n` +
        `Subject: ${track.content.subject}\n` +
        `Target: a brand-new ActiveCampaign list created just for this batch (list ${track.ac_list_id} "${track.ac_list_name}" is NOT written to directly)\n\n` +
        `This creates real ActiveCampaign contacts and sends them a real email immediately. There is no undo.`,
    );
    if (!confirmed) return;
    setApproving(true);
    setError("");
    try {
      const { result } = await approveCampaignBatch(config, track.track_id, clampedVolume);
      if (result.status !== "sent") {
        setError(result.error || "Send did not complete — see history below.");
      }
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed.");
    } finally {
      setApproving(false);
    }
  }

  async function handleReject() {
    setRejecting(true);
    setError("");
    try {
      await dismissCampaignBatch(config, track.track_id);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reject failed.");
    } finally {
      setRejecting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">{TRACK_LABEL[track.track_id] ?? track.track_id}</CardTitle>
            {isSent && (
              <Badge variant="ok">
                <CheckCircle2 className="mr-1 h-3 w-3" /> Sent
              </Badge>
            )}
            {isFailed && (
              <Badge variant="down">
                <XCircle className="mr-1 h-3 w-3" /> Failed
              </Badge>
            )}
            {isDismissed && !isSent && (
              <Badge variant="muted">Rejected</Badge>
            )}
            {!lastRun && !isDismissed && <Badge variant="warn">Pending approval</Badge>}
          </div>
          <CardDescription className="text-[11px]">{track.purpose}</CardDescription>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          {track.segment_size != null ? `${track.segment_size.toLocaleString()} eligible` : "size unknown"}
          {track.suppression_applies && (
            <Badge variant="muted" className="ml-1" title="Filtered against suppression/outsourced_team_lists_31_32.txt">
              suppression-filtered
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {track.content_error && (
          <div className="rounded-md border border-down/40 bg-down/10 p-2 text-xs text-down">
            Couldn&apos;t load real content: {track.content_error}
          </div>
        )}

        {track.content && (
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <div className="text-sm font-medium">{track.content.subject}</div>
              <div className="mt-1 text-xs text-muted-foreground">{track.content.preview_text}</div>
            </div>
            <div className="w-full sm:w-56">
              <BannerPreview html={track.content.banner_fragment} />
            </div>
          </div>
        )}

        {lastRun && (
          <div
            className={cn(
              "rounded-md border p-2.5 text-xs",
              isSent && "border-ok/30 bg-ok/5",
              isFailed && "border-down/30 bg-down/5",
              lastRun.status === "in_progress" && "border-warn/30 bg-warn/5",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                Last run: {fmt(lastRun.requested_at)} — {lastRun.status}
              </span>
              {isSent && (
                <span className="text-muted-foreground">
                  {lastRun.contacts_added ?? lastRun.selected_count} sent · list {lastRun.ac_list_id} · campaign{" "}
                  {lastRun.ac_campaign_id}
                </span>
              )}
            </div>
            {isSent && (
              <div className="mt-1 text-muted-foreground">
                {lastRun.candidates_matched} candidates matched → {lastRun.suppressed_removed ?? 0} suppressed → {lastRun.selected_count} selected
              </div>
            )}
            {isFailed && lastRun.error && <div className="mt-1 text-down">{lastRun.error}</div>}
          </div>
        )}

        {error && <div className="text-xs text-down">{error}</div>}

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">Test volume (max {track.max_test_volume})</label>
            <Input
              type="number"
              min={1}
              max={track.max_test_volume}
              value={volume}
              onChange={(e) => setVolume(parseInt(e.target.value, 10) || 1)}
              className="h-8 w-24"
              disabled={approving}
            />
          </div>
          <Button
            size="sm"
            disabled={!configured || !track.content || approving || rejecting}
            onClick={() => void handleApprove()}
          >
            {approving ? <Loader2 className="animate-spin" /> : <Send />}
            Approve &amp; Send ({clampedVolume})
          </Button>
          <Button size="sm" variant="outline" disabled={!configured || approving || rejecting} onClick={() => void handleReject()}>
            {rejecting ? <Loader2 className="animate-spin" /> : <XCircle />}
            Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function CampaignApprovalsView({ config }: { config: AppConfig }) {
  const configured = Boolean(config.ecommerce_secret);
  const [feed, setFeed] = useState<CampaignApprovalsFeed | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    if (!configured) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchCampaignApprovals(config);
      setFeed(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load campaign approvals.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.ecommerce_secret]);

  const tracks = feed?.tracks ?? [];
  const anySent = tracks.some((t) => t.history[0]?.status === "sent");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck className="h-5 w-5 text-primary" /> Campaign Approvals
        </h1>
        <p className="max-w-2xl text-xs text-muted-foreground">
          The waleed_ai outbound email initiative&apos;s human-approval inbox. Each row is one
          track&apos;s proposed test batch, pulled live from the campaign-ops status feed — real
          segment size, real subject/body/banner, real suppression-filter status. Approve sends a
          small, real test batch for real; Reject just dismisses it.
        </p>
      </div>

      <div
        className={cn(
          "rounded-md border p-3 text-xs",
          anySent ? "border-warn/40 bg-warn/10 text-warn" : "border-primary/30 bg-primary/5 text-foreground",
        )}
      >
        <div className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {feed?.nothing_sent_disclaimer ||
              "Nothing here is sent automatically, on a timer, or as a side effect of viewing this page. Every batch requires you to click ‘Approve & Send’ yourself."}
          </span>
        </div>
      </div>

      {!configured && (
        <Card>
          <CardContent className="flex items-center gap-2 p-4 text-sm text-warn">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            Set the DSM Analytics API URL and read key in Settings first — this view uses the same
            admin secret as API Access and Merge Requests.
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-down/40">
          <CardContent className="p-4 text-sm text-down">{error}</CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {tracks.length} track{tracks.length === 1 ? "" : "s"}
          {feed?.time && ` · updated ${fmt(feed.time)}`}
        </div>
        <Button size="sm" variant="ghost" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
        </Button>
      </div>

      {configured && tracks.length === 0 && !loading && (
        <Empty
          icon={<AlertTriangle className="h-8 w-8" />}
          title="No tracks found"
          hint="Check that dsm-campaign-ops has real plan.json / content on the VPS."
        />
      )}

      {loading && tracks.length === 0 ? (
        <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading campaign approvals…
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {tracks.map((t) => (
            <TrackCard key={t.track_id} track={t} config={config} configured={configured} onChanged={() => void refresh()} />
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <ExternalLink className="h-3 w-3" />
        Full contract: dsm-campaign-ops/README.md on the VPS · Cherry note dsm-waleed-ai-campaign-ops.md
      </div>
    </div>
  );
}

export default CampaignApprovalsView;
