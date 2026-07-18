#!/usr/bin/env node
/**
 * ac-push — WooCommerce customers → ActiveCampaign, conflict-safe.
 *
 *   node tools/ac-push.mjs           # DRY RUN (default): report add/update counts, NO writes
 *   node tools/ac-push.mjs --live    # actually sync (add/update by email)
 *
 * Uses AC's POST /api/3/contact/sync — it ADDS or UPDATES a contact by email and
 * does NOT enrol them in automations or re-fire triggers (unlike POST
 * /api/3/contacts). ~39/40 Woo customers already exist in AC, so this is mostly
 * updates. The dry run reads the local snapshots (public/legacy) — zero API calls,
 * zero risk — so you can review before any live write.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const LEGACY = path.resolve(__dir, "../public/legacy");
const AC_URL = (process.env.AC_URL || "").replace(/\/$/, "");
const AC_KEY = process.env.AC_KEY || "";
const LIVE = process.argv.includes("--live");
const LIMIT = (() => { const i = process.argv.indexOf("--limit"); return i > -1 ? +process.argv[i + 1] : Infinity; })();

const load = (f) => JSON.parse(fs.readFileSync(path.join(LEGACY, f), "utf8"));
const norm = (e) => String(e || "").trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const woo = load("woo-customers.json").filter((c) => EMAIL_RE.test(norm(c.email)));
const acEmails = new Set(load("ac-contacts.json").map((c) => norm(c.email)));

const toAdd = woo.filter((c) => !acEmails.has(norm(c.email)));
const toUpdate = woo.filter((c) => acEmails.has(norm(c.email)));

const report = {
  mode: LIVE ? "LIVE" : "DRY-RUN",
  woo_customers_valid: woo.length,
  ac_existing: acEmails.size,
  would_ADD: toAdd.length,
  would_UPDATE: toUpdate.length,
  automations_touched: 0, // /contact/sync never enrols in automations
  sample_add: toAdd.slice(0, 5).map((c) => c.email),
};
console.log(JSON.stringify(report, null, 2));

if (!LIVE) {
  fs.writeFileSync(path.join(LEGACY, "ac-push-dryrun.json"), JSON.stringify(report, null, 2));
  console.log("\nDRY RUN only — no contacts were written. Re-run with --live to sync.");
  process.exit(0);
}

// ---- LIVE ----
if (!AC_URL || !AC_KEY) { console.error("AC_URL/AC_KEY not set"); process.exit(2); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function syncContact(c) {
  const [firstName, ...rest] = String(c.name || "").trim().split(" ");
  const body = { contact: { email: norm(c.email), firstName: firstName || "", lastName: rest.join(" ") || "", phone: c.phone || "" } };
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(`${AC_URL}/api/3/contact/sync`, {
        method: "POST", headers: { "Api-Token": AC_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (r.ok) return "ok";
      if (r.status === 429 || r.status >= 500) { await sleep(1500); continue; }
      return `err_${r.status}`;
    } catch { await sleep(1500); }
  }
  return "retries";
}

const targets = [...toAdd, ...toUpdate].slice(0, LIMIT);
console.log(`\nLIVE sync of ${targets.length} contacts via /contact/sync (no automation enrolment)…`);
let ok = 0, err = 0;
for (let i = 0; i < targets.length; i++) {
  const res = await syncContact(targets[i]);
  res === "ok" ? ok++ : err++;
  if (i % 100 === 0) console.log(`  ${i}/${targets.length} (ok ${ok}, err ${err})`);
  await sleep(120); // gentle rate limit (~8/s, well under AC's 5/s-per-key... keep conservative)
}
console.log(JSON.stringify({ done: true, synced: ok, errors: err }, null, 2));
