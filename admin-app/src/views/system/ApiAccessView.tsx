/**
 * API Access — token management for the DSM Analytics API.
 *
 * Replaces handing external agents/sessions the one permanent static secret
 * (`ecommerce_secret` / `VITE_ECOM_SECRET`) with real, revocable tokens:
 *   - short-lived: single-purpose, expires (default 2h) — hand to an agent
 *     for a one-off task.
 *   - always-on: no expiry — for standing integrations.
 * Both work as a drop-in `?secret=<token>` for every read endpoint.
 *
 * Minting/listing/revoking is itself gated by the existing static secret
 * (see lib/apiTokens.ts), which this view already has via `config` — so this
 * page is only reachable by someone who already has admin access, same as
 * every other Settings-adjacent view.
 */
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Copy,
  HardDrive,
  Infinity as InfinityIcon,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import {
  ANALYTICS_DOC_URL,
  FILES_DOC_URL,
  filesystemUsageSnippet,
  listTokens,
  mintAgentBundle,
  mintToken,
  revokeToken,
  usageSnippet,
  type MintedToken,
  type TokenRecord,
  type TokenType,
} from "@/lib/apiTokens";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

const STATUS_VARIANT: Record<TokenRecord["status"], "ok" | "muted" | "down"> = {
  active: "ok",
  expired: "muted",
  revoked: "down",
};

