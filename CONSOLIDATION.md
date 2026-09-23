# Deployment consolidation — 4 sites, 1 Cloudflare Pages project

**Why this exists:** the Cloudflare account is at its **hard cap of 100/100 Pages
projects** (free plan). Creating a new project returns API error `8000027`
("You have reached the limit of projects you can have on your account").
Rather than delete existing projects, all four DSM web properties are served
from the **single existing `digimax` Pages project** (`digimax-93q.pages.dev`),
built from this one repository (`oyehroonn/digital-software-hub`).

## UPDATE (2026-09-23): marketing + agentic extracted to standalone projects

`public/marketing/` and `public/services/dsmAIFinal.html` are **no longer part
of this build**. Serving them by rewriting into the shared `digimax` bundle
meant every hit on `marketing.` / `agentic.digitalsoftwaremarket.ai` pulled
down the full storefront bundle (three.js, model-viewer, the whole SPA) just
to show a static page. They now live as their own lean, standalone Cloudflare
Pages projects — reusing two project slots that already existed
(`dsm-marketing` → `dsm-marketing-4ye.pages.dev`, `dsm-agentic-services` →
`dsm-agentic-services.pages.dev`), so this didn't need a new project under the
100-project cap. Each project contains only that microsite's own HTML/CSS/JS/
assets, deployed via `npx wrangler pages deploy <dir> --project-name=<name>`.
The `marketing.` and `agentic.digitalsoftwaremarket.ai` custom domains + DNS
CNAMEs have been moved off `digimax` and onto these two projects directly.
Both microsites got a "← DSM Store" link back to
`beta.digitalsoftwaremarket.ai`, since neither had one before.

## UPDATE (2026-09-24): the rest of `public/services/` moved out too

The 2026-09-23 extraction above only moved `dsmAIFinal.html` (the agentic
homepage) standalone — the other 219 files under `public/services/`
(`offerings.html`, `agentic-infrastructure.html`, `software-automation.html`,
`flo-ai-agents.html`, case studies, `llms.txt`, `resources/`, and all 50
JSON-generated service pages) were left behind in this build, so clicking
"Services" from the fast standalone homepage sent visitors right back into
this heavy React/three.js/model-viewer bundle. `public/services/` (all of it),
`content/services.json`, and `scripts/generate-service-pages.mjs` are now
**gone from this repo entirely** — moved to
`/srv/t3/projects/dsm/agentic-standalone/` on CT 2002 (see that directory's
`SOURCE_OF_TRUTH.md`), which deploys to the same `dsm-agentic-services`
Cloudflare Pages project as the homepage. `public/_redirects`'s old bare
`/services` and `/marketing` rules are now `/services/*` and `/marketing/*`
wildcards, since nothing real is left under either path here — every old
in-bundle link/bookmark now redirects out instead of 404ing in the SPA.

The two remaining tables below are now **out of date** for the Marketing/
Services rows and the `marketing.`/`agentic.` subdomain rows — see the updates
above instead. `creatives.` and `admin.` are unaffected and still work exactly
as documented.

## The four sites (one build, one deploy) — historical, see update above

| Site | Path | Source | Type |
|------|------|--------|------|
| Store / landing page | `/` | this repo (root Vite app) | React SPA |
| ~~Marketing~~ | ~~`/marketing`~~ | now standalone, see update above | — |
| ~~Services~~ | ~~`/services`~~ | now standalone, see 2026-09-24 update above | — |
| Admin | `/admin` | `admin-app/` (Vite) | React SPA |

## DSM AI Labs rebrand — subdomains (same deployment, no new project) — historical, see update above

Same reasoning, one level up: `marketing.`, `agentic.`, `creatives.` and
`admin.digitalsoftwaremarket.ai` are attached as four more custom domains on
this same `digimax` Pages project (see `public/_redirects` for the exact
Host-header-scoped rules) rather than as new projects or a hostname router
inside the app shell:

| Subdomain | Serves | Mechanism |
|---|---|---|
| ~~`marketing.digitalsoftwaremarket.ai`~~ | now the standalone `dsm-marketing` project, not this one | — |
| ~~`agentic.digitalsoftwaremarket.ai`~~ | now the standalone `dsm-agentic-services` project, not this one | — |
| `creatives.digitalsoftwaremarket.ai` | existing `RegisteredCreatives` page | in-app: `App.tsx` swaps the `/` route's component for this hostname; every other route is the same SPA |
| `admin.digitalsoftwaremarket.ai` | `admin-app/` | edge 200 rewrite |

DNS: `creatives.` and `admin.` are still proxied CNAMEs to `digimax-93q.pages.dev`,
same pattern as the existing `beta.digitalsoftwaremarket.ai`. `marketing.` and
`agentic.` are now CNAMEs to `dsm-marketing-4ye.pages.dev` and
`dsm-agentic-services.pages.dev` respectively. The root domain and `www` are
untouched (still point at the separate `dsm-agentic` project pending a later,
separately-approved cutover).

## How it builds

`npm run build` (the Cloudflare build command) runs, in order:

1. `build:admin` — installs `admin-app` deps and builds it with
   `ADMIN_BASE=/admin/`, emitting into `public/admin/` (gitignored artifact).
2. `tsc --noEmit` type-check of the store app.
3. `vite build` for the store — Vite copies everything in `public/`
   (`admin/`, `_redirects`) into `dist/`. (`marketing/` and `services/` were
   both removed from `public/` — see the updates above.)

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
