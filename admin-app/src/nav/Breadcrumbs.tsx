/**
 * Breadcrumbs — Section › Page trail for the active view. The section crumb is a
 * button that jumps to the section's overview / default page; the page crumb is
 * the current sub-page (omitted for single-page sections).
 */
import { ChevronRight } from "lucide-react";
import type { Section } from "./model";

export function Breadcrumbs({
  section,
  pageLabel,
  onSectionClick,
}: {
  section: Section;
  pageLabel?: string | null;
  onSectionClick: () => void;
}) {
  const Icon = section.icon;
  const showPage = !!pageLabel && !section.singlePage;
  return (
    <nav className="flex items-center gap-1 text-xs text-muted-foreground" aria-label="Breadcrumb">
      <span className="text-muted-foreground/70">DSM Admin</span>
      <ChevronRight className="h-3 w-3 opacity-50" />
      <button
        onClick={onSectionClick}
        className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 font-medium text-foreground hover:bg-accent"
      >
        <Icon className="h-3.5 w-3.5 text-primary" />
        {section.label}
      </button>
      {showPage && (
        <>
          <ChevronRight className="h-3 w-3 opacity-50" />
          <span className="font-medium text-foreground">{pageLabel}</span>
        </>
      )}
    </nav>
  );
}
