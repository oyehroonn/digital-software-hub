/**
 * CommandPalette — the global ⌘K / Ctrl-K jump box. Fuzzy-ish filter over the
 * role-filtered search index (every section + every reachable page); Enter or
 * click navigates there. Keyboard: ↑/↓ to move, Enter to open, Esc to close.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/roles";
import { searchIndex, type SearchEntry } from "./model";

export function CommandPalette({
  open,
  onClose,
  onGo,
}: {
  open: boolean;
  onClose: () => void;
  onGo: (sectionKey: string, pageKey?: string) => void;
}) {
  const { role } = useSession();
  const index = useMemo(() => searchIndex(role), [role]);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo<SearchEntry[]>(() => {
    const term = q.trim().toLowerCase();
    if (!term) return index.slice(0, 40);
    const words = term.split(/\s+/);
    return index
      .filter((e) => words.every((w) => e.keywords.includes(w)))
      .slice(0, 40);
  }, [q, index]);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      // Focus after paint.
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [q]);

  if (!open) return null;

  const go = (e?: SearchEntry) => {
    if (!e) return;
    onGo(e.sectionKey, e.pageKey);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(results[active]);
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
            placeholder="Jump to a section or page…"
            className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">
            esc
          </kbd>
        </div>

        <div className="max-h-[46vh] overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">No matches.</div>
          ) : (
            results.map((e, i) => {
              const Icon = e.icon;
              const on = i === active;
              return (
                <button
                  key={`${e.sectionKey}:${e.pageKey ?? "_"}`}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(e)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                    on ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50",
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", on ? "text-primary" : "")} />
                  <span className="font-medium text-foreground">{e.label}</span>
                  <span className="text-xs text-muted-foreground">· {e.section}</span>
                  {on && <CornerDownLeft className="ml-auto h-3.5 w-3.5 text-muted-foreground" />}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
