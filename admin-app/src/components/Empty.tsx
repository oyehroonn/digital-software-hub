import type { ReactNode } from "react";

export function Empty({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 py-16 text-center text-muted-foreground">
      {icon && <div className="opacity-60">{icon}</div>}
      <div className="text-sm font-medium text-foreground/80">{title}</div>
      {hint && <div className="max-w-md text-xs">{hint}</div>}
    </div>
  );
}
