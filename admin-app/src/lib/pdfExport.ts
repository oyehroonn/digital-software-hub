/**
 * pdfExport — shared "Export as PDF" engine for every Analytics / Heatmap /
 * Report view in the admin app.
 *
 * Produces a genuinely STRUCTURED document (branded header, KPI summary
 * drawn as real vector boxes, one or more data tables via jspdf-autotable,
 * paginated footer) — never a screenshot of the screen. Every view builds a
 * small `PdfReport` payload from the SAME data it already renders (its rows,
 * its KPI numbers) and hands it to `exportPdfReport()`; this file owns all
 * layout/branding so every export reads as one consistent, print-ready
 * document regardless of which view produced it.
 *
 * Intentionally dependency-light beyond jsPDF + jspdf-autotable — no canvas
 * capture, no html2canvas. Runs entirely client-side (desktop Tauri shell or
 * the browser build), same-origin-free, no backend involved.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export interface PdfKpi {
  label: string;
  value: string;
  /** Optional one-line caption under the value (e.g. "vs previous period"). */
  sub?: string;
}

export interface PdfTableSection {
  /** Section heading rendered above the table (omit for a single-table report). */
  heading?: string;
  /** Optional one-line note under the heading. */
  note?: string;
  columns: string[];
  rows: (string | number)[][];
  /** 0-based column indices that should right-align (numbers/money/%). */
  rightAlignCols?: number[];
}

export interface PdfReport {
  /** Document + first-page title, e.g. "Click Heatmap Report". */
  title: string;
  /** One-line description of what the report covers. */
  subtitle?: string;
  /** Small meta line under the title — date range, store name, filters, etc. */
  meta?: string;
  /** Headline KPI summary, drawn as bordered stat boxes (max ~6 reads well). */
  kpis?: PdfKpi[];
  /** One or more data tables. */
  tables?: PdfTableSection[];
  /** Download filename (without extension). Defaults to a slug of the title. */
  filename?: string;
}

/* ---------------------------------------------------------------- */
/* Brand palette — print-safe (light background), matches the app's  */
/* existing accent red used across the Dashboard sales trend chart.  */
/* ---------------------------------------------------------------- */

const INK: [number, number, number] = [24, 24, 27];
const MUTED: [number, number, number] = [113, 118, 128];
const FAINT: [number, number, number] = [225, 227, 231];
const ACCENT: [number, number, number] = [214, 72, 61]; // brand red
const ACCENT_SOFT: [number, number, number] = [252, 237, 235];
const HEADER_BG: [number, number, number] = [24, 24, 27];
const HEADER_FG: [number, number, number] = [255, 255, 255];

const BRAND = "DSM AI Labs";
const PAGE_MARGIN = 40;

function slug(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "report";
}

