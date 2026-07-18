# Deployment consolidation — 4 sites, 1 Cloudflare Pages project

**Why this exists:** the Cloudflare account is at its **hard cap of 100/100 Pages
projects** (free plan). Creating a new project returns API error `8000027`
("You have reached the limit of projects you can have on your account").
Rather than delete existing projects, all four DSM web properties are served
from the **single existing `digimax` Pages project** (`digimax-93q.pages.dev`),
built from this one repository (`oyehroonn/digital-software-hub`).

## The four sites (one build, one deploy)

| Site | Path | Source | Type |
|------|------|--------|------|
| Store / landing page | `/` | this repo (root Vite app) | React SPA |
| Marketing | `/marketing` | `public/marketing/` | static microsite |
| Services | `/services` | `public/services/` | static microsite |
| Admin | `/admin` | `admin-app/` (Vite) | React SPA |

## How it builds

`npm run build` (the Cloudflare build command) runs, in order:

1. `build:admin` — installs `admin-app` deps and builds it with
   `ADMIN_BASE=/admin/`, emitting into `public/admin/` (gitignored artifact).
2. `tsc --noEmit` type-check of the store app.
3. `vite build` for the store — Vite copies everything in `public/`
   (`marketing/`, `services/`, `admin/`, `_redirects`) into `dist/`.

Routing is handled by `public/_redirects`: each site gets its own SPA fallback,
with `/admin/*` listed **before** the store's `/*` catch-all so admin client
routes resolve to the admin bundle.

## Repos

The three split repos (`dsm-marketing`, `dsm-services`, `dsm-admin`) were a
first attempt at separate-project deploys. Because separate CF projects aren't
possible under the 100-project cap, everything is **converged back into this one
monorepo** and those split repos are retired. History for each site still lives
in this repo's git history.

## ⚠️ Security notes (admin is now public)

- **Rotate the Apps Script read secret.** The old `ecommerce_secret` was
  previously committed to this **public** repo, so it must be considered
  compromised. Generate a new secret in the Apps Script, update it in the admin
  (Settings / `admin-app/.env.local` via `VITE_ECOM_SECRET`), and it is no longer
  hardcoded in source or shipped in the public bundle.
- **Protect `/admin`.** The admin UI is reachable at `digimax-93q.pages.dev/admin`.
  It ships with **no** secret and shows no data until one is entered, but it is
  still a management surface. Recommended: put Cloudflare Access (email-gated) in
  front of `/admin/*`.
- **No customer PII in the public build.** The migrated WooCommerce export
  (`admin-app/public/legacy/`, `woo-export/`) is gitignored and never deployed;
  the Legacy view only populates in local dev where the data exists.
