/**
 * DimTable — the "table" half of every graph+table Sales report.
 *
 * A dimension ranking table with a magnitude meter behind the label and a
 * vs-previous delta chip per row, bound to the `DimRow` shape from ./salesData.
 * Uses the shared table primitives + delta chip so it reads as one system with
 * the rest of the analytics suite.
 */
import type { ReactNode } from "react";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { fmtMoney } from "@/lib/utils";
import { MeterBar } from "../shell";
import { Delta } from "./reportKit";
import type { DimRow } from "./salesData";

const nf = (n: number) => Math.round(n).toLocaleString("en-US");

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

  return (
    <div className="overflow-x-auto">
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
