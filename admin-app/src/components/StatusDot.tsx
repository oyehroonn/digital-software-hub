import { cn } from "@/lib/utils";
import type { Health } from "@/lib/health";

const COLOR: Record<Health, string> = {
  up: "bg-ok",
  down: "bg-down",
  unknown: "bg-muted-foreground",
};

export function StatusDot({ health, pulse }: { health: Health; pulse?: boolean }) {
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      {pulse && health === "up" && (
        <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", COLOR[health])} />
      )}
      <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", COLOR[health])} />
    </span>
  );
}
