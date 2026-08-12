// Data model for the infusion daysheet application.
//
// Design note: the paper daysheet mixes two kinds of information:
//   1. STABLE data that rarely changes between visits (patient, MD, DX, drug,
//      dose per kg, frequency, standing premeds, standing labs). This lives on
//      the Patient + Regimen records and is entered once.
//   2. PER-VISIT data captured the day of the infusion (weight, computed dose,
//      IV access, lot numbers, vitals, times, signatures). This lives on the
//      Encounter record and is the only thing a nurse fills in each day.
//
// Separating them is the whole point: it removes the repeated hand-copying that
// currently costs the clinic hundreds of hours a year.

export type ID = string;

/** Ordering / diagnosing physician. */
export interface Provider {
  id: ID;
  name: string;
  active: boolean;
}

/** A patient of the infusion center. Stable demographics only. */
export interface Patient {
  id: ID;
  firstName: string;
  lastName: string;
  mrn?: string; // medical record number
  dob?: string; // ISO date (YYYY-MM-DD)
  providerId?: ID; // primary MD
  diagnosis?: string; // DX, e.g. "Rheumatoid arthritis"
  notes?: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export type DoseMode = "per_kg" | "flat";
export type DoseUnit = "mg" | "g";
export type Route = "IV" | "SubQ";

/** A single premed line on a standing order (e.g. Tylenol, Zyrtec 10 mg). */
export interface PremedTemplate {
  name: string;
  dose?: string; // free text, e.g. "10 mg", "650 mg PO"
  timing?: string; // e.g. "30 min before infusion, IVP over 5 min"
  standing: boolean; // pre-checked ("give every visit") vs available-but-optional
}

/**
 * A pre-infusion condition that must clear before proceeding — e.g. Reclast's
 * "CrCL must be over 35", Krystexxa's stat uric acid + "MD okayed to proceed"
 * and G6PD result, Actemra's lipid panel timing. Thresholds are intentionally
 * left blank on the bundled templates for clinical staff to fill against the
 * real order; the structure is what the app provides.
 */
export interface ProceedGate {
  label: string; // "CrCL must be over 35"
  threshold?: string; // the passing value — blank by default
  requiresValue?: boolean; // a result must be charted (e.g. a lab value)
  requiresMdOk?: boolean; // an explicit "MD okayed to proceed" is required
}

/** Day-of capture of a proceed gate: the charted value and whether it cleared. */
export interface GateResult {
  label: string;
  requiresValue?: boolean;
  requiresMdOk?: boolean;
  value?: string; // charted result (e.g. the uric acid / CrCL value)
  mdOk?: boolean; // MD confirmed proceed
  cleared: boolean; // nurse confirms the condition is met
}

/**
 * A standing medication order for a patient. One patient can have more than one
 * active regimen (rare, but possible), and the daysheet is generated per
 * regimen because "we have to do this for every single medication".
 */
export interface Regimen {
  id: ID;
  patientId: ID;
  medicationName: string; // e.g. "Infliximab (Remicade)"
  doseMode: DoseMode; // per_kg (weight-based) or flat
  doseValue: number; // mg/kg when per_kg, else absolute amount
  doseUnit: DoseUnit; // unit for a flat dose (ignored for per_kg display of mg/kg)
  frequencyWeeks: number; // "every ___ weeks"
  route?: string; // e.g. "IV", "Rapid Remicade", "SubQ"
  administrationNote?: string; // e.g. "infuse over 2 hr", "rapid over 1 hr"
  premeds: PremedTemplate[];
  standingLabs: string[]; // e.g. ["CBC", "CRP", "ESR", "CMP"]
  lastInfusionDate?: string; // ISO date of the most recent completed infusion
  // Prior authorization tracking — a common cause of day-of cancellations.
  priorAuthNumber?: string;
  priorAuthExpires?: string; // ISO date the authorization lapses
  priorAuthDosesRemaining?: number; // doses left on the current authorization

  // --- Reusable daysheet blocks (all optional; a drug turns on what it needs) ---
  scheduleNote?: string; // "at weeks 0, 2, 4 then every 4 weeks", "every 6 months"
  firstDoseNote?: string; // loading/rate split, e.g. "6 mg/kg IV × 1 then 1.75 mg/kg q4w"
  maxDosePerPa?: string; // "MAX DOSE per PA" line (value left blank on templates)
  gates?: ProceedGate[]; // pre-infusion conditions that must clear
  injectionSites?: string[]; // SubQ site options, e.g. ["R Abd","L Abd","R thigh","L thigh"]
  observationMinutes?: string; // post-dose observation window, e.g. "15-30", "60"
  firstDoseItems?: string[]; // "1st dose items to review/explain"
  educationPoints?: string[]; // "Ongoing education" bullets
  holdCriteria?: string[]; // "Hold ___ if:" bullets
  tracksBoneHealth?: boolean; // show DEXA / calcium / note-to-provider block

