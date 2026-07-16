import { useState } from "react";
import {
  Apple,
  Boxes,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Github,
  Info,
  MonitorDown,
  MousePointerClick,
  Settings2,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { runtime } from "@/lib/rpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/* ------------------------------------------------------------------ *
 * Build facts (kept in sync with package.json / tauri.conf.json /
 * DESKTOP_APP.md). Bump `APP_VERSION` when you cut a new bundle.
 * ------------------------------------------------------------------ */
const APP_VERSION = "0.1.0";
const BUNDLE_ID = "ai.aljashtrading.dsm.admin";
const DMG_ARCH = "aarch64";
const DMG_NAME = `DSM Admin_${APP_VERSION}_${DMG_ARCH}.dmg`;
const DMG_BUNDLE_PATH = `admin-app/src-tauri/target/release/bundle/dmg/${DMG_NAME}`;
const DMG_DESKTOP_PATH = `~/Desktop/${DMG_NAME}`;
const MSI_NAME = `DSM Admin_${APP_VERSION}_x64_en-US.msi`;
const EXE_NAME = `DSM Admin_${APP_VERSION}_x64-setup.exe`;

/* ------------------------------------------------------------------ */

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1600);
    } catch {
      /* clipboard blocked — no-op, text is still visible on screen */
    }
  }
  return { copied, copy };
}

function CopyButton({
  text,
  id,
  copied,
  copy,
  label = "Copy",
}: {
  text: string;
  id: string;
  copied: string | null;
  copy: (t: string, id: string) => void;
  label?: string;
}) {
  const done = copied === id;
  return (
    <Button variant="outline" size="sm" onClick={() => copy(text, id)} className="shrink-0">
      {done ? <Check className="text-ok" /> : <Copy />}
      {done ? "Copied" : label}
    </Button>
  );
}

/** A shell / config code block with a one-click copy of the whole thing. */
function CodeBlock({
  title,
  code,
  id,
  copied,
  copy,
  lang,
}: {
  title?: string;
  code: string;
  id: string;
  copied: string | null;
  copy: (t: string, id: string) => void;
  lang?: string;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-muted/40">
      <div className="flex items-center justify-between border-b border-border/70 bg-muted/60 px-2.5 py-1.5">
        <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
          <Terminal className="h-3.5 w-3.5" />
          {title ?? lang ?? "shell"}
        </div>
        <CopyButton text={code} id={id} copied={copied} copy={copy} />
      </div>
      <pre className="overflow-x-auto p-3 text-[11px] leading-relaxed">
        <code className="font-mono text-foreground/90">{code}</code>
      </pre>
    </div>
  );
}

/** One big, friendly numbered step — no code, no jargon. */
function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
        {n}
      </span>
      <span className="pt-0.5 text-sm leading-relaxed text-foreground/90">{children}</span>
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * Advanced (developer) content — collapsed by default so the simple
 * install path stays front and center.
 * ------------------------------------------------------------------ */

const MAC_BUILD = `cd ~/Desktop/waleed_codes/p83/admin-app
npm install            # first time only
npm run tauri:build`;

const WIN_BUILD = `# install: Node LTS, Rust (rustup),
# and "Desktop development with C++" (VS Build Tools)
cd admin-app
npm install
npm run tauri:build`;

const CI_WORKFLOW = `name: build-desktop
on: { workflow_dispatch: {} }
jobs:
  build:
    strategy: { matrix: { os: [macos-latest, windows-latest] } }
    runs-on: \${{ matrix.os }}
    defaults: { run: { working-directory: admin-app } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - uses: dtolnay/rust-toolchain@stable
      - run: npm install
      - run: npm run tauri:build
      - uses: actions/upload-artifact@v4
        with:
          name: dsm-admin-\${{ matrix.os }}
          path: |
            admin-app/src-tauri/target/release/bundle/dmg/*.dmg
            admin-app/src-tauri/target/release/bundle/msi/*.msi
            admin-app/src-tauri/target/release/bundle/nsis/*.exe`;

const FIRST_RUN = [
  {
    label: "VPS base",
    value: "https://dsm-api.techrealm.ai",
    note: "products / search / AI (unstable — Products queues edits when down)",
  },
  {
    label: "Ecommerce URL + secret",
    value: "Apps Script exec URL + API secret",
    note: "orders / telemetry — the stable backend (pre-filled)",
  },
  {
    label: "Telemetry / Orders sheet IDs",
    value: "1MZykNN5r-…  /  1BeHD5fa6ve…",
    note: "heatmaps + orders (pre-filled)",
  },
  { label: "codex / simli keys", value: "optional", note: "health board only" },
];

