# DSM Admin (desktop)

Cross-platform (macOS + Windows) admin app for the DSM stack, built with **Tauri v2** (Rust shell) + **React / TypeScript / Tailwind**.

## Tabs

- **Products** — view/edit the catalog (name, price, stock, status) and trigger 3D box regen. Every edit goes through an **offline queue** (localStorage) and **auto-pushes to the VPS** the moment it's reachable. Nothing is lost while the VPS (an unstable backend) is down.
- **Orders** — reads the **stable** Orders sheet via the Ecommerce Apps Script.
- **Analytics** — conversion funnel + `ai_outage` feed derived from the Telemetry sheet.
- **Health** — up/down board for VPS · codex-proxy · Simli · email · ecommerce, plus the pending edit queue.
- **Settings** — endpoints & secrets (stored locally, never committed).

## Resilience

The app mirrors the site's resilience contract: stable backends (Ecommerce Apps Script, Email API) are always assumed up; unstable ones (VPS Flask, codex-proxy, Simli) may time out — every check uses short timeouts and the UI degrades gracefully (empty states, queued edits) instead of blocking.

## Secrets

Secrets live in an OS-local, gitignored config file (managed via the **Settings** tab or by hand):

- macOS: `~/Library/Application Support/dsm-admin/config.json`
- Windows: `%APPDATA%\dsm-admin\config.json`

See `config.example.json` for the shape. Network calls and the Email CLI run in the Rust layer, so keys never enter the JS bundle and there's no browser CORS.

## Develop & build

```bash
npm install            # installs JS deps (Rust deps fetched by cargo on first build)
npm run tauri:dev      # run the desktop app with hot reload
npm run tauri:build    # produce signed installers (.dmg / .app on macOS, .msi / .exe on Windows)
```

`npm run dev` alone runs the React UI in a plain browser (Tauri bridge falls back to `fetch`) for quick UI work.

### Icons

Placeholder brand-crimson icons are in `src-tauri/icons`. Replace them from a real logo with:

```bash
npm run tauri icon path/to/logo.png
```

### Assumed VPS endpoints

Product edits/regens push to (secret-gated, to be added to `3dstuff/api.py`):

- `POST /admin/products/<id>` `{ changes, secret }`
- `POST /admin/regen/<id>` `{ secret }`

Order/telemetry reads assume Apps Script GET actions `?action=orders` and `?action=telemetry` returning JSON (secret-gated).
