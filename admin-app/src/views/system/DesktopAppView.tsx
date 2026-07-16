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
  HardDriveDownload,
  Info,
  MonitorDown,
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
      /* clipboard blocked — no-op, path is still visible on screen */
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
    <Button
      variant="outline"
      size="sm"
      onClick={() => copy(text, id)}
      className="shrink-0"
    >
      {done ? <Check className="text-ok" /> : <Copy />}
      {done ? "Copied" : label}
    </Button>
  );
}

/** A monospace path / filename chip with an inline copy button. */
function PathRow({
  path,
  id,
  copied,
  copy,
}: {
  path: string;
  id: string;
  copied: string | null;
  copy: (t: string, id: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5">
      <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/90">
        {path}
      </code>
      <CopyButton text={path} id={id} copied={copied} copy={copy} />
    </div>
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

/* ------------------------------------------------------------------ *
 * Content lifted from admin-app/DESKTOP_APP.md so the page is the
 * single source of truth operators see inside the admin.
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

const MAC_INSTALL_STEPS = [
  `Open ${DMG_NAME} (double-click).`,
  "Drag DSM Admin into the Applications folder.",
  "Launch DSM Admin from Applications / Spotlight.",
  'First launch may warn "unidentified developer" (the build is unsigned) → right-click the app → Open, or System Settings › Privacy & Security › Open Anyway.',
];

const WIN_INSTALL_STEPS = [
  `Download the ${MSI_NAME} (or ${EXE_NAME}) artifact.`,
  "Run the installer and click through the wizard.",
  "Launch DSM Admin from the Start menu.",
  'SmartScreen may flag the unsigned build → More info › Run anyway.',
];

const FIRST_RUN = [
  {
    label: "VPS base",
    value: "https://dsm-api.techrealm.ai",
    note: "products / search / AI (unstable — Products queues edits when down)",
  },
  {
    label: "Ecommerce URL + secret",
    value: "Apps Script exec URL + API secret",
    note: "orders / telemetry — the stable backend",
  },
  {
    label: "Telemetry / Orders sheet IDs",
    value: "1MZykNN5r-…  /  1BeHD5fa6ve…",
    note: "heatmaps + orders (share sheet: anyone-with-link Viewer)",
  },
  {
    label: "codex / simli keys",
    value: "optional",
    note: "health board only",
  },
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
      {/* Header + version / platform status */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">Desktop App &amp; Docs</h1>
            <Badge variant="muted">v{APP_VERSION}</Badge>
          </div>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">
            The DSM admin as a native desktop app (Tauri — Rust shell + this same
            React/TS stack). It runs even when the VPS is down: Orders &amp;
            Analytics read the Google Sheets directly, product edits queue
            offline and auto-push when the API returns.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Badge variant="ok" className="gap-1">
            <Apple className="h-3.5 w-3.5" /> macOS · built
          </Badge>
          <Badge variant="warn" className="gap-1">
            <MonitorDown className="h-3.5 w-3.5" /> Windows · via CI
          </Badge>
        </div>
      </div>

      {inDesktop && (
        <div className="flex items-center gap-2 rounded-md border border-ok/40 bg-ok/10 px-3 py-2 text-xs text-ok">
          <CheckCircle2 className="h-4 w-4" />
          You&apos;re running inside the desktop app (v{APP_VERSION}). Nice.
        </div>
      )}

      {/* Downloads: Mac (built) + Windows (CI) side by side */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* macOS */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Apple className="h-4 w-4" />
              <CardTitle>macOS</CardTitle>
              <Badge variant="ok">Built</Badge>
            </div>
            <span className="text-[11px] text-muted-foreground">
              {DMG_ARCH} · {(6471498 / 1024 / 1024).toFixed(1)} MB
            </span>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <CardDescription>
              A signed-locally <code className="font-mono">.dmg</code> is already
              built. A copy sits on this Mac&apos;s Desktop — copy either path,
              open the disk image and drag <strong>DSM Admin</strong> to
              Applications.
            </CardDescription>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <Download className="h-3.5 w-3.5" /> Desktop copy (fastest)
              </div>
              <PathRow
                path={DMG_DESKTOP_PATH}
                id="dmg-desktop"
                copied={copied}
                copy={copy}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <HardDriveDownload className="h-3.5 w-3.5" /> In the build tree
              </div>
              <PathRow
                path={DMG_BUNDLE_PATH}
                id="dmg-bundle"
                copied={copied}
                copy={copy}
              />
            </div>

            <ol className="mt-1 flex list-decimal flex-col gap-1.5 pl-5 text-xs text-muted-foreground">
              {MAC_INSTALL_STEPS.map((s, i) => (
                <li key={i} className="leading-relaxed">
                  {s}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        {/* Windows */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <MonitorDown className="h-4 w-4" />
              <CardTitle>Windows</CardTitle>
              <Badge variant="warn">Build via CI</Badge>
            </div>
            <span className="text-[11px] text-muted-foreground">
              x64 · .msi / .exe
            </span>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <CardDescription>
              Tauri can&apos;t cross-compile Windows from a Mac. Build it on a
              Windows PC, or push and run the GitHub Actions workflow below — no
              Windows machine needed — then download the artifact.
            </CardDescription>

            <div className="flex flex-col gap-1.5">
              <div className="text-[11px] font-medium text-muted-foreground">
                Installer artifacts produced
              </div>
              <PathRow
                path={`…/bundle/msi/${MSI_NAME}`}
                id="win-msi"
                copied={copied}
                copy={copy}
              />
              <PathRow
                path={`…/bundle/nsis/${EXE_NAME}`}
                id="win-exe"
                copied={copied}
                copy={copy}
              />
            </div>

            <ol className="mt-1 flex list-decimal flex-col gap-1.5 pl-5 text-xs text-muted-foreground">
              {WIN_INSTALL_STEPS.map((s, i) => (
                <li key={i} className="leading-relaxed">
                  {s}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      {/* Build from source */}
      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <Boxes className="h-4 w-4" />
          <CardTitle>Build from source</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
            Prereqs (once): <strong>Node 18+</strong> &amp; npm,{" "}
            <strong>Rust</strong> (<code className="font-mono">rustup</code>). The
            Tauri CLI ships as a repo dev-dependency —{" "}
            <code className="font-mono">npm run tauri:build</code> invokes it.
            Bundle id <code className="font-mono">{BUNDLE_ID}</code>.
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <Apple className="h-4 w-4" /> macOS
              </div>
              <CodeBlock
                title="macOS build (sh)"
                code={MAC_BUILD}
                id="mac-build"
                copied={copied}
                copy={copy}
              />
              <p className="text-[11px] text-muted-foreground">
                Output →{" "}
                <code className="font-mono">…/bundle/macos/DSM Admin.app</code> and{" "}
                <code className="font-mono">…/bundle/dmg/{DMG_NAME}</code>
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <MonitorDown className="h-4 w-4" /> Windows (on a Windows PC)
              </div>
              <CodeBlock
                title="Windows build (powershell)"
                code={WIN_BUILD}
                id="win-build"
                copied={copied}
                copy={copy}
              />
              <p className="text-[11px] text-muted-foreground">
                Output → <code className="font-mono">…/bundle/msi/{MSI_NAME}</code>{" "}
                and <code className="font-mono">…/bundle/nsis/{EXE_NAME}</code>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CI workflow */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Github className="h-4 w-4" />
            <CardTitle>GitHub Actions — build both platforms</CardTitle>
          </div>
          <Badge variant="muted">.github/workflows/desktop.yml</Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <CardDescription>
            Commit this workflow, then Actions tab → <strong>build-desktop</strong>{" "}
            → Run workflow. It builds on <code className="font-mono">macos-latest</code>{" "}
            and <code className="font-mono">windows-latest</code> and uploads the{" "}
            <code className="font-mono">.dmg</code> +{" "}
            <code className="font-mono">.msi</code>/
            <code className="font-mono">.exe</code> as artifacts.
          </CardDescription>
          <CodeBlock
            title="desktop.yml (yaml)"
            code={CI_WORKFLOW}
            id="ci-yml"
            copied={copied}
            copy={copy}
          />
        </CardContent>
      </Card>

      {/* First-run config */}
      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <Settings2 className="h-4 w-4" />
          <CardTitle>First-run configuration</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <CardDescription>
            After launch, open the <strong>Settings</strong> tab and set the
            values below. They&apos;re stored in the OS config dir (never
            committed to git); in the dev browser they fall back to localStorage.
          </CardDescription>
          <div className="flex flex-col divide-y divide-border/70 rounded-md border border-border">
            {FIRST_RUN.map((f) => (
              <div
                key={f.label}
                className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-baseline sm:gap-3"
              >
                <div className="w-52 shrink-0 text-xs font-medium">{f.label}</div>
                <div className="min-w-0 flex-1">
                  <code className="font-mono text-[11px] text-foreground/90">
                    {f.value}
                  </code>
                  <div className="text-[11px] text-muted-foreground">{f.note}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Degrades gracefully: VPS down → Products shows{" "}
              <em>"offline — edits queue"</em>; Orders/Analytics read the Google
              Sheets directly once they&apos;re shared / the read endpoint is
              deployed.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Signing note */}
      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-ok" />
          <CardTitle>Signing (optional — for distribution)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <Apple className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <strong className="text-foreground/90">macOS:</strong> Apple
              Developer ID cert → set{" "}
              <code className="font-mono">bundle.macOS.signingIdentity</code> and
              notarize with <code className="font-mono">xcrun notarytool</code>.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <MonitorDown className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <strong className="text-foreground/90">Windows:</strong> an
              Authenticode cert →{" "}
              <code className="font-mono">bundle.windows.certificateThumbprint</code>.
            </span>
          </div>
          <p className="pt-1">
            Unsigned builds run fine locally; signing only removes the OS
            "unidentified developer" prompt.
          </p>
          <a
            href="https://tauri.app/distribute/"
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex w-fit items-center gap-1.5 text-[11px] font-medium text-primary hover:underline"
          >
            Tauri distribution docs <ExternalLink className="h-3 w-3" />
          </a>
        </CardContent>
      </Card>
    </div>
  );
}

export default DesktopAppView;
