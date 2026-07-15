/**
 * <DrillLink> — the one primitive that makes any product / page / customer /
 * campaign name clickable and opens the matching drill-down detail view.
 *
 * Drop it around a table cell, a product title, a source name, an email — pass
 * the `to` target and it becomes an inline, keyboard-accessible link that pushes
 * the detail panel. When no DrillDownProvider is mounted it degrades to plain,
 * non-interactive text so reports still render standalone.
 *
 * Convenience wrappers (ProductLink / PageLink / CustomerLink / CampaignLink)
 * spare callers from constructing target objects by hand.
 */
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDrillDown, type DrillTarget } from "./drillContext";

export function DrillLink({
  to,
  children,
  className,
  chevron = false,
  title,
  stopPropagation = true,
}: {
  to: DrillTarget;
  children: ReactNode;
  className?: string;
  /** Show a trailing chevron affordance. */
  chevron?: boolean;
  title?: string;
  stopPropagation?: boolean;
}) {
  const { enabled, open } = useDrillDown();

  if (!enabled) {
    return <span className={className}>{children}</span>;
  }

  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
        open(to);
      }}
      className={cn(
        "group/dl inline-flex max-w-full items-center gap-0.5 rounded text-left font-medium text-foreground underline-offset-2 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/60",
        className,
      )}
    >
      <span className="truncate">{children}</span>
      {chevron && (
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover/dl:translate-x-0.5 group-hover/dl:text-primary" />
      )}
    </button>
  );
}

/* --------------------------- convenience wrappers -------------------------- */

export function ProductLink({
  id,
  name,
  children,
  className,
  chevron,
}: {
  id: string;
  name?: string;
  children?: ReactNode;
  className?: string;
  chevron?: boolean;
}) {
  return (
    <DrillLink to={{ kind: "product", id, name }} className={className} chevron={chevron} title={`Open ${name ?? id}`}>
      {children ?? name ?? id}
    </DrillLink>
  );
}

export function PageLink({
  url,
  title,
  children,
  className,
  chevron,
}: {
  url: string;
  title?: string;
  children?: ReactNode;
  className?: string;
  chevron?: boolean;
}) {
  return (
    <DrillLink to={{ kind: "page", url, title }} className={className} chevron={chevron} title={`Open ${title ?? url}`}>
      {children ?? title ?? url}
    </DrillLink>
  );
}

export function CustomerLink({
  email,
  name,
  children,
  className,
  chevron,
}: {
  email: string;
  name?: string;
  children?: ReactNode;
  className?: string;
  chevron?: boolean;
}) {
  return (
    <DrillLink to={{ kind: "customer", email, name }} className={className} chevron={chevron} title={`Open ${name ?? email}`}>
      {children ?? name ?? email}
    </DrillLink>
  );
}

export function CampaignLink({
  source,
  medium,
  campaign,
  label,
  children,
  className,
  chevron,
}: {
  source?: string;
  medium?: string;
  campaign?: string;
  label?: string;
  children?: ReactNode;
  className?: string;
  chevron?: boolean;
}) {
  return (
    <DrillLink
      to={{ kind: "campaign", source, medium, campaign, label }}
      className={className}
      chevron={chevron}
      title={`Open ${label ?? campaign ?? source ?? "campaign"}`}
    >
      {children ?? label ?? campaign ?? source ?? "(direct)"}
    </DrillLink>
  );
}
