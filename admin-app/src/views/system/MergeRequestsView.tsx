/**
 * Merge Requests — admin view for the Agent File Gateway's STAGING-ONLY
 * deploy infra (stageN branches/worktrees, real staging-subdomain deploys,
 * `POST /api/staging/request` + `POST /api/deploy` on the dsm-files-api
 * gateway). An agent (or a human via the gateway's own HTML UI) requests a
 * staging slot, edits files into it, and deploys it — which lands here as a
 * pending merge request with a real diff and a live staging URL. A DSM
 * admin reviews the diff + staging site, then Approves (real `git merge` to
 * `main`, + a real GitHub push for beta/creatives or a real production
 * `wrangler pages deploy` for agentic/marketing) or Rejects.
 *
 * There is no dry-run/simulate mode — Approve is exactly as real as running
 * the deploy by hand. Same admin-secret gate as ApiAccessView/DocsView
 * (`config.ecommerce_secret`, checked server-side against dsm-files-api's
 * own DSM_ADMIN_KEY) — reachable only by someone who already has admin
 * access, same as every other Settings-adjacent view.
 */
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  GitBranch,
  GitMerge,
  Loader2,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import {
  approveMergeRequest,
  listMergeRequests,
  rejectMergeRequest,
  type MergeRequest,
  type MergeRequestStatus,
} from "@/lib/stagingApi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Empty } from "@/components/Empty";

const STATUS_VARIANT: Record<MergeRequestStatus, "ok" | "muted" | "down" | "warn"> = {
  pending: "warn",
  merged: "ok",
  rejected: "muted",
  failed: "down",
};

const STATUS_ICON: Record<MergeRequestStatus, typeof Clock> = {
  pending: Clock,
  merged: CheckCircle2,
  rejected: XCircle,
  failed: AlertTriangle,
};

