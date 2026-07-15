# DSM member auto-emails — renewal reminders + new-launch alerts

Server-side scheduled job behind the DSM members portal. It sends the two
recurring member emails the `/account` dashboard promises:

- **Renewal reminders** — for every license whose expiry falls inside a reminder
  window (default **30 / 7 / 1 days** before expiry), email the owner once per
  window so they renew before losing access and keep their member discount.
- **New-launch alerts** — when a product is marked `active` in `launches.json`,
  email every opted-in **insider** once about it.

Stdlib-only Python (no pip installs). Idempotent via a JSON ledger, so re-runs
and overlapping schedules never double-send. Mirrors the frontend account model
in `src/lib/account.ts` (same expiry derivation, same insider opt-in semantics).

## Data flow

```
Ecommerce Apps Script (STABLE)                 mailcli.py (STABLE email path)
  action=orders   ─► licenses + expiry ─┐
  action=members  ─► insider opt-ins ───┼─► dsm_member_emails.py ─► sendEmail
  action=telemetry (fallback opt-ins) ──┘        │
                                                 └─► state.json (idempotency ledger)
```

No browser, no VPS Flask API, no LLM — only the two STABLE backends.

## What the cron NEEDS (the ask)

1. **Apps Script READ access** to the STABLE Ecommerce script:
   - `DSM_APPS_SCRIPT_URL` (public web-app URL, already known).
   - `DSM_APPS_SCRIPT_SECRET` (the shared secret from BUILD_CONTEXT — server-only).
   - The script must answer secret-authenticated GETs:
     - `action=orders` → order rows (already implemented; used by the admin app).
     - `action=members` → member rows with `email` + `insider` (RECOMMENDED). If
       not implemented, the job falls back to deriving opt-in state from
       `action=telemetry` (`member_insider_optin` / `member_insider_optout`
       events). **If neither is available, renewal reminders still run** (they are
       transactional) but **launch alerts are skipped** (they require opt-in).
2. **A mail sender**: the same `mailcli.py` the site's mail bridge uses.
   - `DSM_MAILCLI_PATH` → path to `mailcli.py` on the host.
   - The mail secret lives only in mailcli's own config (never here).
   - The cron runs `python3 mailcli.py sendEmail '<json>' [--endpoint <ep>]`.
   - ⚠️ `mailcli.py` currently lives on the Mac at
     `/Users/hico/claude-employee/mailcli.py`. To run on the VPS, deploy
     `mailcli.py` + its mail config there, OR run this timer on the Mac/admin host
     that already has it. (Alternatively point `DSM_MAILCLI_PATH` at any wrapper
     exposing the same `sendEmail '<json>'` contract.)
3. **A writable state dir** for the idempotency ledger (`DSM_STATE_PATH`,
   default `/var/lib/dsm/...` under systemd `StateDirectory`).
4. **(Optional) a launches feed** `launches.json` — edit + set `active:true` to
   fire a new-launch blast; each `id` is sent to each insider exactly once.

All config is environment-driven; see `member-emails.env.example`. Nothing
secret is committed.

## Deploy on the VPS (systemd timer)

```bash
# 1. Files
sudo mkdir -p /opt/dsm/renewal-cron /etc/dsm /var/lib/dsm
sudo cp dsm_member_emails.py launches.json /opt/dsm/renewal-cron/

# 2. Secrets (chmod 600, root-owned — NOT in git)
sudo cp member-emails.env.example /etc/dsm/member-emails.env
sudo nano /etc/dsm/member-emails.env      # fill in the secret + mailcli path
sudo chmod 600 /etc/dsm/member-emails.env

# 3. Dry run first (logs what WOULD send, sends nothing)
sudo env $(grep -v '^#' /etc/dsm/member-emails.env | xargs) \
     DSM_DRY_RUN=1 python3 /opt/dsm/renewal-cron/dsm_member_emails.py

# 4. Install the timer
sudo cp dsm-member-emails.service dsm-member-emails.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dsm-member-emails.timer
systemctl list-timers dsm-member-emails.timer      # confirm next run
journalctl -u dsm-member-emails.service -n 50      # inspect a run
```

## Deploy as plain cron (no systemd)

```cron
# /etc/cron.d/dsm-member-emails  (daily 09:00)
0 9 * * *  root  set -a; . /etc/dsm/member-emails.env; set +a; \
  DSM_STATE_PATH=/var/lib/dsm/member-emails-state.json \
  /usr/bin/python3 /opt/dsm/renewal-cron/dsm_member_emails.py >> /var/log/dsm-member-emails.log 2>&1
```

## Safety / idempotency

- `state.json` records each `(email, product, expiry, window)` and each
  `(launch-id, email)` already sent; it is saved incrementally so a crash mid-run
  never re-sends. Delete it only to intentionally allow re-sends.
- Per-recipient send failures are logged and simply retried next run (not marked
  done). A read failure skips that run cleanly — the timer keeps going.
- `DSM_DRY_RUN=1` makes the whole job a no-send rehearsal.
