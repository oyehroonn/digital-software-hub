import { useState } from "react";
import { Save, ShieldCheck } from "lucide-react";
import { saveConfig, type AppConfig } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { runtime } from "@/lib/rpc";

const FIELDS: { key: keyof AppConfig; label: string; secret?: boolean; hint?: string }[] = [
  { key: "ecommerce_url", label: "Ecommerce Apps Script URL" },
  { key: "ecommerce_secret", label: "Ecommerce secret", secret: true, hint: "Gates order/telemetry reads." },
  { key: "telemetry_read_url", label: "Telemetry read-proxy URL", hint: "Optional. Blank = read rows straight from the Apps Script GET." },
  { key: "vps_base", label: "VPS Flask API base", hint: "Unstable — product catalog & box regen." },
  { key: "codex_base", label: "codex-proxy base" },
  { key: "codex_key", label: "codex-proxy key", secret: true },
  { key: "codex_model", label: "codex-proxy model" },
  { key: "simli_base", label: "Simli base" },
  { key: "simli_key", label: "Simli key", secret: true },
  { key: "email_cli", label: "mailcli.py path", hint: "Absolute path to the Email API CLI." },
];

export function SettingsView({
  config,
  onSaved,
}: {
  config: AppConfig;
  onSaved: (c: AppConfig) => void;
}) {
  const [draft, setDraft] = useState<AppConfig>({ ...config });
  const [saved, setSaved] = useState(false);

  async function save() {
    await saveConfig(draft);
    onSaved(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-xs text-muted-foreground">
          Secrets are stored{" "}
          {runtime.isTauri
            ? "in the OS config dir (never committed to git)."
            : "in this browser's localStorage (dev fallback)."}
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-ok" />
          <CardTitle>Backend endpoints & keys</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">{f.label}</span>
              <Input
                type={f.secret ? "password" : "text"}
                value={String(draft[f.key] ?? "")}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                placeholder={f.secret ? "••••••••" : ""}
              />
              {f.hint && <span className="text-[11px] text-muted-foreground">{f.hint}</span>}
            </label>
          ))}
          <div className="mt-2 flex items-center gap-3">
            <Button size="sm" onClick={save}>
              <Save /> Save config
            </Button>
            {saved && <span className="text-xs text-ok">Saved.</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
