# Infusion Daysheets

A streamlined digital replacement for the paper **infusion daysheets** used in a
rheumatology infusion center. It attacks the single biggest time sink in the
current process: nurses hand-copying the same stable information — patient, MD,
DX, drug, dose per kg, frequency, standing premeds, lab set — onto a fresh sheet
for **every one of ~120–140 infusions a week**, just to get to the handful of
fields that actually change day-of.

At that volume the clinic spends an estimated **500–600 hours a year** on these
sheets. This app removes the repeated data entry so the nurse only fills in what
is genuinely new each visit.

## How it saves time

- **Patient + regimen profiles** hold the stable data once. A regimen captures
  the medication, dose (mg/kg or flat), frequency, standing premeds, and standing
  labs.
- **Daily roster** shows the whole infusion day at a glance instead of a paper
  stack — navigate by date, see who is scheduled, who is due, and what is done.
- **Pre-filled daysheets.** Creating a daysheet snapshots the profile so ~80% of
  the form is already complete. The nurse fills only the day-of fields (weight,
  IV access, lot #s, vitals, times, signatures).
- **Automatic calculations:**
  - Dose = current weight × mg/kg, shown live (e.g. `3 mg/kg × 70 kg = 210 mg`).
  - "Infusion due?" is flagged automatically from the last infusion date + the
    every-N-weeks frequency (due / overdue / due-in-N-days).
  - Standing labs and premeds are pre-checked.
- **Print** produces a clean, chart-ready daysheet that mirrors the paper form,
  so it drops straight into the existing workflow.
- **Marking a visit completed** advances the regimen's last-infusion date, so the
  next visit's due calculation stays correct with no extra bookkeeping.

Every field on the original paper daysheet has a home here: scheduling / MD
visit, clinical review (infusion due, last INF date, labs, previous weight &
dose), dosing, premeds, IV access (side / location / gauge / attempts / failed),
medication lots (lot # / exp / vials), and administration & vitals (start/stop
times, temps, weight, BP, pulse, completed by, charted by).

## ⚠️ Privacy / PHI — read this first

This build stores **all data locally in the browser on the device** (IndexedDB).
**Nothing is sent to any server.** That is a deliberate choice: it keeps the app
clear of PHI transmission while the workflow is being validated.

Consequences of local-only storage:

- Data lives in **one browser on one device**. A different device or browser will
  not see it. Clearing browser data deletes it.
- Use **Backup → Export** regularly to save a JSON backup, and to move data
  between devices.

**Before entering any real patient information**, decide on a compliant
deployment. A production version for real PHI needs, at minimum: a HIPAA
Business Associate Agreement (BAA) with the hosting/database provider,
authentication, per-user access control, audit logging, encryption at rest and
in transit, and backups. The code is structured so the data layer (`src/db.ts`)
can be swapped for a compliant backend (e.g. Supabase with a signed BAA) without
rewriting the UI — every component talks to the data layer, not to storage
directly. The seeded demo patients are tagged **(DEMO)** and are obviously fake.

## Running it

```bash
npm install
npm run dev      # start the dev server (Vite prints the local URL)
```

Other scripts:

```bash
npm run build    # type-check + production build into dist/
npm run preview  # serve the production build locally
npm run typecheck
```

The app seeds a few obviously-fake demo patients/regimens on first run so you can
click around immediately. Use **Backup → Clear all data** to start empty.

## Project structure

```
src/
  types.ts               Data model (Provider, Patient, Regimen, Encounter)
  db.ts                  Local IndexedDB persistence (Dexie) + export/import
  calc.ts                Dose calc, due-date logic, date helpers (pure functions)
  factory.ts             Builds a pre-filled daysheet from a patient + regimen
  seed.ts                Demo data + common rheum medication templates
  useLive.ts             Hook: subscribe a component to live data changes
  App.tsx                Top-level navigation (Roster / Patients / Backup)
  components/
    Roster.tsx           Daily roster + "add to roster"
    Daysheet.tsx         The full daysheet editor (live calc + due flag)
    DaysheetPrint.tsx    Clean, chart-ready print layout
    Patients.tsx         Patient list + regimen management
    PatientForm.tsx      Add / edit a patient
    RegimenForm.tsx      Add / edit a regimen (with medication templates)
    BackupPanel.tsx      Export / import / reset local data
```

## Notes on the medication templates

The bundled templates (Remicade, Rituxan, Actemra, Orencia, Benlysta, Reclast)
provide common starting doses and frequencies as a convenience for setting up a
regimen quickly. **They are illustrative defaults, not medical advice** — every
value must be confirmed against each patient's actual order. All on-screen
calculations are aids that the nurse always verifies.

## Tech

Vite + React + TypeScript, Dexie (IndexedDB). Minimal dependencies, no backend.
