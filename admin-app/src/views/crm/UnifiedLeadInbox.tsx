/**
 * UNIFIED LEAD INBOX + Customers — every email the site captures, in one place.
 *
 * Reads the STABLE Orders sheet (via fetchOrders) and aggregates EVERY capture
 * the public site writes there — footer newsletter, member popup, reseller
 * signup, quote, savings calculator, callback — grouping by email into one
 * contact each. Shows a per-source breakdown, a SOURCE column + filter,
 * first-seen, product interest, and a link to Customer 360. Degrades to a clean
 * empty state when the Orders sheet isn't shared yet (REAL data only).
 *
 * Standalone-capable: pass `config` and it loads its own orders; or pass
 * `orders` (e.g. from `useCrmData`) to avoid a second fetch. Optional
 * `onOpenCustomer(email)` wires the "Customer 360" jump.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Inbox,
  Search,
  RefreshCw,
  Mail,
  Phone,
  Building2,
  MapPin,
  ExternalLink,
  Clock,
  Layers,
  Users,
  Sparkles,
  PhoneCall,
  FileText,
  Handshake,
  Calculator,
  MousePointerClick,
  ShoppingCart,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { fetchOrders, type Order } from "@/lib/ecommerce";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { cn, timeAgo, fmtMoney } from "@/lib/utils";
import {
  deriveSiteCaptures,
  groupLeadContacts,
  sourceBreakdown,
  leadSummary,
  SOURCE_META,
  type SiteSource,
  type LeadContact,
  type SiteCapture,
} from "@/lib/siteLeads";

const SOURCE_ICON: Record<string, LucideIcon> = {
  PhoneCall,
  FileText,
  Handshake,
  Calculator,
  MousePointerClick,
  Mail,
  ShoppingCart,
  HelpCircle,
};

/* ── Source pill ──────────────────────────────────────────────────────────── */

function SourceBadge({ source, count }: { source: SiteSource; count?: number }) {
  const meta = SOURCE_META[source];
  const Icon = SOURCE_ICON[meta.icon] ?? HelpCircle;
  return (
    <Badge variant={meta.variant} className="gap-1" title={meta.blurb}>
      <Icon className="h-3 w-3 opacity-70" />
      {meta.label}
      {count != null && count > 1 && <span className="opacity-60">×{count}</span>}
    </Badge>
  );
}

/* ── Main view ────────────────────────────────────────────────────────────── */

