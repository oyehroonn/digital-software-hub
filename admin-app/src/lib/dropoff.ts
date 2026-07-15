/**
 * Session drop-off index — where visits DIE.
 *
 * Two complementary lenses:
 *  1. EXIT PAGES — the page each session was on when it fired its last event.
 *     Ranked by exit count + exit rate (exits / sessions that touched the page),
 *     so you see which page bleeds the most sessions.
 *  2. ABANDONMENT — sessions that reached a funnel stage but never the next one
 *     (cart-but-no-checkout, checkout-but-no-order), i.e. recoverable revenue.
 *
 * The overall "drop-off index" per exit page combines exit volume, exit rate and
 * how few of those sessions converted, so the worst leaks sort to the top.
 */
import type { TelemetryEvent } from "./ecommerce";
import { evName, evType, pagePath, sessionOf, timeOf } from "./telemetryFields";

export interface ExitPage {
  page: string;
  exits: number; // sessions whose LAST event was on this page
  visits: number; // sessions that touched this page at all
  exitRate: number; // exits / visits
  converters: number; // exiting sessions that had ordered
  dropIndex: number; // 0..100 severity score
}

export interface AbandonStage {
  key: string;
  label: string;
  reached: number; // sessions that reached this stage
  advanced: number; // reached the NEXT stage
  abandoned: number; // reached this, not the next
  abandonRate: number;
}

export interface DropOffSummary {
  sessions: number;
  exitPages: ExitPage[];
  abandonment: AbandonStage[];
  singlePageSessions: number; // bounced after one page/event
  bounceRate: number;
  avgPagesPerSession: number;
}

interface Journey {
  session: string;
  lastPage: string;
  lastT: number;
  pages: Set<string>;
  events: number;
  ordered: boolean;
  cart: boolean;
  checkout: boolean;
  viewed: boolean;
  clicked: boolean;
}

function stageFlags(name: string, type: string) {
  return {
    view: /page_?view|product_?view|view_?product|pdp|visit|session_?start|screen_?view|impression/.test(name) || type === "view",
    click: type === "click" || type === "tap" || /(^|_)click|tap|press|select_?item|cta/.test(name),
    cart: /add_?to_?cart|cart_?add|added_?to_?bag/.test(name),
    checkout: /checkout|begin_?checkout|payment|billing/.test(name),
    order: /^order$|purchase|order_?placed|order_?created|transaction/.test(name),
  };
}

export function buildDropOff(events: TelemetryEvent[]): DropOffSummary {
  const journeys = new Map<string, Journey>();

  events.forEach((e, i) => {
    const sk = sessionOf(e, i);
    const t = timeOf(e);
    const page = pagePath(e);
    const name = evName(e);
    const type = evType(e);
    const f = stageFlags(name, type);

    let j = journeys.get(sk);
    if (!j) {
      j = {
        session: sk,
        lastPage: page,
        lastT: Number.isFinite(t) ? t : -Infinity,
        pages: new Set(),
        events: 0,
        ordered: false,
        cart: false,
        checkout: false,
        viewed: false,
        clicked: false,
      };
      journeys.set(sk, j);
    }
    j.events++;
    if (page && page !== "(unknown)") j.pages.add(page);
    if (Number.isFinite(t) && t >= j.lastT) {
      j.lastT = t;
      j.lastPage = page;
    }
    if (f.order) j.ordered = true;
    if (f.cart) j.cart = true;
    if (f.checkout) j.checkout = true;
    if (f.view) j.viewed = true;
    if (f.click) j.clicked = true;
  });

  const exitMap = new Map<string, { exits: number; converters: number }>();
  const visitMap = new Map<string, number>();
  let singlePage = 0;
  let totalPages = 0;

  let reachedView = 0;
  let reachedClick = 0;
  let reachedCart = 0;
  let reachedCheckout = 0;
  let reachedOrder = 0;

  for (const j of journeys.values()) {
    const ex = exitMap.get(j.lastPage) ?? { exits: 0, converters: 0 };
    ex.exits++;
    if (j.ordered) ex.converters++;
    exitMap.set(j.lastPage, ex);
    for (const p of j.pages) visitMap.set(p, (visitMap.get(p) ?? 0) + 1);
    if (j.pages.size <= 1 && j.events <= 2 && !j.ordered) singlePage++;
    totalPages += Math.max(1, j.pages.size);

    if (j.viewed || j.events > 0) reachedView++;
    if (j.clicked) reachedClick++;
    if (j.cart) reachedCart++;
    if (j.checkout) reachedCheckout++;
    if (j.ordered) reachedOrder++;
  }

  const sessions = journeys.size || 1;
  const maxExits = Math.max(...[...exitMap.values()].map((e) => e.exits), 1);

  const exitPages: ExitPage[] = [...exitMap.entries()]
    .map(([page, e]) => {
      const visits = visitMap.get(page) ?? e.exits;
      const exitRate = visits ? e.exits / visits : 0;
      const nonConvShare = e.exits ? 1 - e.converters / e.exits : 1;
      // Severity blends normalized volume, exit rate and non-conversion.
      const dropIndex = Math.round(((e.exits / maxExits) * 0.45 + exitRate * 0.35 + nonConvShare * 0.2) * 100);
      return { page, exits: e.exits, visits, exitRate, converters: e.converters, dropIndex };
    })
    .sort((a, b) => b.dropIndex - a.dropIndex || b.exits - a.exits);

  const mkStage = (key: string, label: string, reached: number, advanced: number): AbandonStage => ({
    key,
    label,
    reached,
    advanced,
    abandoned: Math.max(0, reached - advanced),
    abandonRate: reached ? Math.max(0, reached - advanced) / reached : 0,
  });

  const abandonment: AbandonStage[] = [
    mkStage("view", "Viewed → Clicked", reachedView, reachedClick),
    mkStage("click", "Clicked → Add to cart", reachedClick, reachedCart),
    mkStage("cart", "Cart → Checkout", reachedCart, reachedCheckout),
    mkStage("checkout", "Checkout → Order", reachedCheckout, reachedOrder),
  ];

  return {
    sessions: journeys.size,
    exitPages,
    abandonment,
    singlePageSessions: singlePage,
    bounceRate: singlePage / sessions,
    avgPagesPerSession: totalPages / sessions,
  };
}
