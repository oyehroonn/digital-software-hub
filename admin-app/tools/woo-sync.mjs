#!/usr/bin/env node
/**
 * woo-sync — WooCommerce → admin legacy-data sync job engine.
 *
 *   node tools/woo-sync.mjs check   # compare live Woo counts vs last snapshot
 *   node tools/woo-sync.mjs pull    # full re-pull, write snapshot, email result
 *
 * Runs OUTSIDE the browser (keys never ship to the client). Credentials come
 * from the environment (WOO_CK / WOO_CS), set in admin-app/.env.local. Writes
 * live progress to public/legacy/sync-status.json so the admin UI can poll it,
 * and emails a summary via the mailcli on completion.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const LEGACY = path.resolve(__dir, "../public/legacy");
const STATUS = path.join(LEGACY, "sync-status.json");
const SITE = "https://digitalsoftwaremarkett.com";
const CK = process.env.WOO_CK || "";
const CS = process.env.WOO_CS || "";
const MAILCLI = process.env.MAILCLI || "/Users/hico/claude-employee/mailcli.py";
const RECIPIENT = process.env.SYNC_EMAIL || ""; // set SYNC_EMAIL in .env.local (not hardcoded in the public repo)
const AUTH = "Basic " + Buffer.from(`${CK}:${CS}`).toString("base64");

fs.mkdirSync(LEGACY, { recursive: true });
const readStatus = () => { try { return JSON.parse(fs.readFileSync(STATUS, "utf8")); } catch { return {}; } };
const writeStatus = (patch) => {
  const cur = readStatus();
  fs.writeFileSync(STATUS, JSON.stringify({ ...cur, ...patch }, null, 2));
};
// nowISO is passed in (Date.* is fine in a plain node script, unlike workflow scripts)
const nowISO = () => new Date().toISOString();

async function wc(pathq) {
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(`${SITE}/wp-json/wc/v3/${pathq}`, { headers: { Authorization: AUTH } });
      if (r.ok) return { data: await r.json(), total: +(r.headers.get("x-wp-total") || 0), pages: +(r.headers.get("x-wp-totalpages") || 0) };
      if (r.status >= 500) { await sleep(1200); continue; }
      return { error: r.status };
    } catch { await sleep(1200); }
  }
  return { error: "retries" };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function liveTotals() {
  const c = await wc("customers?per_page=1");
  const o = await wc("orders?per_page=1&status=any");
  return { customers: c.total ?? null, orders: o.total ?? null, error: c.error || o.error };
}

function snapshotCounts() {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(LEGACY, "woo-customers.json"), "utf8")).length;
    const o = JSON.parse(fs.readFileSync(path.join(LEGACY, "woo-orders.json"), "utf8")).length;
    return { customers: c, orders: o };
  } catch { return null; }
}

async function pullAll(kind, extra, from, to) {
  let page = 1, all = [], pages = 1;
  do {
    const { data, pages: tp, error } = await wc(`${kind}?per_page=100&page=${page}${extra}`);
    if (error) throw new Error(`${kind} page ${page}: ${error}`);
    if (Array.isArray(data)) all.push(...data);
    pages = tp || pages;
    const pct = from + Math.round(((page / pages) * (to - from)));
    writeStatus({ phase: kind, progress: pct, message: `Pulling ${kind}: page ${page}/${pages} (${all.length})` });
    page++;
  } while (page <= pages);
  return all;
}

function email(subject, body) {
  if (!RECIPIENT) return Promise.resolve({ ok: false, err: "SYNC_EMAIL not set" });
  return new Promise((res) => {
    execFile("python3", [MAILCLI, "sendEmail", JSON.stringify({ to: RECIPIENT, subject, body })],
      { timeout: 30000 }, (err, stdout) => res({ ok: !err, out: (stdout || "").slice(0, 300), err: err?.message }));
  });
}

async function doCheck() {
  const snap = snapshotCounts() || readStatus().counts || { customers: 0, orders: 0 };
  const live = await liveTotals();
  if (live.error) { writeStatus({ drift: { error: String(live.error), checkedAt: nowISO() } }); console.log(JSON.stringify({ error: live.error })); return; }
  const drift = {
    customers: (live.customers ?? 0) - (snap.customers ?? 0),
    orders: (live.orders ?? 0) - (snap.orders ?? 0),
    live, snapshot: snap, checkedAt: nowISO(),
  };
  writeStatus({ drift });
  console.log(JSON.stringify(drift));
}

async function doPull() {
  if (!CK || !CS) { writeStatus({ state: "error", message: "WOO_CK/WOO_CS not set" }); process.exit(2); }
  const started = Date.now();
  const prev = snapshotCounts();
  writeStatus({ state: "running", phase: "customers", progress: 1, message: "Starting pull…", startedAt: nowISO(), prevCounts: prev, jobId: `job_${started}` });

  const customers = await pullAll("customers", "&orderby=id&order=asc", 1, 70);
  const orders = await pullAll("orders", "&orderby=id&order=asc&status=any", 70, 85);

  writeStatus({ phase: "writing", progress: 88, message: "Writing snapshot…" });
  const slimC = customers.map((c) => ({ id: c.id, email: c.email, name: `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.username, username: c.username, created: c.date_created, role: c.role, orders_count: c.orders_count, total_spent: c.total_spent, city: c.billing?.city, country: c.billing?.country, phone: c.billing?.phone }));
  const slimO = orders.map((o) => ({ id: o.id, number: o.number, status: o.status, email: o.billing?.email, name: `${o.billing?.first_name || ""} ${o.billing?.last_name || ""}`.trim(), total: o.total, currency: o.currency, created: o.date_created, paid: o.date_paid, items: (o.line_items || []).map((i) => ({ name: i.name, qty: i.quantity, total: i.total })), payment: o.payment_method_title, customer_id: o.customer_id }));
  fs.writeFileSync(path.join(LEGACY, "woo-customers.json"), JSON.stringify(slimC));
  fs.writeFileSync(path.join(LEGACY, "woo-orders.json"), JSON.stringify(slimO));

  // revenue by currency (completed-ish)
  const rev = {};
  for (const o of slimO) if (["completed", "processing", "on-hold"].includes(o.status)) rev[o.currency || "?"] = (rev[o.currency || "?"] || 0) + Number(o.total || 0);
  const counts = { customers: slimC.length, orders: slimO.length };
  const durationMs = Date.now() - started;
  const dCust = prev ? counts.customers - prev.customers : null;
  const dOrd = prev ? counts.orders - prev.orders : null;

  writeStatus({ phase: "emailing", progress: 95, message: "Emailing result…", counts, lastPull: nowISO(), durationMs, drift: null });
  const revStr = Object.entries(rev).map(([c, v]) => `${c} ${Math.round(v).toLocaleString()}`).join(" + ") || "—";
  const body = [
    `WooCommerce → DSM admin sync complete.`, ``,
    `Customers: ${counts.customers}${dCust != null ? ` (${dCust >= 0 ? "+" : ""}${dCust} since last pull)` : ""}`,
    `Orders:    ${counts.orders}${dOrd != null ? ` (${dOrd >= 0 ? "+" : ""}${dOrd})` : ""}`,
    `Revenue:   ${revStr}`, ``,
    `Duration:  ${(durationMs / 1000).toFixed(1)}s`,
    `Finished:  ${nowISO()}`, ``,
    `The admin Legacy (Woo) view now reflects this snapshot.`,
  ].join("\n");
  const mail = await email(`DSM sync: ${counts.customers} customers, ${counts.orders} orders`, body);

  writeStatus({ state: "done", phase: "", progress: 100, message: `Done — ${counts.customers} customers, ${counts.orders} orders`, finishedAt: nowISO(), emailed: mail.ok, emailError: mail.ok ? undefined : mail.err });
  console.log(JSON.stringify({ ok: true, counts, dCust, dOrd, emailed: mail.ok }));
}

const action = process.argv[2];
(async () => {
  try {
    if (action === "check") await doCheck();
    else if (action === "pull") await doPull();
    else { console.error("usage: woo-sync.mjs check|pull"); process.exit(1); }
  } catch (e) {
    writeStatus({ state: "error", message: String(e.message || e), finishedAt: nowISO() });
    console.error("ERROR", e.message);
    process.exit(2);
  }
})();
