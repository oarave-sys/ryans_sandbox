# Deployment Runbook — Infusion Daysheets

**Audience:** the clinic's IT company / administrator.
**Goal:** run this application on a server the clinic controls, so it can hold
real patient data (PHI) safely and legally.

This app is a small, self-contained web application (a UI + an API + a
PostgreSQL database). It is designed to run **inside the clinic's own
network**, on infrastructure you already manage. Because patient data never
leaves the clinic's control and no outside company touches it, **no
third-party Business Associate Agreement (BAA) is required** — the data stays
within the covered entity. You are still responsible for the standard HIPAA
Security Rule safeguards listed below; the app implements the application-level
ones for you.

> **Not legal advice.** Confirm the deployment with whoever owns the clinic's
> HIPAA Security Rule compliance before entering real patient data.

---

## What the application already does (so you don't have to build it)

- **Individual logins** — every user has their own username/password (hashed
  with bcrypt). No shared accounts.
- **Roles** — `nurse` and `admin`. Only admins manage users and view the audit
  log.
- **Audit trail** — every sign-in, view, create, edit, delete, and print of a
  record is recorded with the user, timestamp, and IP. Admins can review it in
  the app (Admin → Audit log); it also lives in the `audit_log` database table.
- **Automatic sign-off** — the browser signs a user out after 15 minutes idle,
  and the server session expires after `SESSION_MINUTES` (default 30).
- **Forced password change** — the seeded admin, and any user you create, must
  set a new password at first sign-in.

## What you (IT) set up once

1. **Run the app** (below).
2. **HTTPS/TLS** in front of it (reverse proxy — below).
3. **Encryption at rest** — enable disk/volume encryption on the server (e.g.
   LUKS, BitLocker, or your hypervisor/cloud disk encryption). PostgreSQL data
   lives in the `db-data` Docker volume.
4. **Backups** — schedule database backups and test a restore (below).
5. **Network** — keep the server on the clinic LAN/VPN; do not expose it to the
   public internet. The compose file only publishes the app on `127.0.0.1`.

---

## Prerequisites

- A Linux server (or VM) the clinic controls, with **Docker** and the **Docker
  Compose plugin** installed.
- 1 vCPU / 1 GB RAM / a few GB disk is plenty for this workload.

## Quick start

```bash
# 1. Get the code onto the server (git clone or copy the folder), then:
cd infusion-daysheets

# 2. Create your secrets file from the template and edit it.
cp .env.example .env
#    - set POSTGRES_PASSWORD to a long random string
#    - set SESSION_SECRET   to a long random string (openssl rand -hex 32)
#    - set ADMIN_PASSWORD   to a strong temporary password

# 3. Build and start.
docker compose up -d --build

# 4. Confirm it's healthy.
curl -s http://127.0.0.1:8080/api/health      # -> {"ok":true}
```

Then browse to the server (through the HTTPS proxy you set up next), sign in as
`admin` with the temporary password, and change it when prompted. Create a user
account for each nurse under **Admin → Users**.

---

## HTTPS / TLS reverse proxy (required)

Never serve PHI over plain HTTP. Put a reverse proxy in front that terminates
TLS. **Caddy** is the simplest (automatic certificates). Minimal `Caddyfile`
for an internal hostname with your own certificate:

```
daysheets.clinic.local {
    tls /etc/ssl/daysheets.crt /etc/ssl/daysheets.key
    reverse_proxy 127.0.0.1:8080
}
```

nginx works equally well. Whichever you use, once HTTPS is in front, set these
in `.env` and restart (`docker compose up -d`):

```
SECURE_COOKIES=1
TRUST_PROXY=1
```

---

## Backups (required) and restore

The **database is the source of truth** — back it up on a schedule and store
copies securely (encrypted, off the box).

Nightly backup (e.g. a cron job at 1am):

```bash
docker compose exec -T db pg_dump -U daysheets daysheets \
  | gzip > /secure-backups/daysheets-$(date +%F).sql.gz
```

Restore into a fresh database:

```bash
gunzip -c /secure-backups/daysheets-2026-08-12.sql.gz \
  | docker compose exec -T db psql -U daysheets daysheets
```

Test a restore at least once so you know it works. Keep backups encrypted and
retained per the clinic's retention policy.

---

## Updating the app

```bash
git pull                       # get the new version
docker compose up -d --build   # rebuild and restart; data volume is preserved
```

The database schema is applied automatically on startup and is safe to re-run.

## Operations cheat-sheet

```bash
docker compose ps              # status
docker compose logs -f app     # app logs
docker compose logs -f db      # database logs
docker compose down            # stop (keeps data)
docker compose down -v         # stop AND DELETE the database volume (careful!)
```

## Environment variables

| Variable | Purpose |
|---|---|
| `POSTGRES_PASSWORD` | Database password (required) |
| `SESSION_SECRET` | Signs login sessions; 32+ random chars (required) |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | First admin account, created on first boot |
| `SESSION_MINUTES` | Server session lifetime (default 30) |
| `SECURE_COOKIES` | `1` when HTTPS is in front (recommended) |
| `TRUST_PROXY` | `1` when behind a reverse proxy |

---

## Security checklist (hand this to whoever signs off compliance)

- [ ] App runs on clinic-controlled infrastructure (no third-party hosting) ✅ by design
- [ ] Individual user accounts, no shared logins ✅ built in
- [ ] Audit logging of access and changes ✅ built in
- [ ] Automatic session timeout ✅ built in
- [ ] HTTPS/TLS in front of the app ⬜ you configure
- [ ] Disk/volume encryption at rest ⬜ you configure
- [ ] Scheduled, encrypted, tested backups ⬜ you configure
- [ ] Server restricted to the clinic LAN/VPN ⬜ you configure
- [ ] Strong secrets in `.env`, file kept private ⬜ you configure
- [ ] Compliance owner has reviewed and signed off ⬜ clinic

## Optional: on-device schedule OCR (Import Day → upload image)

The **Import Day** screen can read a photo/screenshot of the day's schedule.
OCR runs entirely in the browser (tesseract.js) — the image never leaves the
clinic network, so it does not change the PHI/BAA posture.

By default tesseract.js fetches its worker, WASM core, and English language data
from a public CDN. A locked-down clinic network will block that. For a fully
offline install, self-host those assets and point the app at them:

1. Serve `tesseract.js-core` (WASM), the tesseract worker script, and
   `eng.traineddata.gz` from your own server (e.g. `/ocr/`).
2. Set `workerPath`, `corePath`, and `langPath` in `src/schedule.ts`
   (`createWorker` options) to those local URLs, then rebuild.

Until that is configured, use the **Paste text** tab instead — it needs no
network and is the more reliable input in any case.
