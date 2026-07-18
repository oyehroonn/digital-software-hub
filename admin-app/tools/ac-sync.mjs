#!/usr/bin/env node
/**
 * ac-sync — ActiveCampaign → admin sync job engine (read side).
 *
 *   node tools/ac-sync.mjs check   # compare live AC contact count vs snapshot
 *   node tools/ac-sync.mjs pull    # pull all contacts, write snapshot, email result
 *
 * Read-only pull of the AC contact database into the admin (like the Woo Legacy
 * view). Keys from env (AC_URL / AC_KEY) — never in the browser. Writes
 * public/legacy/ac-contacts.json + ac-sync-status.json for the UI to poll.
 *
 * NOTE: this only READS. A future `push` (Woo → AC) must match by email and
 * add/UPDATE contacts WITHOUT enrolling them in automations (≈39/40 Woo
 * customers already exist in AC, so a naive push would re-fire automations).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const LEGACY = path.resolve(__dir, "../public/legacy");
const STATUS = path.join(LEGACY, "ac-sync-status.json");
const AC_URL = (process.env.AC_URL || "").replace(/\/$/, "");
const AC_KEY = process.env.AC_KEY || "";
const MAILCLI = process.env.MAILCLI || "/Users/hico/claude-employee/mailcli.py";
const TO = process.env.SYNC_EMAIL || "";

fs.mkdirSync(LEGACY, { recursive: true });
const nowISO = () => new Date().toISOString();
const readStatus = () => { try { return JSON.parse(fs.readFileSync(STATUS, "utf8")); } catch { return {}; } };
const writeStatus = (patch) => fs.writeFileSync(STATUS, JSON.stringify({ ...readStatus(), ...patch }, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ac(pathq) {
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(`${AC_URL}/api/3/${pathq}`, { headers: { "Api-Token": AC_KEY } });
      if (r.ok) return await r.json();
      if (r.status >= 500) { await sleep(1200); continue; }
      return { error: r.status };
    } catch { await sleep(1200); }
  }
  return { error: "retries" };
}

async function liveTotal() {
  const d = await ac("contacts?limit=1");
  return d.error ? null : +(d.meta?.total ?? 0);
}
function snapshotCount() {
  try { return JSON.parse(fs.readFileSync(path.join(LEGACY, "ac-contacts.json"), "utf8")).length; } catch { return null; }
}
function email(subject, body) {
  if (!TO) return Promise.resolve({ ok: false });
  return new Promise((res) => execFile("python3", [MAILCLI, "sendEmail", JSON.stringify({ to: TO, subject, body })],
    { timeout: 30000 }, (e) => res({ ok: !e, err: e?.message })));
}

async function doCheck() {
  const snap = snapshotCount() ?? readStatus().count ?? 0;
  const live = await liveTotal();
  if (live == null) { console.log(JSON.stringify({ error: "AC unreachable" })); return; }
  const drift = { contacts: live - snap, live, snapshot: snap, checkedAt: nowISO() };
  writeStatus({ drift });
  console.log(JSON.stringify(drift));
}

async function doPull() {
  if (!AC_URL || !AC_KEY) { writeStatus({ state: "error", message: "AC_URL/AC_KEY not set" }); process.exit(2); }
  const started = Date.now();
  const prev = snapshotCount();
  writeStatus({ state: "running", phase: "contacts", progress: 1, message: "Starting AC pull…", startedAt: nowISO(), prevCount: prev, jobId: `ac_${started}` });

  const total = (await liveTotal()) ?? 0;
  const all = [];
  let offset = 0;
  while (offset < total) {
    const d = await ac(`contacts?limit=100&offset=${offset}`);
    if (d.error) throw new Error(`contacts offset ${offset}: ${d.error}`);
    const batch = d.contacts || [];
    if (!batch.length) break;
    all.push(...batch);
    offset += 100;
    writeStatus({ phase: "contacts", progress: Math.min(92, Math.round((all.length / Math.max(total, 1)) * 92)), message: `Pulling contacts: ${all.length}/${total}` });
  }

  writeStatus({ phase: "writing", progress: 94, message: "Writing snapshot…" });
  const slim = all.map((c) => ({ id: c.id, email: c.email, name: `${c.firstName || ""} ${c.lastName || ""}`.trim(), phone: c.phone, created: c.cdate, updated: c.udate, status: c.status }));
  fs.writeFileSync(path.join(LEGACY, "ac-contacts.json"), JSON.stringify(slim));

  const count = slim.length;
  const dCount = prev != null ? count - prev : null;
  const durationMs = Date.now() - started;
  writeStatus({ phase: "emailing", progress: 97, message: "Emailing result…", count, lastPull: nowISO(), durationMs, drift: null });
  const body = [
    `ActiveCampaign → DSM admin sync complete.`, ``,
    `Contacts: ${count}${dCount != null ? ` (${dCount >= 0 ? "+" : ""}${dCount} since last pull)` : ""}`,
    `Duration: ${(durationMs / 1000).toFixed(1)}s`, `Finished: ${nowISO()}`,
  ].join("\n");
  const mail = await email(`DSM AC sync: ${count} contacts`, body);
  writeStatus({ state: "done", phase: "", progress: 100, message: `Done — ${count} contacts`, finishedAt: nowISO(), emailed: mail.ok });
  console.log(JSON.stringify({ ok: true, count, dCount, emailed: mail.ok }));
}

const action = process.argv[2];
(async () => {
  try {
    if (action === "check") await doCheck();
    else if (action === "pull") await doPull();
    else { console.error("usage: ac-sync.mjs check|pull"); process.exit(1); }
  } catch (e) { writeStatus({ state: "error", message: String(e.message || e), finishedAt: nowISO() }); console.error("ERROR", e.message); process.exit(2); }
})();
