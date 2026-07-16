# DSM Admin — Desktop App (macOS & Windows)

A cross-platform desktop app (Tauri) so the DSM admin works even when the VPS is down. Bundle id: `ai.aljashtrading.dsm.admin`.

## What it needs (once, before building)
- **Node** 18+ and **npm** (already on this Mac)
- **Rust** (`rustup`) — already installed here (`~/.cargo/bin`)
- Tauri CLI (comes via the repo's dev dependency; `npm run tauri` invokes it)

---

## macOS build (do this on a Mac)
```sh
cd ~/Desktop/waleed_codes/p83/admin-app
npm install            # first time only
npm run tauri:build
```
**Output:**
- App bundle: `src-tauri/target/release/bundle/macos/DSM Admin.app`
- Installer:  `src-tauri/target/release/bundle/dmg/DSM Admin_<version>_aarch64.dmg`

**Install:** open the `.dmg`, drag **DSM Admin** to Applications, launch it.
First launch may warn "unidentified developer" (the build is unsigned) → right-click → **Open**, or
System Settings → Privacy & Security → **Open Anyway**. (To ship signed/notarized, add an Apple
Developer cert + `tauri.conf.json > bundle.macOS.signingIdentity` — see "Signing" below.)

---

## Windows build (.exe / .msi)
Tauri can't cross-compile Windows from a Mac — build on Windows **or** in CI.

### Option A — on a Windows PC
```powershell
# install: Node LTS, Rust (rustup), and "Desktop development with C++" (VS Build Tools)
cd admin-app
npm install
npm run tauri:build
# output: src-tauri\target\release\bundle\msi\DSM Admin_<version>_x64_en-US.msi
#         src-tauri\target\release\bundle\nsis\DSM Admin_<version>_x64-setup.exe
```
**Install:** run the `.msi` (or `-setup.exe`), click through, launch from Start menu.

### Option B — GitHub Actions (no Windows machine needed)
Add `.github/workflows/desktop.yml`:
```yaml
name: build-desktop
on: { workflow_dispatch: {} }
jobs:
  build:
    strategy: { matrix: { os: [macos-latest, windows-latest] } }
    runs-on: ${{ matrix.os }}
    defaults: { run: { working-directory: admin-app } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - uses: dtolnay/rust-toolchain@stable
      - run: npm install
      - run: npm run tauri:build
      - uses: actions/upload-artifact@v4
        with:
          name: dsm-admin-${{ matrix.os }}
          path: |
            admin-app/src-tauri/target/release/bundle/dmg/*.dmg
            admin-app/src-tauri/target/release/bundle/msi/*.msi
            admin-app/src-tauri/target/release/bundle/nsis/*.exe
```
Push, then run the workflow from the Actions tab → download the `.dmg` + `.msi`/`.exe` artifacts.

---

## First-run configuration (both platforms)
Open the app → **Settings** tab, and set (stored in the OS config dir, never committed):
- **VPS base**: `https://dsm-api.techrealm.ai` (products/search/AI)
- **Ecommerce URL** + **secret**: the Apps Script exec URL + API secret (orders/telemetry)
- **Telemetry / Orders sheet IDs**: `1MZykNN5r-…` / `1BeHD5fa6ve…` (heatmaps + orders)
- codex/simli keys are optional (health board only)

The app degrades gracefully: if the VPS is down, Products shows "offline — edits queue"; Orders/Analytics
read the Google Sheets directly (once the sheets are shared / read endpoint deployed).

## Signing (optional, for distribution)
- **macOS**: Apple Developer ID cert → set `bundle.macOS.signingIdentity` + notarize (`xcrun notarytool`).
- **Windows**: an Authenticode cert → `bundle.windows.certificateThumbprint`.
Unsigned builds run fine locally; signing only removes the OS "unidentified developer" prompt.
