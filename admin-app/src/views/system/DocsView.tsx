/**
 * Internal Docs — renders the two DSM infra/API access notes (Cherry notes
 * `dsm-api-access.md` / `dsm-infra-access.md`) as readable pages inside the
 * admin app, next to API Access in Settings.
 *
 * These notes carry real credentials (VPS/SSH root passwords, Cloudflare API
 * token, WooCommerce/ActiveCampaign keys). The `digital-software-hub` repo is
 * PUBLIC, so — same treatment as the migrated-WooCommerce PII in LegacyWoo —
 * the raw files are never committed: `admin-app/public/internal-notes/` is
 * gitignored and `build:admin` rm -rf's it out of the deployed bundle, same
 * as `public/legacy/`. This view only ever finds real content in local dev
 * (`cd admin-app && npm run dev` with the two .md files copied into
 * public/internal-notes/); in the public build it shows the same kind of
 * accurate "not bundled" explanation LegacyWoo shows instead of a crash.
 * Being inside the already Cloudflare-Access-gated /admin area is real
 * defense-in-depth for local/desktop-app use, not a substitute for keeping
 * the raw text out of a public repo's git history.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, FileText, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Empty } from "@/components/Empty";
import { Markdown } from "@/lib/markdown";

interface Doc {
  key: string;
  file: string;
  label: string;
  desc: string;
}

const DOCS: Doc[] = [
  {
    key: "api-access",
    file: "dsm-api-access.md",
    label: "API & Data Access",
    desc: "DSM product/analytics APIs, WooCommerce, ActiveCampaign, GA4 — endpoints and credentials.",
  },
  {
    key: "infra-access",
    file: "dsm-infra-access.md",
    label: "Infrastructure & Code Access",
    desc: "Server/SSH access, GitHub, live web properties, backend services, Cloudflare.",
  },
];

type LoadState = { status: "loading" } | { status: "unavailable" } | { status: "error"; message: string } | { status: "ok"; text: string };

export function DocsView() {
  const [active, setActive] = useState<string>(DOCS[0].key);
  const [state, setState] = useState<Record<string, LoadState>>({});

  const load = async (doc: Doc) => {
    setState((s) => ({ ...s, [doc.key]: { status: "loading" } }));
    try {
      const base = import.meta.env.BASE_URL || "/";
      const r = await fetch(`${base}internal-notes/${doc.file}`);
      if (!r.ok) {
        setState((s) => ({ ...s, [doc.key]: { status: "unavailable" } }));
        return;
      }
      const ct = r.headers.get("content-type") || "";
      // The SPA fallback serves index.html (200, text/html) for any
      // unmatched static path — same failure mode as the legacy JSON export,
      // catch it the same way instead of rendering raw HTML as "docs".
      if (ct.includes("text/html")) {
        setState((s) => ({ ...s, [doc.key]: { status: "unavailable" } }));
        return;
      }
      const text = await r.text();
      if (/^\s*<!doctype html/i.test(text)) {
        setState((s) => ({ ...s, [doc.key]: { status: "unavailable" } }));
        return;
      }
      setState((s) => ({ ...s, [doc.key]: { status: "ok", text } }));
    } catch (e) {
      setState((s) => ({
        ...s,
        [doc.key]: { status: "error", message: e instanceof Error ? e.message : String(e) },
      }));
    }
  };

  useEffect(() => {
    for (const d of DOCS) void load(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doc = DOCS.find((d) => d.key === active) ?? DOCS[0];
  const s = state[doc.key];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Internal Docs</h1>
        <p className="text-xs text-muted-foreground">
          Read-only view of the DSM infra/API access notes — local dev only (see note below);
          reached exclusively through this Cloudflare-Access-gated admin area.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {DOCS.map((d) => (
          <button
            key={d.key}
            onClick={() => setActive(d.key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              d.key === active
                ? "border-primary/50 bg-primary/15 text-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
            )}
          >
            <FileText className="h-3.5 w-3.5" />
            {d.label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-foreground">{doc.label}</div>
              <div className="text-[11px] text-muted-foreground">
                {doc.desc} · <code className="rounded bg-muted px-1 py-0.5">{doc.file}</code>
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => void load(doc)} disabled={s?.status === "loading"}>
              <RefreshCw className={s?.status === "loading" ? "animate-spin" : ""} /> Refresh
            </Button>
          </div>

          {!s || s.status === "loading" ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading {doc.file}…
            </div>
          ) : s.status === "unavailable" ? (
            <Empty
              icon={<AlertTriangle className="size-5" />}
              title="Not bundled in this deployment"
              hint={`Like the migrated WooCommerce export, ${doc.file} contains real credentials and is deliberately excluded from the public admin build (the digital-software-hub repo is public — see admin-app/public/internal-notes/ in .gitignore). Run the admin locally (cd admin-app && npm run dev) with the Cherry note copied to public/internal-notes/${doc.file} to view it.`}
            />
          ) : s.status === "error" ? (
            <Empty icon={<AlertTriangle className="size-5" />} title="Couldn't load this doc" hint={s.message} />
          ) : (
            <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-border/70 bg-card/40 p-4">
              <Markdown content={s.text} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