function fmt(ts: string | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

export function ApiAccessView({ config }: { config: AppConfig }) {
  const configured = Boolean(config.ecommerce_url && config.ecommerce_secret);

  const [tokens, setTokens] = useState<TokenRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [label, setLabel] = useState("");
  const [minting, setMinting] = useState<TokenType | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [justMinted, setJustMinted] = useState<MintedToken | null>(null);
  const [copied, setCopied] = useState(false);

  // Agent bundle — mints a filesystem token (all 4 workspaces, read+create+
  // write+rename, no delete) and an analytics token together, added
  // 2026-09-24 alongside the dsm-files Agent File Gateway. Additive: the
  // single-token flow above still works unchanged for anything that only
  // needs one token type.
  const [bundleLabel, setBundleLabel] = useState("");
  const [bundleMinting, setBundleMinting] = useState<TokenType | null>(null);
  const [bundleResult, setBundleResult] = useState<{ filesystem: MintedToken; analytics: MintedToken } | null>(
    null,
  );
  const [bundleCopied, setBundleCopied] = useState<{ filesystem: boolean; analytics: boolean }>({
    filesystem: false,
    analytics: false,
  });

  async function refresh() {
    if (!configured) return;
    setLoading(true);
    setError("");
    try {
      const rows = await listTokens(config);
      setTokens(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tokens.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.ecommerce_url, config.ecommerce_secret]);

  async function handleMint(type: TokenType) {
    setMinting(type);
    setError("");
    try {
      const minted = await mintToken(config, type, label.trim());
      setJustMinted(minted);
      setLabel("");
      setCopied(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to mint token.");
    } finally {
      setMinting(null);
    }
  }

  async function handleRevoke(id: string) {
    setRevoking(id);
    setError("");
    try {
      await revokeToken(config, id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke token.");
    } finally {
      setRevoking(null);
    }
  }

  async function copyRawToken() {
    if (!justMinted) return;
    try {
      await navigator.clipboard.writeText(justMinted.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard permissions can fail silently; the box below is selectable text */
    }
  }

  async function handleMintBundle(type: TokenType) {
    setBundleMinting(type);
    setError("");
    try {
      const result = await mintAgentBundle(config, type, bundleLabel.trim() || "agent bundle");
      setBundleResult(result);
      setBundleLabel("");
      setBundleCopied({ filesystem: false, analytics: false });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to mint agent bundle.");
    } finally {
      setBundleMinting(null);
    }
  }

  function expiryLine(t: MintedToken): string {
    return t.expires_at ? `Expires ${fmt(t.expires_at)}.` : "No expiry.";
  }

  async function copyBundleBlock(kind: "filesystem" | "analytics", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setBundleCopied((prev) => ({ ...prev, [kind]: true }));
      setTimeout(() => setBundleCopied((prev) => ({ ...prev, [kind]: false })), 2000);
    } catch {
      /* clipboard permissions can fail silently; the box below is selectable text */
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">API Access</h1>
        <p className="text-xs text-muted-foreground">
          Issue scoped, revocable tokens for the DSM Analytics API instead of handing out the
          permanent static read key. Both token types are a drop-in replacement for{" "}
          <code className="rounded bg-muted px-1 py-0.5">?secret=</code>.
        </p>
      </div>

      {!configured && (
        <Card>
          <CardContent className="flex items-center gap-2 p-4 text-sm text-warn">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            Set the DSM Analytics API URL and read key in Settings first — token management needs
            the existing static secret to authenticate.
          </CardContent>
        </Card>
      )}

      {justMinted && (
        <Card className="border-ok/40">
          <CardHeader className="flex-row items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-ok" />
            <CardTitle>Token created — copy it now</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-xs text-warn">
              This is the only time the full value is shown. It is not stored anywhere recoverable
              — if you lose it, revoke this token and mint a new one.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 select-all overflow-x-auto rounded-md border border-border bg-muted px-3 py-2 text-xs">
                {justMinted.token}
              </code>
              <Button size="sm" variant="outline" onClick={copyRawToken}>
                <Copy /> {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <div>
              <span className="text-xs font-medium text-muted-foreground">Usage example</span>
              <code className="mt-1 block overflow-x-auto rounded-md border border-border bg-muted px-3 py-2 text-xs">
                {usageSnippet(config, justMinted.token)}
              </code>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{justMinted.label}</span>
              <Badge variant={justMinted.type === "always_on" ? "default" : "warn"}>
                {justMinted.type === "always_on" ? "Always-on" : "Short-lived"}
              </Badge>
              <span>
                {justMinted.expires_at ? `expires ${fmt(justMinted.expires_at)}` : "no expiry"}
              </span>
            </div>
            <div>
              <Button size="sm" variant="ghost" onClick={() => setJustMinted(null)}>
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {bundleResult && (
        <Card className="border-ok/40">
          <CardHeader className="flex-row items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-ok" />
            <CardTitle>Agent bundle created — copy both blocks now</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-xs text-warn">
              These are the only times the full token values are shown. Paste each block into an
              agent's context as-is — it has everything the agent needs (doc + token + what it's for).
            </p>

            {/* Block 1 — Sites & Filesystem Access */}
            <div className="flex flex-col gap-2 rounded-md border border-border p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <HardDrive className="h-4 w-4 text-primary" /> Sites &amp; Filesystem Access
              </div>
              <p className="text-xs text-muted-foreground">
                Lets an AI agent browse and edit DSM&apos;s site source code directly.{" "}
                {expiryLine(bundleResult.filesystem)}
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 select-all overflow-x-auto whitespace-pre-wrap rounded-md border border-border bg-muted px-3 py-2 text-xs">
                  {`Docs: ${FILES_DOC_URL}\nToken: ${bundleResult.filesystem.token}\n\n${filesystemUsageSnippet(bundleResult.filesystem.token)}`}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void copyBundleBlock(
                      "filesystem",
                      `Docs: ${FILES_DOC_URL}\nToken: ${bundleResult.filesystem.token}\n\n${filesystemUsageSnippet(bundleResult.filesystem.token)}`,
                    )
                  }
                >
                  <Copy /> {bundleCopied.filesystem ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>

            {/* Block 2 — Analytics API Access */}
            <div className="flex flex-col gap-2 rounded-md border border-border p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <KeyRound className="h-4 w-4 text-primary" /> Analytics API Access
              </div>
              <p className="text-xs text-muted-foreground">
                Lets an AI agent pull real order, traffic, and GA4 analytics data.{" "}
                {expiryLine(bundleResult.analytics)}
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 select-all overflow-x-auto whitespace-pre-wrap rounded-md border border-border bg-muted px-3 py-2 text-xs">
                  {`Docs: ${ANALYTICS_DOC_URL}\nToken: ${bundleResult.analytics.token}\n\n${usageSnippet(config, bundleResult.analytics.token)}`}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void copyBundleBlock(
                      "analytics",
                      `Docs: ${ANALYTICS_DOC_URL}\nToken: ${bundleResult.analytics.token}\n\n${usageSnippet(config, bundleResult.analytics.token)}`,
                    )
                  }
                >
                  <Copy /> {bundleCopied.analytics ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>

            <div>
              <Button size="sm" variant="ghost" onClick={() => setBundleResult(null)}>
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Mint agent bundle</CardTitle>
          <CardDescription>
            Recommended for AI agents: mints a filesystem token (all 4 site workspaces, read/create/
            write/rename, no delete) and an analytics token together, each with its public doc link —
            ready to paste straight into an agent&apos;s context.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Label</span>
            <Input
              value={bundleLabel}
              onChange={(e) => setBundleLabel(e.target.value)}
              placeholder="What/who is this for?"
              disabled={!configured}
            />
          </label>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!configured || bundleMinting !== null}
              onClick={() => void handleMintBundle("short_lived")}
            >
              {bundleMinting === "short_lived" ? <Loader2 className="animate-spin" /> : <Clock />}
              Short-lived bundle
            </Button>
            <Button
              size="sm"
              disabled={!configured || bundleMinting !== null}
              onClick={() => void handleMintBundle("always_on")}
            >
              {bundleMinting === "always_on" ? <Loader2 className="animate-spin" /> : <InfinityIcon />}
              Always-on bundle
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Generate a single token</CardTitle>
          <CardDescription>
            Analytics-only, in case something still needs just one token (e.g. existing scripts) —
            give it a label so the list below stays meaningful (e.g. "GA4 export agent, 2026-09-24").
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Label</span>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="What/who is this for?"
              disabled={!configured}
            />
          </label>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!configured || minting !== null}
              onClick={() => void handleMint("short_lived")}
            >
              {minting === "short_lived" ? <Loader2 className="animate-spin" /> : <Clock />}
              Short-lived token
            </Button>
            <Button
              size="sm"
              disabled={!configured || minting !== null}
              onClick={() => void handleMint("always_on")}
            >
              {minting === "always_on" ? <Loader2 className="animate-spin" /> : <InfinityIcon />}
              Always-on token
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-down/40">
          <CardContent className="p-4 text-sm text-down">{error}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            <CardTitle>Issued tokens</CardTitle>
          </div>
          <Button size="sm" variant="ghost" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Label</TH>
                <TH>Type</TH>
                <TH>Scope</TH>
                <TH>Created</TH>
                <TH>Expires</TH>
                <TH>Status</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {tokens.length === 0 && (
                <TR>
                  <TD colSpan={7} className="py-6 text-center text-xs text-muted-foreground">
                    {loading ? "Loading…" : "No tokens issued yet."}
                  </TD>
                </TR>
              )}
              {tokens.map((t) => (
                <TR key={t.id}>
                  <TD className="max-w-[220px] truncate" title={t.label}>
                    {t.label}
                  </TD>
                  <TD>
                    <Badge variant={t.type === "always_on" ? "default" : "warn"}>
                      {t.type === "always_on" ? "Always-on" : "Short-lived"}
                    </Badge>
                  </TD>
                  <TD className="whitespace-nowrap text-xs text-muted-foreground">
                    {t.scope === "filesystem" ? "Filesystem" : "Analytics"}
                    {t.workspaces && t.workspaces.length > 0 ? ` (${t.workspaces.join(", ")})` : ""}
                  </TD>
                  <TD className="whitespace-nowrap text-xs text-muted-foreground">
                    {fmt(t.created_at)}
                  </TD>
                  <TD className="whitespace-nowrap text-xs text-muted-foreground">
                    {t.expires_at ? fmt(t.expires_at) : "Never"}
                  </TD>
                  <TD>
                    <Badge variant={STATUS_VARIANT[t.status]}>{t.status}</Badge>
                  </TD>
                  <TD className="text-right">
                    {t.status !== "revoked" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={revoking === t.id}
                        onClick={() => void handleRevoke(t.id)}
                      >
                        {revoking === t.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                        Revoke
                      </Button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
