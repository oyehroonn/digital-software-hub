/**
 * ExportPdfButton — the one "Export PDF" action used across every Analytics /
 * Heatmap / Report view + the Dashboard. Drop it into a view's header/toolbar
 * with a `build` callback that assembles a `PdfReport` from the data the view
 * already has in memory (its KPIs, its current table rows). The button stays
 * disabled while there is nothing to export, and never blocks the UI — the
 * PDF is generated synchronously on click from data already in memory.
 */
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportPdfReport, type PdfReport } from "@/lib/pdfExport";

export function ExportPdfButton({
  build,
  disabled,
  label = "Export PDF",
  size = "sm",
}: {
  /** Lazily builds the report payload — only called on click. */
  build: () => PdfReport;
  disabled?: boolean;
  label?: string;
  size?: "sm" | "default";
}) {
  return (
    <Button
      variant="outline"
      size={size}
      disabled={disabled}
      onClick={() => exportPdfReport(build())}
      title="Download a formatted PDF report"
    >
      <FileDown className="size-3.5" /> {label}
    </Button>
  );
}
