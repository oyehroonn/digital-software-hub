/**
 * SectionOverview — the generic hub landing page shown at the top of each major
 * section. A short summary plus a card grid linking to every page in the section,
 * so operators land somewhere oriented instead of in a random sub-tool.
 *
 * Analytics opts out (customOverview) and renders its own KPI overview instead.
 */
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/roles";
import { type NavCtx, displayPages } from "./model";

export function SectionOverview({ ctx }: { ctx: NavCtx }) {
  const { section, goto } = ctx;
  const { role } = useSession();
  const pages = displayPages(section, role).filter((p) => p.key !== "overview");
  const SectionIcon = section.icon;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <SectionIcon className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">{section.label}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{section.blurb}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {pages.map((p) => {
          const Icon = p.icon;
          return (
            <button
              key={p.key}
              onClick={() => goto(section.key, p.key)}
              className={cn(
                "group flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors",
                "hover:border-primary/40 hover:bg-accent/40",
              )}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground transition-colors group-hover:bg-primary/15 group-hover:text-primary">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  {p.label}
                  <ArrowRight className="h-3.5 w-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                </div>
                {p.desc && (
                  <div className="mt-0.5 text-xs text-muted-foreground">{p.desc}</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
