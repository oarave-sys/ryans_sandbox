# Infusion Daysheets

A streamlined digital replacement for the paper **infusion daysheets** used in a
rheumatology infusion center. It removes the repeated hand-copying of stable
information (patient, MD, DX, drug, dose per kg, frequency, standing premeds,
lab set) that nurses currently redo for **every one of ~120–140 infusions a
week** — an estimated **500–600 hours a year** — so they only fill in what
actually changes day-of.

The current process at the clinic: a daysheet template lives as a document in
NextGen; staff copy it into Word and print one per patient, then hand-fill and
scan it back to the chart. This app generates the sheet **already filled in**,
prints a clean chart-ready copy, and keeps a real, auditable record — dropping
into that existing document-based workflow with no new NextGen cost.

## What it does

- **Patient + regimen profiles** hold the stable data once (medication, dose
  mg/kg or flat, frequency, standing premeds, standing labs, prior-auth).
- **Daily roster** — the whole infusion day at a glance.
- **Pre-filled daysheets** — creating one snapshots the profile so ~80% is
  already complete; the nurse fills only day-of fields.
- **Automatic calculations** — dose = weight × mg/kg (live); "infusion due?"
  flagged from last infusion date + frequency.
- **Import day** — paste the day's schedule (or upload a screenshot, read by
  on-device OCR), match each row to a drug template, review, and **generate every
  pre-filled daysheet in one pass**, then **print the whole stack**.
- **Reusable drug blocks** — templates are composed from shared blocks (loading
  schedule, first-dose/rate split, proceed gates, premed timing, SubQ +
  observation window, bone-agent education/hold packet) so adding a drug means
  turning blocks on, not building a new form.
- **Prep worklist** — day-before readiness view flagging missing weight/labs,
  unverified orders, expiring/expired prior authorization, and any un-cleared
  drug-specific **proceed gate** (e.g. CrCL &gt; 35, uric acid + MD OK, G6PD),
  with a Ready / needs-attention verdict per patient.
- **Barcode vial scanning** — GS1 DataMatrix / GS1-128 parsing (USB scanner or
  camera) auto-fills lot #, expiration, and tallies vial counts.
- **Print** — a clean, chart-ready daysheet mirroring the paper form.

## Architecture

A small self-hosted web app with three parts, designed to run **inside the
clinic's own network** so it can hold real patient data (PHI):

```
Browser (React SPA)  ──HTTPS──►  Node/Express API  ──►  PostgreSQL
                                   • login + roles (nurse/admin)
                                   • audit log (view/edit/print/sign-in)
                                   • auto session timeout
```

- `src/` — the React + TypeScript client (Vite).
- `server/` — the Express + TypeScript API and Postgres schema.
- `Dockerfile`, `docker-compose.yml`, `.env.example` — self-host deployment.
- **`DEPLOY.md`** — the plain-English runbook for the clinic's IT company.

### PHI / compliance

Patient data lives only in the clinic's own PostgreSQL database on a server the
clinic controls — not in the browser, not in any outside cloud. Because no third
party touches the data, **no BAA is required**. The app implements the
application-level HIPAA safeguards (individual logins, roles, audit logging,
automatic sign-off, forced password change); the clinic's IT handles TLS,
disk encryption, backups, and network restriction — all covered in `DEPLOY.md`.

## Run it locally (for development)

Two processes: the API server (with Postgres) and the Vite dev server.

```bash
# 1. Server — needs a Postgres database.
cd server
npm install
DATABASE_URL=postgres://USER:PASS@localhost:5432/daysheets \
  SESSION_SECRET=dev-secret ADMIN_PASSWORD=changeme \
  npm run dev            # API on :8080

# 2. Client (in another terminal, from the repo root).
npm install
npm run dev              # UI on :5173, proxies /api to :8080
```

Sign in as `admin` with the `ADMIN_PASSWORD` you set; you'll be prompted to
change it. Create nurse accounts under **Admin → Users**.

## Deploy it (for real use)

See **[`DEPLOY.md`](./DEPLOY.md)**. In short, on a clinic-controlled server with
Docker:

```bash
cp .env.example .env     # set strong secrets
docker compose up -d --build
```

## Medication templates

The bundled templates cover the infusion/injection formulary — Actemra,
Benlysta, Cimzia, Cosentyx, Evenity, Ilaris, Krystexxa, Ocrevus, Orencia,
Prolia, Reclast, Remicade, plus Renflexis, Simponi Aria, and Rituxan seen on the
schedule. They provide each drug's **structure** (route, schedule shape, safety
gates, premed protocol, monitoring/hold text) and its visit frequency. **Clinical
dose amounts and gate thresholds are intentionally left blank** for staff to
enter and confirm against each patient's actual order. Templates are
**illustrative structure, not medical advice**, and all on-screen calculations
are aids the nurse verifies.

## Tech

React + TypeScript + Vite (client); Node + Express + PostgreSQL (server);
sessions via `express-session`, passwords via `bcrypt`. Minimal dependencies.