  notes?: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * Day-before readiness checklist for a visit. These are the manual acknowledgment
 * flags a nurse sets during prep; the rest of readiness (due status, auth expiry,
 * weight on file) is computed from data. When labs/orders come from NextGen via
 * an interface later, labsOnFile/orderVerified can be set automatically.
 */
export interface PrepChecklist {
  labsOnFile: boolean; // required labs are resulted / on file
  orderVerified: boolean; // a current, signed order exists
  authVerified: boolean; // prior auth confirmed valid for this visit
  note?: string;
}

export type YesNo = "yes" | "no" | "";

export interface IVAccess {
  side: "R" | "L" | "";
  location: "FA" | "AC" | "Hand" | "Wrist" | ""; // forearm / antecubital / hand / wrist
  gauge: "22" | "24" | "";
  attempts?: number;
  failed: boolean;
}

export interface MedLot {
  lotNo: string;
  exp: string; // MM/YYYY or MM/YY as charted
  vials?: number;
}

/** A premed as actually given at the visit (checkbox on the sheet). */
export interface PremedGiven {
  name: string;
  dose?: string;
  timing?: string;
  given: boolean;
  timeGiven?: string; // clock time the premed was administered
}

export type EncounterStatus =
  | "scheduled" // on the roster, not started
  | "in_progress" // start time entered
  | "completed" // stop time entered
  | "canceled";

/**
 * One infusion visit for one regimen = one daysheet. Every field on the paper
 * form has a home here; per-visit fields start blank and stable fields are
 * copied from the Patient/Regimen at generation time so they can be edited
 * without mutating the standing order.
 */
export interface Encounter {
  id: ID;
  regimenId: ID;
  patientId: ID;
  date: string; // ISO date (YYYY-MM-DD) of the appointment
  apptTime?: string; // HH:MM

  // --- Snapshot of stable data (editable copy taken at generation) ---
  medicationName: string;
  providerName?: string;
  diagnosis?: string;

  // --- Scheduling / visit coordination (top of the sheet) ---
  mdVisitNeeded: YesNo;
  mdVisitSameDay?: boolean;
  mdVisitTime?: string;
  dateToBeScheduled?: string; // ISO date

  // --- Clinical review ---
  infusionDue: YesNo;
  lastInfusionDate?: string; // ISO date, snapshot for reference
  labsOrdered: string[]; // checked labs for this visit
  labsOther?: string; // the "+ ______" free field
  previousWeight?: number; // lbs or kg per clinic convention (see weightUnit)
  previousDose?: string;

  // --- Dosing ---
  weight?: number; // current weight used for dose calc
  weightUnit: "kg" | "lb";
  computedDose?: string; // human-readable result of the calc, editable
  doseEveryWeeks?: number; // snapshot of frequency

  // --- Snapshot of drug-specific blocks (copied at generation for reference) ---
  route?: string; // "IV" | "SubQ" | free text
  scheduleNote?: string;
  firstDoseNote?: string;
  maxDosePerPa?: string;
  firstDoseVisit?: boolean; // flag this as a loading / first dose

  // --- Proceed gates (day-of results) ---
  gateResults?: GateResult[];

  // --- Premeds given ---
  premedsGiven: PremedGiven[];

  // --- IV access (infusions) ---
  iv: IVAccess;

  // --- SubQ injection (used instead of IV access when route is SubQ) ---
  injectionSite?: string;

  // --- Post-dose observation (Krystexxa, Ilaris, SubQ agents) ---
  observationMinutes?: string; // snapshot of the required window
  observationEnd?: string; // clock time observation ended
  lastTemp?: string;

  // --- Bone-health tracking (Prolia, Evenity, Reclast) ---
  tracksBoneHealth?: boolean; // snapshot
  dexaDate?: string;
  calciumValue?: string;
  noteToProviderSent?: YesNo;

  // --- Medication lots ---
  lots: MedLot[];

  // --- Administration & vitals ---
  startTime?: string;
  startTemp?: string;
  startWeight?: number;
  stopTime?: string;
  endTemp?: string;
  completedBy?: string;
  chartedBy?: string;
  vitalsTime?: string;
  bp?: string;
  pulse?: string;

  // Day-before readiness checklist (optional; absent on older records).
  prep?: PrepChecklist;

  status: EncounterStatus;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}