export function UnifiedLeadInbox({
  config,
  orders: ordersProp,
  loading: loadingProp,
  onOpenCustomer,
  onRefresh,
}: {
  config: AppConfig;
  /** Pre-loaded orders (e.g. from useCrmData). Omit to self-load. */
  orders?: Order[];
  loading?: boolean;
  onOpenCustomer?: (email: string) => void;
  onRefresh?: () => void;
}) {
  const [selfOrders, setSelfOrders] = useState<Order[]>([]);
  const [selfLoading, setSelfLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const selfLoad = ordersProp === undefined;
  useEffect(() => {
    if (!selfLoad) return;
    let alive = true;
    setSelfLoading(true);
    setError(null);
    fetchOrders(config)
      .then((o) => alive && setSelfOrders(o))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setSelfLoading(false));
    return () => {
      alive = false;
    };
  }, [config, selfLoad, tick]);

  const orders = ordersProp ?? selfOrders;
  const loading = loadingProp ?? selfLoading;
  const refresh = onRefresh ?? (() => setTick((t) => t + 1));

  const captures = useMemo(() => deriveSiteCaptures(orders), [orders]);
  const contacts = useMemo(() => groupLeadContacts(captures), [captures]);
  const breakdown = useMemo(() => sourceBreakdown(captures, contacts), [captures, contacts]);
  const summary = useMemo(() => leadSummary(captures, contacts), [captures, contacts]);

  const [q, setQ] = useState("");
  const [source, setSource] = useState<SiteSource | "all">("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return contacts.filter((c) => {
      if (source !== "all" && !c.sources.includes(source)) return false;
      if (t) {
        const hay = `${c.name} ${c.email} ${c.company} ${c.productInterests.join(" ")} ${c.latestNote}`.toLowerCase();
        if (!hay.includes(t)) return false;
      }
      return true;
    });
  }, [contacts, q, source]);

  const selected = useMemo(
    () => contacts.find((c) => c.key === selectedKey) ?? null,
    [contacts, selectedKey],
  );

  const maxBar = Math.max(1, ...breakdown.map((b) => b.captures));

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Inbox className="h-4 w-4 text-primary" /> Unified Lead Inbox
          </h2>
          <p className="text-xs text-muted-foreground">
            Every email the site captures — newsletter, popup, reseller, quote, savings &amp; callback — grouped by
            person, from the Orders sheet.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
        </Button>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile icon={Users} label="Contacts" value={summary.contacts} />
        <StatTile icon={Inbox} label="Captures" value={summary.captures} hint="rows on the sheet" />
        <StatTile icon={Sparkles} label="Leads" value={summary.leads} tone="primary" hint="not yet customers" />
        <StatTile icon={ShoppingCart} label="Customers" value={summary.customers} tone="ok" />
        <StatTile icon={Clock} label="New this week" value={summary.newThisWeek} tone="warn" />
        <StatTile icon={Layers} label="Sources live" value={summary.activeSources} />
      </div>

      {/* Source breakdown — clickable filters */}
      {breakdown.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Leads by source
            </div>
            {source !== "all" && (
              <button className="text-[11px] text-primary hover:underline" onClick={() => setSource("all")}>
                Clear filter
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {breakdown.map((b) => {
              const Icon = SOURCE_ICON[b.meta.icon] ?? HelpCircle;
              const active = source === b.source;
              return (
                <button
                  key={b.source}
                  onClick={() => setSource(active ? "all" : b.source)}
                  className={cn(
                    "group flex flex-col gap-1.5 rounded-md border px-3 py-2 text-left transition-colors",
                    active
                      ? "border-primary/50 bg-primary/10"
                      : "border-border/70 hover:border-border hover:bg-accent/40",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-medium">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      {b.meta.label}
                    </span>
                    <span className="tabular-nums text-sm font-semibold">{b.captures}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full transition-all", active ? "bg-primary" : "bg-primary/50")}
                      style={{ width: `${Math.round((b.captures / maxBar) * 100)}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {b.contacts} {b.contacts === 1 ? "contact" : "contacts"} · {b.pct}% of captures
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email, company, interest…"
            className="w-64 pl-8"
          />
        </div>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as SiteSource | "all")}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="all">All sources</option>
          {breakdown.map((b) => (
            <option key={b.source} value={b.source}>
              {b.meta.label} ({b.captures})
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          {filtered.length} of {contacts.length} contacts
        </span>
      </div>

      {/* Body */}
      {error ? (
        <Empty
          icon={<Inbox className="h-8 w-8" />}
          title="Couldn't load leads"
          hint={error}
        />
      ) : contacts.length === 0 ? (
        <Empty
          icon={<Inbox className="h-8 w-8" />}
          title={loading ? "Loading captures…" : "No email captures yet"}
          hint={
            loading
              ? undefined
              : "Once the site starts capturing newsletter, popup, reseller, quote, savings and callback leads into the Orders sheet — or the sheet is shared with this app — they'll all appear here, grouped by person."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
          <div className="rounded-lg border border-border">
            {filtered.length === 0 ? (
              <Empty icon={<Search className="h-8 w-8" />} title="No contacts match your filters" />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>First seen</TH>
                    <TH>Lead</TH>
                    <TH>Source</TH>
                    <TH>Interest</TH>
                    <TH className="text-right">Captures</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {filtered.map((c) => (
                    <TR
                      key={c.key}
                      className={cn("cursor-pointer", selectedKey === c.key && "bg-accent/60")}
                      onClick={() => setSelectedKey(c.key)}
                    >
                      <TD className="whitespace-nowrap text-muted-foreground" title={new Date(c.firstSeenTs).toLocaleString()}>
                        {c.firstSeenTs ? timeAgo(c.firstSeenTs) : "—"}
                      </TD>
                      <TD>
                        <div className="flex items-center gap-2 font-medium">
                          {c.name || "Anonymous"}
                          {c.hasOrder && (
                            <span title="Existing customer">
                              <ShoppingCart className="h-3 w-3 text-ok" />
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground">{c.email || c.phone || c.company || "—"}</div>
                      </TD>
                      <TD>
                        <div className="flex flex-wrap gap-1">
                          {c.sources.slice(0, 3).map((s) => (
                            <SourceBadge key={s} source={s} count={c.sourceCounts[s]} />
                          ))}
                          {c.sources.length > 3 && (
                            <span className="text-[11px] text-muted-foreground">+{c.sources.length - 3}</span>
                          )}
                        </div>
                      </TD>
                      <TD className="max-w-[180px]">
                        <div className="truncate text-xs text-muted-foreground" title={c.productInterests.join(", ")}>
                          {c.productInterests[0] || "—"}
                          {c.productInterests.length > 1 && (
                            <span className="text-muted-foreground/70"> +{c.productInterests.length - 1}</span>
                          )}
                        </div>
                      </TD>
                      <TD className="text-right tabular-nums">{c.captureCount}</TD>
                      <TD className="text-right">
                        {c.email && onOpenCustomer && (
                          <button
                            className="text-muted-foreground hover:text-primary"
                            title="Open Customer 360"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenCustomer(c.email);
                            }}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </button>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </div>

          {selected ? (
            <ContactDetail key={selected.key} contact={selected} onOpenCustomer={onOpenCustomer} />
          ) : (
            <div className="hidden rounded-lg border border-dashed border-border/70 xl:flex xl:items-center xl:justify-center">
              <div className="p-8 text-center text-sm text-muted-foreground">
                <Users className="mx-auto mb-2 h-8 w-8 opacity-50" />
                Select a contact to see every capture, their sources &amp; a jump to Customer 360.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Detail panel ─────────────────────────────────────────────────────────── */

function ContactDetail({
  contact,
  onOpenCustomer,
}: {
  contact: LeadContact;
  onOpenCustomer?: (email: string) => void;
}) {
  return (
    <div className="flex max-h-[calc(100vh-180px)] flex-col gap-4 overflow-y-auto rounded-lg border border-border bg-card p-4">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-base font-semibold">{contact.name || "Anonymous contact"}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {contact.sources.map((s) => (
                <SourceBadge key={s} source={s} count={contact.sourceCounts[s]} />
              ))}
            </div>
          </div>
          {contact.hasOrder && <Badge variant="ok">Customer</Badge>}
        </div>

        <div className="mt-3 flex flex-col gap-1 text-sm">
          {contact.email && (
            <a className="flex items-center gap-2 text-primary hover:underline" href={`mailto:${contact.email}`}>
              <Mail className="h-3.5 w-3.5" /> {contact.email}
            </a>
          )}
          {contact.phone && (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-3.5 w-3.5" /> {contact.phone}
            </span>
          )}
          {contact.company && (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" /> {contact.company}
            </span>
          )}
          {contact.location && (
            <span className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" /> {contact.location}
            </span>
          )}
        </div>

        {contact.email && onOpenCustomer && (
          <Button variant="outline" size="sm" className="mt-3" onClick={() => onOpenCustomer(contact.email)}>
            <ExternalLink /> Open Customer 360
          </Button>
        )}
      </div>

      {/* Facts */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Field label="First seen" value={contact.firstSeenTs ? timeAgo(contact.firstSeenTs) : "—"} />
        <Field label="Last seen" value={contact.lastSeenTs ? timeAgo(contact.lastSeenTs) : "—"} />
        <Field label="Captures" value={String(contact.captureCount)} />
        {contact.totalValue > 0 && (
          <Field label="Order value" value={fmtMoney(contact.totalValue, contact.currency)} />
        )}
      </div>

      {contact.productInterests.length > 0 && (
        <Section title="Product interest">
          <div className="flex flex-wrap gap-1">
            {contact.productInterests.map((p) => (
              <span key={p} className="rounded-md bg-accent px-2 py-0.5 text-xs">
                {p}
              </span>
            ))}
          </div>
        </Section>
      )}

      {contact.latestNote && (
        <Section title="Latest note">
          <div className="rounded-md border border-border/70 bg-background/50 px-3 py-2 text-sm italic text-muted-foreground">
            “{contact.latestNote}”
          </div>
        </Section>
      )}

      <Section title={`Capture history (${contact.captures.length})`}>
        <ol className="flex flex-col gap-2">
          {contact.captures.map((cap) => (
            <CaptureRow key={cap.id} capture={cap} />
          ))}
        </ol>
      </Section>
    </div>
  );
}

function CaptureRow({ capture }: { capture: SiteCapture }) {
  return (
    <li className="flex items-start gap-2 border-l-2 border-border/70 pl-3">
      <div className="flex-1">
        <div className="flex items-center justify-between gap-2">
          <SourceBadge source={capture.source} />
          <span className="text-[11px] text-muted-foreground" title={capture.capturedAt}>
            {capture.ts ? timeAgo(capture.ts) : "—"}
          </span>
        </div>
        {capture.productInterest && (
          <div className="mt-1 text-xs text-muted-foreground">{capture.productInterest}</div>
        )}
        {capture.notes && <div className="mt-0.5 text-xs italic text-muted-foreground/90">“{capture.notes}”</div>}
        {capture.value > 0 && (
          <div className="mt-0.5 text-[11px] text-ok">{fmtMoney(capture.value, capture.currency)}</div>
        )}
      </div>
    </li>
  );
}

/* ── Small bits ───────────────────────────────────────────────────────────── */

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  tone?: "primary" | "ok" | "warn";
}) {
  const toneCls =
    tone === "primary" ? "text-primary" : tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={cn("mt-0.5 text-xl font-semibold tabular-nums", toneCls)}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border/60 pt-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

export default UnifiedLeadInbox;