/* ------------------------------------------------------------------ */

type Props = {
  /** Optional — only used to hint whether the viewer is already inside the desktop shell. */
  config?: AppConfig;
};

export function DesktopAppView(_props: Props = {}) {
  const { copied, copy } = useCopy();
  const inDesktop = runtime.isTauri;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">Get the DSM Admin app</h1>
            <Badge variant="muted">v{APP_VERSION}</Badge>
          </div>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">
            The admin as a native desktop app. Install in under a minute — no
            terminal, no commands. It keeps working even when the VPS is down:
            Orders &amp; Analytics read Google Sheets directly and product edits
            queue offline, then auto-push when the API returns.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Badge variant="ok" className="gap-1">
            <Apple className="h-3.5 w-3.5" /> macOS · ready
          </Badge>
          <Badge variant="warn" className="gap-1">
            <MonitorDown className="h-3.5 w-3.5" /> Windows · via CI
          </Badge>
        </div>
      </div>

      {inDesktop && (
        <div className="flex items-center gap-2 rounded-md border border-ok/40 bg-ok/10 px-3 py-2 text-xs text-ok">
          <CheckCircle2 className="h-4 w-4" />
          You&apos;re already running the desktop app (v{APP_VERSION}). Nothing to install.
        </div>
      )}

      {/* ── SIMPLE INSTALL — front and center, no commands ─────────────── */}
      <Card className="border-primary/30">
        <CardHeader className="flex-row items-center gap-2">
          <MousePointerClick className="h-4 w-4 text-primary" />
          <CardTitle>Install on this Mac — 3 clicks</CardTitle>
          <Badge variant="ok">No terminal needed</Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <CardDescription>
            The installer is already built and sitting on this Mac&apos;s Desktop.
            You just open it and drag the app across.
          </CardDescription>

          <ol className="flex flex-col gap-3">
            <Step n={1}>
              On your Desktop, find{" "}
              <strong className="text-foreground">{DMG_NAME}</strong> and
              double-click it. A window opens.
            </Step>
            <Step n={2}>
              Drag the <strong className="text-foreground">DSM Admin</strong> icon
              onto the <strong className="text-foreground">Applications</strong>{" "}
              folder shown next to it.
            </Step>
            <Step n={3}>
              Open <strong className="text-foreground">DSM Admin</strong> from
              Launchpad or Spotlight (⌘-Space, type “DSM”).
            </Step>
          </ol>

          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              First time only: if macOS says{" "}
              <em>“unidentified developer”</em>, right-click the app and choose{" "}
              <strong>Open</strong> (or System Settings › Privacy &amp; Security ›{" "}
              <strong>Open Anyway</strong>). This is normal for an in-house app.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Download className="h-3.5 w-3.5" /> Can&apos;t find it? Copy the location:
            </span>
            <CopyButton
              text={DMG_DESKTOP_PATH}
              id="dmg-desktop"
              copied={copied}
              copy={copy}
              label="Copy Desktop path"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Windows — simple ───────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <MonitorDown className="h-4 w-4" />
            <CardTitle>Install on Windows</CardTitle>
            <Badge variant="warn">Built via CI</Badge>
          </div>
          <span className="text-[11px] text-muted-foreground">x64 · .msi / .exe</span>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <CardDescription>
            A Mac can&apos;t build the Windows installer, so it&apos;s produced by
            the one-click GitHub Actions build (in Advanced below). Once it&apos;s
            downloaded:
          </CardDescription>
          <ol className="flex flex-col gap-3">
            <Step n={1}>
              Double-click{" "}
              <strong className="text-foreground">{MSI_NAME}</strong> (or{" "}
              <strong className="text-foreground">{EXE_NAME}</strong>).
            </Step>
            <Step n={2}>Click through the installer wizard — Next, Next, Install.</Step>
            <Step n={3}>
              Open <strong className="text-foreground">DSM Admin</strong> from the
              Start menu.
            </Step>
          </ol>
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              First time only: if Windows SmartScreen appears, click{" "}
              <strong>More info › Run anyway</strong>.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── First-run config — reassuring, mostly pre-filled ───────────── */}
      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <Settings2 className="h-4 w-4" />
          <CardTitle>After it opens</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <CardDescription>
            Most settings are already filled in — you can usually just start using
            it. If you ever need to change a backend, it&apos;s under the{" "}
            <strong>Settings</strong> tab (stored on your computer, never shared).
          </CardDescription>
          <div className="flex flex-col divide-y divide-border/70 rounded-md border border-border">
            {FIRST_RUN.map((f) => (
              <div
                key={f.label}
                className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-baseline sm:gap-3"
              >
                <div className="w-52 shrink-0 text-xs font-medium">{f.label}</div>
                <div className="min-w-0 flex-1">
                  <code className="font-mono text-[11px] text-foreground/90">{f.value}</code>
                  <div className="text-[11px] text-muted-foreground">{f.note}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── ADVANCED (developers) — collapsed by default ───────────────── */}
      <details className="group rounded-lg border border-border bg-card">
        <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground">
          <Boxes className="h-4 w-4" />
          Advanced — build it yourself &amp; CI (for developers)
          <span className="ml-auto text-[11px] text-muted-foreground group-open:hidden">
            Show
          </span>
          <span className="ml-auto hidden text-[11px] text-muted-foreground group-open:inline">
            Hide
          </span>
        </summary>

        <div className="flex flex-col gap-5 border-t border-border px-4 py-4">
          {/* Build from source */}
          <div className="flex flex-col gap-3">
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
              Prereqs (once): <strong>Node 18+</strong> &amp; npm, <strong>Rust</strong>{" "}
              (<code className="font-mono">rustup</code>). The Tauri CLI ships as a
              repo dev-dependency — <code className="font-mono">npm run tauri:build</code>{" "}
              invokes it. Bundle id <code className="font-mono">{BUNDLE_ID}</code>.
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <Apple className="h-4 w-4" /> macOS
                </div>
                <CodeBlock title="macOS build (sh)" code={MAC_BUILD} id="mac-build" copied={copied} copy={copy} />
                <p className="text-[11px] text-muted-foreground">
                  Output → <code className="font-mono">…/bundle/dmg/{DMG_NAME}</code>
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <MonitorDown className="h-4 w-4" /> Windows (on a Windows PC)
                </div>
                <CodeBlock title="Windows build (powershell)" code={WIN_BUILD} id="win-build" copied={copied} copy={copy} />
                <p className="text-[11px] text-muted-foreground">
                  Output → <code className="font-mono">…/bundle/msi/{MSI_NAME}</code>
                </p>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Built <code className="font-mono">.dmg</code> also lives at{" "}
              <code className="font-mono">{DMG_BUNDLE_PATH}</code>.
            </p>
          </div>

          {/* CI workflow */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-xs font-medium">
              <Github className="h-4 w-4" />
              GitHub Actions — build both platforms (no Windows PC needed)
            </div>
            <CardDescription>
              Commit this workflow, then Actions tab → <strong>build-desktop</strong> →
              Run workflow. It builds on macOS + Windows and uploads the{" "}
              <code className="font-mono">.dmg</code> +{" "}
              <code className="font-mono">.msi</code>/<code className="font-mono">.exe</code>{" "}
              as artifacts.
            </CardDescription>
            <CodeBlock title=".github/workflows/desktop.yml" code={CI_WORKFLOW} id="ci-yml" copied={copied} copy={copy} />
          </div>

          {/* Signing */}
          <div className="flex flex-col gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground/90">
              <ShieldCheck className="h-4 w-4 text-ok" /> Signing (optional — for wider distribution)
            </div>
            <div className="flex items-start gap-2">
              <Apple className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <strong className="text-foreground/90">macOS:</strong> Apple Developer ID cert →{" "}
                <code className="font-mono">bundle.macOS.signingIdentity</code> + notarize with{" "}
                <code className="font-mono">xcrun notarytool</code>.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <MonitorDown className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <strong className="text-foreground/90">Windows:</strong> an Authenticode cert →{" "}
                <code className="font-mono">bundle.windows.certificateThumbprint</code>.
              </span>
            </div>
            <p className="pt-1">
              Unsigned builds run fine; signing only removes the OS
              &quot;unidentified developer&quot; prompt.
            </p>
            <a
              href="https://tauri.app/distribute/"
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex w-fit items-center gap-1.5 text-[11px] font-medium text-primary hover:underline"
            >
              Tauri distribution docs <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </details>
    </div>
  );
}

export default DesktopAppView;
