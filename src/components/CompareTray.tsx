/**
 * CompareTray — the persistent "Compare (n)" trigger + side-by-side drawer.
 *
 * Rendered by <CompareProvider>. Hidden entirely when nothing is flagged for
 * comparison. Opening it reveals a horizontally-scrolling table with one column
 * per product and one row per attribute, so a shopper can weigh 2–4 products at
 * a glance. Purely presentational — reads the compare list from useCompare().
 */

import { useState } from 'react';
import { GitCompareArrows, X } from 'lucide-react';
import { useCompare } from '@/contexts/CompareContext';
import { displayPrice, stockLabel } from '@/lib/product';
import type { Product } from '@/lib/api';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from './ui/drawer';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

interface CompareRow {
  label: string;
  value: (p: Product) => string;
}

const ROWS: CompareRow[] = [
  { label: 'Brand', value: (p) => p.brand || '—' },
  { label: 'Category', value: (p) => p.category || '—' },
  { label: 'License', value: (p) => p.licenseType || '—' },
  { label: 'Price', value: (p) => displayPrice(p) },
  { label: 'Platform', value: (p) => p.platform || '—' },
  { label: 'Validity', value: (p) => p.validity || '—' },
  { label: 'Availability', value: (p) => stockLabel(p) },
  { label: 'Description', value: (p) => p.description || '—' },
];

export default function CompareTray() {
  const { items, count, removeFromCompare, clearCompare } = useCompare();
  const [open, setOpen] = useState(false);

  if (count === 0) return null;

  return (
    <>
      {/* Floating trigger — kept clear of the site's bottom-right chat button. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-track-id="compare-tray-open"
        className="fixed bottom-6 left-6 z-40 flex items-center gap-2 rounded-full bg-crimson px-5 py-3 text-sm font-medium text-[#FEFEFE] shadow-premium-lg transition-all hover:bg-crimson-dark"
        aria-label={`Open comparison drawer with ${count} products`}
      >
        <GitCompareArrows className="h-4 w-4" />
        Compare ({count})
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-h-[85vh] bg-surface-card border-theme">
          <DrawerHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <DrawerTitle className="font-serif text-2xl text-foreground">
                Compare products
              </DrawerTitle>
              <DrawerDescription className="text-sm text-muted-foreground">
                Side-by-side across {count} {count === 1 ? 'product' : 'products'}.
              </DrawerDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={clearCompare}
              className="border-white/[0.08] text-muted-foreground"
            >
              Clear all
            </Button>
          </DrawerHeader>

          <div className="overflow-x-auto px-4 pb-8">
            <table className="w-full min-w-[520px] border-collapse text-left">
              <thead>
                <tr>
                  <th className="w-32 p-3 align-bottom" />
                  {items.map((p) => (
                    <th key={p.id} className="min-w-[180px] p-3 align-bottom">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <Badge
                            variant="outline"
                            className="mb-1 text-[10px] uppercase tracking-wider"
                          >
                            {p.brand}
                          </Badge>
                          <div className="font-medium text-sm text-foreground leading-tight">
                            {p.name}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFromCompare(p.id)}
                          aria-label={`Remove ${p.name} from comparison`}
                          className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-muted-foreground transition-colors hover:bg-white/[0.12] hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.label} className="border-t border-white/[0.06]">
                    <td className="p-3 align-top text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                      {row.label}
                    </td>
                    {items.map((p) => (
                      <td
                        key={p.id}
                        className={
                          row.label === 'Price'
                            ? 'p-3 align-top font-serif text-crimson'
                            : 'p-3 align-top text-sm text-foreground/90'
                        }
                      >
                        {row.value(p)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
