/**
 * Dev-only local API for the WooCommerce sync, mounted on the admin's vite dev
 * server. Keys stay server-side (read from the loaded env, never sent to the
 * browser). Exposes:
 *   GET  /api/woo/status  → current sync-status.json (last pull, counts, progress)
 *   GET  /api/woo/drift   → runs `woo-sync check` and returns the drift JSON
 *   POST /api/woo/pull    → starts `woo-sync pull` detached; poll /status for progress
 *
 * Absent in the built/deployed admin (no dev server) — the UI degrades to a
 * "run the local admin to sync" hint.
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

export function wooSyncPlugin(env) {
  return {
    name: "woo-sync-dev-api",
    apply: "serve",
    configureServer(server) {
      const root = server.config.root;
      const STATUS = path.resolve(root, "public/legacy/sync-status.json");
      const SCRIPT = path.resolve(root, "tools/woo-sync.mjs");
      const childEnv = { ...process.env, WOO_CK: env.WOO_CK || "", WOO_CS: env.WOO_CS || "", SYNC_EMAIL: env.SYNC_EMAIL || "", MAILCLI: env.MAILCLI || "" };
      const json = (res, obj, code = 200) => { res.statusCode = code; res.setHeader("content-type", "application/json"); res.end(typeof obj === "string" ? obj : JSON.stringify(obj)); };

      server.middlewares.use("/api/woo/status", (_req, res) => {
        try { json(res, fs.readFileSync(STATUS, "utf8")); }
        catch { json(res, { state: "idle", message: "No sync yet" }); }
      });

      server.middlewares.use("/api/woo/drift", (_req, res) => {
        const p = spawn("node", [SCRIPT, "check"], { env: childEnv });
        let out = "";
        p.stdout.on("data", (d) => (out += d));
        p.on("close", () => json(res, out.trim() || "{}"));
        p.on("error", (e) => json(res, { error: String(e) }, 500));
      });

      server.middlewares.use("/api/woo/pull", (req, res) => {
        if (req.method !== "POST") return json(res, { error: "POST only" }, 405);
        const p = spawn("node", [SCRIPT, "pull"], { env: childEnv, detached: true, stdio: "ignore" });
        p.unref();
        json(res, { started: true });
      });
    },
  };
}
