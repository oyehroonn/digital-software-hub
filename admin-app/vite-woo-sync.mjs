/**
 * Dev-only local API for the WooCommerce + ActiveCampaign syncs, mounted on the
 * admin's vite dev server. Keys stay server-side (from the loaded env, never
 * sent to the browser). For each source (woo, ac):
 *   GET  /api/<src>/status  → current <src>-sync status (last pull, counts, progress)
 *   GET  /api/<src>/drift   → run the check and return drift JSON
 *   POST /api/<src>/pull    → start the pull detached; poll /status for progress
 *
 * Absent in the built/deployed admin (no dev server) — the UI degrades to a
 * "run the local admin to sync" hint.
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const SOURCES = {
  woo: { script: "tools/woo-sync.mjs", status: "public/legacy/sync-status.json" },
  ac: { script: "tools/ac-sync.mjs", status: "public/legacy/ac-sync-status.json" },
};

export function wooSyncPlugin(env) {
  return {
    name: "sync-dev-api",
    apply: "serve",
    configureServer(server) {
      const root = server.config.root;
      const childEnv = {
        ...process.env,
        WOO_CK: env.WOO_CK || "", WOO_CS: env.WOO_CS || "",
        AC_URL: env.AC_URL || "", AC_KEY: env.AC_KEY || "",
        SYNC_EMAIL: env.SYNC_EMAIL || "", MAILCLI: env.MAILCLI || "",
      };
      const json = (res, obj, code = 200) => { res.statusCode = code; res.setHeader("content-type", "application/json"); res.end(typeof obj === "string" ? obj : JSON.stringify(obj)); };

      for (const [src, cfg] of Object.entries(SOURCES)) {
        const STATUS = path.resolve(root, cfg.status);
        const SCRIPT = path.resolve(root, cfg.script);

        server.middlewares.use(`/api/${src}/status`, (_req, res) => {
          try { json(res, fs.readFileSync(STATUS, "utf8")); }
          catch { json(res, { state: "idle", message: "No sync yet" }); }
        });
        server.middlewares.use(`/api/${src}/drift`, (_req, res) => {
          const p = spawn("node", [SCRIPT, "check"], { env: childEnv });
          let out = "";
          p.stdout.on("data", (d) => (out += d));
          p.on("close", () => json(res, out.trim() || "{}"));
          p.on("error", (e) => json(res, { error: String(e) }, 500));
        });
        server.middlewares.use(`/api/${src}/pull`, (req, res) => {
          if (req.method !== "POST") return json(res, { error: "POST only" }, 405);
          const p = spawn("node", [SCRIPT, "pull"], { env: childEnv, detached: true, stdio: "ignore" });
          p.unref();
          json(res, { started: true });
        });
      }
    },
  };
}