function fmtGeneratedAt(): string {
  return new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Draw the repeating masthead (brand wordmark + generated-at) on a page. */
function drawMasthead(doc: jsPDF, pageWidth: number) {
  doc.setFillColor(...HEADER_BG);
  doc.rect(0, 0, pageWidth, 34, "F");
  doc.setTextColor(...HEADER_FG);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(BRAND, PAGE_MARGIN, 21);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(230, 230, 232);
  doc.text("Admin analytics export", pageWidth - PAGE_MARGIN, 21, { align: "right" });
}

/** Draw the footer (page number + confidentiality line) on a page. */
function drawFooter(doc: jsPDF, pageWidth: number, pageHeight: number, page: number, pages: number) {
  doc.setDrawColor(...FAINT);
  doc.setLineWidth(0.5);
  doc.line(PAGE_MARGIN, pageHeight - 30, pageWidth - PAGE_MARGIN, pageHeight - 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(`${BRAND} — confidential admin export · generated ${fmtGeneratedAt()}`, PAGE_MARGIN, pageHeight - 18);
  doc.text(`Page ${page} of ${pages}`, pageWidth - PAGE_MARGIN, pageHeight - 18, { align: "right" });
}

/** Draw a row of KPI stat boxes; returns the Y position just below them. */
function drawKpis(doc: jsPDF, pageWidth: number, y: number, kpis: PdfKpi[]): number {
  if (!kpis.length) return y;
  const gap = 10;
  const cols = Math.min(kpis.length, 4);
  const boxW = (pageWidth - PAGE_MARGIN * 2 - gap * (cols - 1)) / cols;
  const boxH = 46;
  let rowCount = Math.ceil(kpis.length / cols);
  let cursorY = y;

  for (let r = 0; r < rowCount; r++) {
    const rowItems = kpis.slice(r * cols, r * cols + cols);
    rowItems.forEach((k, i) => {
      const x = PAGE_MARGIN + i * (boxW + gap);
      doc.setDrawColor(...FAINT);
      doc.setLineWidth(0.75);
      doc.roundedRect(x, cursorY, boxW, boxH, 3, 3, "S");
      doc.setFillColor(...ACCENT);
      doc.rect(x, cursorY, boxW, 2.4, "F");

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      const label = doc.splitTextToSize(k.label.toUpperCase(), boxW - 12);
      doc.text(label, x + 8, cursorY + 15);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.setTextColor(...INK);
      doc.text(String(k.value), x + 8, cursorY + 31);

      if (k.sub) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...MUTED);
        doc.text(k.sub, x + 8, cursorY + 40, { maxWidth: boxW - 12 });
      }
    });
    cursorY += boxH + gap;
  }
  return cursorY;
}

/**
 * Build and download a branded, multi-section PDF report. Pure client-side —
 * returns once the file has been handed to the browser/OS save dialog.
 */
export function exportPdfReport(report: PdfReport): void {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();

  drawMasthead(doc, pageWidth);

  let y = 58;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...INK);
  doc.text(report.title, PAGE_MARGIN, y);
  y += 18;

  if (report.subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...MUTED);
    const lines = doc.splitTextToSize(report.subtitle, pageWidth - PAGE_MARGIN * 2);
    doc.text(lines, PAGE_MARGIN, y);
    y += lines.length * 12 + 4;
  }

  const metaLine = [report.meta, `Generated ${fmtGeneratedAt()}`].filter(Boolean).join("   ·   ");
  if (metaLine) {
    doc.setFillColor(...ACCENT_SOFT);
    const boxW = doc.getTextWidth(metaLine) + 16;
    doc.roundedRect(PAGE_MARGIN, y, boxW, 18, 3, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...ACCENT);
    doc.text(metaLine, PAGE_MARGIN + 8, y + 12);
    y += 30;
  } else {
    y += 12;
  }

  if (report.kpis?.length) {
    y = drawKpis(doc, pageWidth, y, report.kpis) + 6;
  }

  for (const section of report.tables ?? []) {
    if (section.heading) {
      if (y > doc.internal.pageSize.getHeight() - 90) {
        doc.addPage();
        y = 50;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...INK);
      doc.text(section.heading, PAGE_MARGIN, y);
      y += 12;
      if (section.note) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...MUTED);
        doc.text(section.note, PAGE_MARGIN, y);
        y += 12;
      }
    }

    if (!section.rows.length) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      doc.text("No rows in the selected range.", PAGE_MARGIN, y + 4);
      y += 22;
      continue;
    }

    const columnStyles: Record<number, { halign: "right" }> = {};
    for (const c of section.rightAlignCols ?? []) columnStyles[c] = { halign: "right" };

    autoTable(doc, {
      startY: y,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: 40 },
      head: [section.columns],
      body: section.rows,
      styles: { font: "helvetica", fontSize: 8.5, textColor: INK, cellPadding: 5, lineColor: FAINT, lineWidth: 0.5 },
      headStyles: { fillColor: HEADER_BG, textColor: HEADER_FG, fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: [247, 247, 248] },
      columnStyles,
      theme: "grid",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 24;
  }

  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    if (p > 1) drawMasthead(doc, pageWidth);
    drawFooter(doc, pageWidth, doc.internal.pageSize.getHeight(), p, pageCount);
  }

  doc.save(`${report.filename ?? slug(report.title)}.pdf`);
}