function fmt(ts: string | undefined | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function DiffView({ diff }: { diff: string }) {
  if (!diff.trim()) {
    return <div className="p-3 text-xs text-muted-foreground">No diff content.</div>;
  }
  const lines = diff.split("\n");
  return (
    <pre className="max-h-[420px] overflow-auto rounded-md border border-border bg-muted/40 p-3 text-[11px] leading-5">
      {lines.map((line, i) => {
        let cls = "text-muted-foreground";
        if (line.startsWith("+++") || line.startsWith("---")) cls = "text-foreground font-medium";
        else if (line.startsWith("+")) cls = "text-ok";
        else if (line.startsWith("-")) cls = "text-down";
        else if (line.startsWith("@@")) cls = "text-primary";
        else if (line.startsWith("diff --git")) cls = "text-foreground font-semibold";
        return (
          <div key={i} className={cls}>
            {line || " "}
          </div>
        );
      })}
    </pre>
  );
}

function MergeRequestCard({
  mr,
  config,
  configured,
  onChanged,
}: {
  mr: MergeRequest;
  config: AppConfig;
  configured: boolean;
  onChanged: () => void;
}) {
  const [showDiff, setShowDiff] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState("");
  const StatusIcon = STATUS_ICON[mr.status];
  const isPending = mr.status === "pending";
  const isGithubDeployed = mr.workspace === "beta" || mr.workspace === "creatives";

  async function handleApprove() {
    const confirmed = window.confirm(
      `Approve & Merge to Production?\n\n` +
        `Workspace: ${mr.workspace}\nBranch: ${mr.branch} (stage${mr.stage})\n\n` +
        `This is REAL — it merges ${mr.branch} into main and ` +
        `${isGithubDeployed ? "pushes main to GitHub (Cloudflare Pages auto-deploys)" : "deploys main to production via wrangler"}. ` +
        `There is no undo for this action.`,
    );
    if (!confirmed) return;
    setApproving(true);
    setError("");
    try {
      await approveMergeRequest(config, mr.id);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed.");
    } finally {
      setApproving(false);
    }
  }

  async function handleReject() {
    const reason = window.prompt("Reason for rejecting (optional):", "") ?? "";
    setRejecting(true);
    setError("");
    try {
      await rejectMergeRequest(config, mr.id, reason);
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
            <GitBranch className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">
              {mr.workspace} &mdash; {mr.branch}
            </CardTitle>
            <Badge variant={STATUS_VARIANT[mr.status]}>
              <StatusIcon className="mr-1 h-3 w-3" />
              {mr.status}
            </Badge>
          </div>
          <CardDescription className="text-[11px]">
            Requested by token {mr.token_id_prefix} &middot; {fmt(mr.created_at)}
            {mr.ahead != null ? ` · ${mr.ahead} commit${mr.ahead === 1 ? "" : "s"} ahead of main` : ""}
          </CardDescription>
        </div>
        <a
          href={mr.staging_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          {mr.staging_url} <ExternalLink className="h-3 w-3" />
        </a>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {mr.dns_error && (
          <div className="rounded-md border border-warn/40 bg-warn/10 p-2 text-xs text-warn">
            Staging DNS/domain setup had an issue: {mr.dns_error}
          </div>
        )}
        {mr.status === "rejected" && mr.reject_reason && (
          <div className="text-xs text-muted-foreground">Rejected: {mr.reject_reason}</div>
        )}
        {mr.status === "failed" && mr.merge_error && (
          <div className="rounded-md border border-down/40 bg-down/10 p-2 text-xs text-down">{mr.merge_error}</div>
        )}
        {mr.status === "merged" && (
          <div className="rounded-md border border-ok/40 bg-ok/10 p-2 text-xs text-ok">
            Merged to production{mr.resolved_at ? ` · ${fmt(mr.resolved_at)}` : ""}.
          </div>
        )}

        <div>
          <Button size="sm" variant="ghost" onClick={() => setShowDiff((s) => !s)}>
            {showDiff ? "Hide diff" : "Show diff"}
          </Button>
          {showDiff && <div className="mt-2">{<DiffView diff={mr.git_diff} />}</div>}
        </div>

        {error && <div className="text-xs text-down">{error}</div>}

        {isPending && (
          <div className="flex gap-2">
            <Button size="sm" disabled={!configured || approving || rejecting} onClick={() => void handleApprove()}>
              {approving ? <Loader2 className="animate-spin" /> : <GitMerge />}
              Approve &amp; Merge to Production
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!configured || approving || rejecting}
              onClick={() => void handleReject()}
            >
              {rejecting ? <Loader2 className="animate-spin" /> : <XCircle />}
              Reject
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MergeRequestsView({ config }: { config: AppConfig }) {
  const configured = Boolean(config.ecommerce_secret);
  const [rows, setRows] = useState<MergeRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    if (!configured) return;
    setLoading(true);
    setError("");
    try {
      const data = await listMergeRequests(config);
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load merge requests.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.ecommerce_secret]);

  const pending = useMemo(() => rows.filter((r) => r.status === "pending"), [rows]);
  const resolved = useMemo(() => rows.filter((r) => r.status !== "pending"), [rows]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Merge Requests</h1>
        <p className="text-xs text-muted-foreground">
          Staging deploys from the Agent File Gateway, waiting for review. Approve pushes a stageN
          branch to production for real &mdash; there is no simulate mode.
        </p>
      </div>

      {!configured && (
        <Card>
          <CardContent className="flex items-center gap-2 p-4 text-sm text-warn">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            Set the DSM Analytics API URL and read key in Settings first &mdash; this view uses the
            same admin secret as API Access.
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
          {pending.length} pending &middot; {resolved.length} resolved
        </div>
        <Button size="sm" variant="ghost" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
        </Button>
      </div>

      {rows.length === 0 && !loading && (
        <Empty
          title="No merge requests yet"
          hint="Deploy a stageN branch via POST /api/deploy on the Agent File Gateway to see it here."
        />
      )}

      {pending.length > 0 && (
        <div className="flex flex-col gap-3">
          {pending.map((mr) => (
            <MergeRequestCard key={mr.id} mr={mr} config={config} configured={configured} onChanged={() => void refresh()} />
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <details className="rounded-lg border border-border/70">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground">
            {resolved.length} resolved merge request{resolved.length === 1 ? "" : "s"}
          </summary>
          <div className="flex flex-col gap-3 p-3 pt-0">
            {resolved.map((mr) => (
              <MergeRequestCard key={mr.id} mr={mr} config={config} configured={configured} onChanged={() => void refresh()} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
