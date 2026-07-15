/**
 * One-click QUOTE EMAIL from an order. Opens with a ready-to-send draft built
 * from the order; an optional "Polish with AI" pass rewrites the body via the
 * LLM (degrades to the template). Send goes through the Email API; copy is
 * always available as a fallback.
 */
import { useEffect, useMemo, useState } from "react";
import { Sparkles, Send, Copy, Loader2 } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import type { Order } from "@/lib/ecommerce";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "./parts";
import {
  quoteTemplate,
  draftWithLLM,
  sendDraft,
  copyToClipboard,
  type Draft,
} from "./orderEmail";
import { patchOverlay, orderKey } from "./ordersData";

export function QuoteComposer({
  config,
  order,
  open,
  onClose,
  onSent,
}: {
  config: AppConfig;
  order: Order | null;
  open: boolean;
  onClose: () => void;
  onSent?: (msg: string, ok: boolean) => void;
}) {
  const base = useMemo(() => (order ? quoteTemplate(order) : null), [order]);
  const [draft, setDraft] = useState<Draft | null>(base);
  const [polishing, setPolishing] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setDraft(base);
  }, [base]);

  if (!order || !draft) return null;

  const polish = async () => {
    setPolishing(true);
    try {
      const improved = await draftWithLLM(
        config,
        draft,
        `Rewrite this quote for ${order.customerName ?? "the customer"} interested in ${
          order.productName ?? "our product"
        }. Emphasise value and a same-day setup.`,
      );
      setDraft(improved);
    } finally {
      setPolishing(false);
    }
  };

  const send = async () => {
    setSending(true);
    try {
      const res = await sendDraft(config, draft);
      if (res.ok) {
        patchOverlay(orderKey(order), { stage: "quoted", quotedAt: Date.now() });
      }
      onSent?.(res.detail, res.ok);
      if (res.ok) onClose();
    } finally {
      setSending(false);
    }
  };

  const copy = async () => {
    const ok = await copyToClipboard(`To: ${draft.to}\nSubject: ${draft.subject}\n\n${draft.body}`);
    onSent?.(ok ? "Quote copied to clipboard." : "Copy failed.", ok);
  };

  return (
    <Modal open={open} onClose={onClose} title="Send quote" width="max-w-2xl">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">To</span>
          <Input value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} placeholder="customer@email.com" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Subject</span>
          <Input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Body</span>
          <textarea
            className="min-h-[220px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={polish} disabled={polishing || !config.codex_key} title={config.codex_key ? "Rewrite with the LLM" : "Set codex_key in Settings to enable AI polish"}>
            {polishing ? <Loader2 className="animate-spin" /> : <Sparkles />} Polish with AI
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={copy}>
              <Copy /> Copy
            </Button>
            <Button size="sm" onClick={send} disabled={sending || !draft.to}>
              {sending ? <Loader2 className="animate-spin" /> : <Send />} Send quote
            </Button>
          </div>
        </div>
        {!config.codex_key && (
          <p className="text-[11px] text-muted-foreground">
            AI polish is off (no codex key configured) — the template is ready to send as-is.
          </p>
        )}
      </div>
    </Modal>
  );
}
