/**
 * Shared UI primitives for the AI-selling views. Enforces the resilience
 * contract at the presentation layer: a single, calm "AI unavailable" state
 * (never a crash, never a raw stack trace) plus a health hook, status pill, a
 * tiny prose renderer for model output, and copy/stat helpers.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { BrainCircuit, Check, Copy, Sparkles, WifiOff } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { ping } from "@/lib/llm";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type LlmStatus = "checking" | "up" | "down";

/** Poll LLM reachability once (and on demand). Never throws. */
export function useLlmHealth(config: AppConfig) {
  const [status, setStatus] = useState<LlmStatus>("checking");
  const alive = useRef(true);

  const recheck = useCallback(async () => {
    setStatus("checking");
    const ok = await ping(config);
    if (alive.current) setStatus(ok ? "up" : "down");
    return ok;
  }, [config]);

  useEffect(() => {
    alive.current = true;
    void recheck();
    return () => {
      alive.current = false;
    };
  }, [recheck]);

  return { status, recheck };
}

export function LlmBadge({ status }: { status: LlmStatus }) {
  const map: Record<LlmStatus, { cls: string; label: string }> = {
    checking: { cls: "border-border bg-muted text-muted-foreground", label: "Checking AI…" },
    up: { cls: "border-transparent bg-ok/15 text-ok", label: "AI online" },
    down: { cls: "border-transparent bg-down/15 text-down", label: "AI offline" },
  };
  const { cls, label } = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium", cls)}>
      <span
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          status === "up" ? "bg-ok" : status === "down" ? "bg-down" : "bg-muted-foreground animate-pulse",
        )}
      />
      {label}
    </span>
  );
}

/** The one and only failure state for every AI feature. Calm, actionable. */
export function AiUnavailable({
  detail,
  onRetry,
  retrying,
}: {
  detail?: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/70 bg-muted/20 px-6 py-14 text-center">
      <WifiOff className="h-8 w-8 text-muted-foreground opacity-70" />
      <div className="text-sm font-medium text-foreground/80">AI is unavailable right now</div>
      <p className="max-w-md text-xs text-muted-foreground">
        The AI model didn&apos;t respond. Your data below is still live — only the AI-written
        insights are paused. {detail ? <span className="opacity-70">({detail})</span> : null}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
          <Sparkles className={retrying ? "animate-pulse" : ""} /> Try AI again
        </Button>
      )}
    </div>
  );
}

export function AiSpinner({ label = "Thinking…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <BrainCircuit className="h-4 w-4 animate-pulse text-primary" />
      <span>{label}</span>
      <span className="inline-flex gap-0.5">
        <Dot d={0} />
        <Dot d={150} />
        <Dot d={300} />
      </span>
    </div>
  );
}

function Dot({ d }: { d: number }) {
  return (
    <span
      className="inline-block h-1 w-1 animate-bounce rounded-full bg-muted-foreground"
      style={{ animationDelay: `${d}ms` }}
    />
  );
}

/** Compact stat tile matching the OrdersView style. */
export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ok" | "warn" | "down" | "primary";
}) {
  const toneCls =
    tone === "ok"
      ? "text-ok"
      : tone === "warn"
        ? "text-warn"
        : tone === "down"
          ? "text-down"
          : tone === "primary"
            ? "text-primary"
            : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-xl font-semibold tabular-nums", toneCls)}>{value}</div>
      {sub && <div className="truncate text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** Copy-to-clipboard button with a 1.5s confirmation flip. */
export function CopyButton({
  text,
  label = "Copy",
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  const onClick = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard may be blocked; ignore */
    }
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  }, [text]);
  return (
    <Button variant="outline" size="sm" onClick={onClick} className={className}>
      {done ? <Check className="text-ok" /> : <Copy />} {done ? "Copied" : label}
    </Button>
  );
}

/**
 * Minimal renderer for model prose: splits on blank lines into paragraphs and
 * turns leading "-" / "•" / "1." lines into bullet lists. No HTML injection —
 * everything is plain text nodes.
 */
export function Prose({ text, className }: { text: string; className?: string }) {
  const blocks = text
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  return (
    <div className={cn("flex flex-col gap-2 text-sm leading-relaxed text-foreground/90", className)}>
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        const isList = lines.every((l) => /^\s*([-•*]|\d+[.)])\s+/.test(l));
        if (isList) {
          return (
            <ul key={i} className="ml-4 flex list-disc flex-col gap-1 marker:text-muted-foreground">
              {lines.map((l, j) => (
                <li key={j}>{l.replace(/^\s*([-•*]|\d+[.)])\s+/, "")}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{block}</p>;
      })}
    </div>
  );
}

/** Risk / priority pill with consistent semantics across the AI views. */
export function LevelPill({ level }: { level: "low" | "medium" | "high" }) {
  const map = {
    high: "border-transparent bg-down/15 text-down",
    medium: "border-transparent bg-warn/15 text-warn",
    low: "border-transparent bg-ok/15 text-ok",
  } as const;
  return (
    <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", map[level])}>
      {level}
    </span>
  );
}
