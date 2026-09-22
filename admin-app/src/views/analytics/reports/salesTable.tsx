/**
 * DimTable — the "table" half of every graph+table Sales report.
 *
 * A dimension ranking table with a magnitude meter behind the label and a
 * vs-previous delta chip per row, bound to the `DimRow` shape from ./salesData.
 * Uses the shared table primitives + delta chip so it reads as one system with
 * the rest of the analytics suite. Also the single insertion point for
 * "Export PDF" on every report built on top of it (Sales by product / SKU /
 * channel / location / referrer / discount, Taxes, Returns) — one professional,
 * branded PDF covering whatever ranking is currently on screen.
 */
import type { ReactNode } from "react";
import { Download } from "lucide-react";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ExportPdfButton } from "@/components/ExportPdfButton";
import { fmtMoney } from "@/lib/utils";
import type { PdfReport } from "@/lib/pdfExport";
import { MeterBar } from "../shell";
import { Delta } from "./reportKit";
import type { DimRow } from "./salesData";

const nf = (n: number) => Math.round(n).toLocaleString("en-US");

/** Client-side CSV download — generate & save a report with no backend. */
function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type ValueKey = "net" | "gross" | "discounts" | "tax" | "refunds";

export interface ExtraCol {
  header: string;
  align?: "left" | "right";
  render: (row: DimRow, i: number) => ReactNode;
}

export function DimTable({
  rows,
  labelHeader,
  currency = "USD",
  valueKey = "net",
  valueHeader = "Net sales",
  higherIsBetter = true,
  showDelta = true,
  maxRows = 100,
  extraCols,
  emptyLabel = "—",
}: {
  rows: DimRow[];
  labelHeader: string;
  currency?: string;
  valueKey?: ValueKey;
  valueHeader?: string;
  higherIsBetter?: boolean;
  showDelta?: boolean;
  maxRows?: number;
  extraCols?: ExtraCol[];
  emptyLabel?: string;
}) {
  const shown = rows.slice(0, maxRows);
  const max = Math.max(...shown.map((r) => Math.abs(r[valueKey])), 1);
  const money = (v: number) => fmtMoney(v, currency);

  const exportCsv = () => {
    const headers = [labelHeader, valueHeader, "Orders", "Units", "AOV", "Share %", ...(extraCols?.map((c) => c.header) ?? [])];
    const body = shown.map((r) => [
      r.label, Math.round(r[valueKey]), r.orders, r.units, Math.round(r.aov), (r.share * 100).toFixed(1),
    ]);
    downloadCsv(`${labelHeader.toLowerCase().replace(/\s+/g, "-")}-report.csv`, headers, body);
  };

  const buildPdf = (): PdfReport => {
    const totalValue = shown.reduce((a, r) => a + r[valueKey], 0);
    const totalOrders = shown.reduce((a, r) => a + r.orders, 0);
    const top = shown[0];
    return {
      title: `${labelHeader} Report`,
      subtitle: `Full ranking by ${valueHeader.toLowerCase()}, with orders, units, AOV, share of total and the vs-previous-period delta for each row.`,
      meta: `${shown.length} row(s) · currency ${currency}`,
      kpis: [
        { label: valueHeader, value: money(totalValue) },
        { label: "Orders", value: nf(totalOrders) },
        { label: `Distinct ${labelHeader.toLowerCase()}`, value: nf(shown.length) },
        { label: `Top ${labelHeader.toLowerCase()}`, value: top ? top.label.slice(0, 22) : "—", sub: top ? money(top[valueKey]) : undefined },
      ],
      tables: [
        {
          columns: ["#", labelHeader, valueHeader, "Orders", "Units", "AOV", "Share", "Δ vs prev"],
          rows: shown.map((r, i) => [
            i + 1,
            r.label,
            r[valueKey] ? money(r[valueKey]) : emptyLabel,
            nf(r.orders),
            nf(r.units),
            r.orders ? money(r.aov) : emptyLabel,
            `${(r.share * 100).toFixed(1)}%`,
            r.delta == null ? "new" : `${r.delta >= 0 ? "+" : ""}${(r.delta * 100).toFixed(1)}%`,
          ]),
          rightAlignCols: [0, 2, 3, 4, 5, 6, 7],
        },
      ],
      filename: `${labelHeader.toLowerCase().replace(/\s+/g, "-")}-report`,
    };
  };

  return (
    <div className="overflow-x-auto">
      <div className="mb-2 flex justify-end gap-2">
        <ExportPdfButton build={buildPdf} disabled={!shown.length} />
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={!shown.length}>
          <Download className="size-3.5" /> Export CSV
        </Button>
      </div>
      <Table className="min-w-[560px]">
        <THead>
          <TR>
            <TH className="w-8">#</TH>
            <TH>{labelHeader}</TH>
            <TH className="text-right">{valueHeader}</TH>
            <TH className="hidden text-right sm:table-cell">Orders</TH>
            <TH className="hidden text-right md:table-cell">Units</TH>
            <TH className="hidden text-right lg:table-cell">AOV</TH>
            <TH className="hidden text-right xl:table-cell">Share</TH>
            {extraCols?.map((c) => (
              <TH key={c.header} className={c.align === "right" ? "text-right" : undefined}>
                {c.header}
              </TH>
            ))}
            {showDelta && <TH className="text-right">Δ vs prev</TH>}
          </TR>
        </THead>
        <TBody>
          {shown.map((r, i) => {
            const v = r[valueKey];
            return (
              <TR key={r.key} className="hover:bg-accent/30">
                <TD className="text-xs tabular-nums text-muted-foreground">{i + 1}</TD>
                <TD>
                  <div className="max-w-[240px] truncate font-medium text-foreground" title={r.label}>
                    {r.label}
                  </div>
                  <div className="mt-1 max-w-[200px]">
                    <MeterBar value={Math.abs(v)} max={max} tone={v < 0 ? "down" : "ok"} />
                  </div>
                </TD>
                <TD className="text-right font-semibold tabular-nums text-foreground">
                  {v ? money(v) : emptyLabel}
                </TD>
                <TD className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">{nf(r.orders)}</TD>
                <TD className="hidden text-right tabular-nums text-muted-foreground md:table-cell">{nf(r.units)}</TD>
                <TD className="hidden text-right tabular-nums text-muted-foreground lg:table-cell">
                  {r.orders ? money(r.aov) : emptyLabel}
                </TD>
                <TD className="hidden text-right tabular-nums text-muted-foreground xl:table-cell">
                  {(r.share * 100).toFixed(1)}%
                </TD>
                {extraCols?.map((c) => (
                  <TD key={c.header} className={c.align === "right" ? "text-right tabular-nums" : undefined}>
                    {c.render(r, i)}
                  </TD>
                ))}
                {showDelta && (
                  <TD className="text-right">
                    <Delta value={r.delta} higherIsBetter={higherIsBetter} />
                  </TD>
                )}
              </TR>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}
