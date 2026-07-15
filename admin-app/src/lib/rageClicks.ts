/**
 * Rage- & dead-click detection from raw click telemetry.
 *
 *  • RAGE click  — a burst of ≥3 clicks by the same session on (nearly) the same
 *    spot within a short window: the classic "why isn't this working?!" signal.
 *  • DEAD click   — a click that produced no response (metadata flags it, OR it
 *    is part of a rage burst): the UI looked interactive but wasn't.
 *
 * Detection is defensive: it works off x/y proximity + timestamps, and also
 * honours explicit metadata flags (rage / dead / noResponse) when the site
 * emits them. Output is ranked per element so you can see WHICH control frustrates
 * visitors and on which page.
 */
import type { TelemetryEvent } from "./ecommerce";
import { evName, evType, metaOf, metaPick, num, pagePath, sessionOf, str, timeOf } from "./telemetryFields";

export interface RageIncident {
  sessionId: string;
  page: string;
  elementId: string;
  elementText: string;
  x: number;
  y: number;
  clicks: number;
  spanMs: number;
  timestamp: number;
  dead: boolean;
}

export interface FrustratedElement {
  key: string;
  label: string;
  page: string;
  rageClicks: number; // clicks that were part of a rage burst
  deadClicks: number; // clicks explicitly / inferably dead
  incidents: number; // number of rage bursts
  sessions: number; // distinct frustrated sessions
  score: number; // combined frustration score
  lastSeen: number;
}

export interface RageSummary {
  incidents: RageIncident[];
  elements: FrustratedElement[];
  totalClicks: number;
  rageClicks: number;
  deadClicks: number;
  affectedSessions: number;
  rageRate: number; // rageClicks / totalClicks
}

interface ClickRow {
  session: string;
  page: string;
  x: number;
  y: number;
  id: string;
  text: string;
  t: number;
  flaggedDead: boolean;
}

function isClick(e: TelemetryEvent): boolean {
  const type = evType(e);
  if (type === "click" || type === "tap") return true;
  const name = evName(e);
  return /click|tap|press/.test(name) && !/dblclick_off/.test(name);
}

function flaggedDead(m: Record<string, unknown>): boolean {
  const truthy = (v: unknown) => v === true || v === 1 || v === "true" || v === "1";
  return (
    truthy(metaPick(m, "dead", "deadClick", "isDead")) ||
    truthy(metaPick(m, "rage", "rageClick", "isRage")) ||
    truthy(metaPick(m, "noResponse", "no_response", "noop", "unhandled"))
  );
}

export interface RageOptions {
  /** Max ms between consecutive clicks to still count as one burst. */
  windowMs?: number;
  /** Max pixel distance between clicks to count as the "same spot". */
  radius?: number;
  /** Minimum clicks in a burst to call it rage. */
  minClicks?: number;
}

export function detectRage(events: TelemetryEvent[], opts: RageOptions = {}): RageSummary {
  const windowMs = opts.windowMs ?? 1200;
  const radius = opts.radius ?? 48;
  const minClicks = opts.minClicks ?? 3;

  // Collect clicks per session, keeping order.
  const bySession = new Map<string, ClickRow[]>();
  let totalClicks = 0;
  let explicitDead = 0;

  events.forEach((e, i) => {
    if (!isClick(e)) return;
    const x = num(e.x);
    const y = num(e.y);
    const m = metaOf(e);
    const dead = flaggedDead(m);
    totalClicks++;
    if (dead) explicitDead++;
    const row: ClickRow = {
      session: sessionOf(e, i),
      page: pagePath(e),
      x: x ?? -1,
      y: y ?? -1,
      id: str(e.elementId ?? e.element_id),
      text: str(e.elementText ?? e.element_text),
      t: timeOf(e),
      flaggedDead: dead,
    };
    let bucket = bySession.get(row.session);
    if (!bucket) bySession.set(row.session, (bucket = []));
    bucket.push(row);
  });

  const incidents: RageIncident[] = [];
  const affected = new Set<string>();
  let rageClicks = 0;
  let deadClicks = explicitDead;

  for (const [session, rowsRaw] of bySession) {
    const rows = rowsRaw
      .filter((r) => Number.isFinite(r.t))
      .sort((a, b) => a.t - b.t);
    let i = 0;
    while (i < rows.length) {
      const start = rows[i];
      let j = i + 1;
      const burst = [start];
      while (j < rows.length) {
        const prev = burst[burst.length - 1];
        const cur = rows[j];
        const close =
          cur.t - prev.t <= windowMs &&
          (start.x < 0 ||
            cur.x < 0 ||
            Math.hypot(cur.x - start.x, cur.y - start.y) <= radius) &&
          (start.id === cur.id || start.id === "" || cur.id === "");
        if (!close) break;
        burst.push(cur);
        j++;
      }
      if (burst.length >= minClicks) {
        rageClicks += burst.length;
        deadClicks += burst.filter((b) => !b.flaggedDead).length; // rage ⇒ dead too
        affected.add(session);
        const last = burst[burst.length - 1];
        incidents.push({
          sessionId: session,
          page: start.page,
          elementId: start.id,
          elementText: start.text,
          x: start.x,
          y: start.y,
          clicks: burst.length,
          spanMs: last.t - start.t,
          timestamp: start.t,
          dead: burst.some((b) => b.flaggedDead) || true,
        });
        i = j;
      } else {
        i++;
      }
    }
  }

  // Rank the elements people fight with.
  const elMap = new Map<string, FrustratedElement>();
  for (const inc of incidents) {
    const label = inc.elementText?.trim() || inc.elementId || "(unlabeled)";
    const key = `${inc.page}::${inc.elementId || label}`;
    let el = elMap.get(key);
    if (!el) {
      el = {
        key,
        label,
        page: inc.page,
        rageClicks: 0,
        deadClicks: 0,
        incidents: 0,
        sessions: 0,
        score: 0,
        lastSeen: 0,
      };
      elMap.set(key, el);
    }
    el.rageClicks += inc.clicks;
    el.deadClicks += inc.dead ? inc.clicks : 0;
    el.incidents += 1;
    el.lastSeen = Math.max(el.lastSeen, inc.timestamp);
  }
  // Distinct sessions per element.
  const sessByEl = new Map<string, Set<string>>();
  for (const inc of incidents) {
    const label = inc.elementText?.trim() || inc.elementId || "(unlabeled)";
    const key = `${inc.page}::${inc.elementId || label}`;
    let s = sessByEl.get(key);
    if (!s) sessByEl.set(key, (s = new Set()));
    s.add(inc.sessionId);
  }
  const elements = [...elMap.values()]
    .map((el) => {
      el.sessions = sessByEl.get(el.key)?.size ?? 0;
      el.score = el.rageClicks * 1 + el.incidents * 2 + el.sessions * 3;
      return el;
    })
    .sort((a, b) => b.score - a.score);

  incidents.sort((a, b) => b.timestamp - a.timestamp);

  return {
    incidents,
    elements,
    totalClicks,
    rageClicks,
    deadClicks,
    affectedSessions: affected.size,
    rageRate: totalClicks ? rageClicks / totalClicks : 0,
  };
}
