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

/** A single premed line on a standing order (e.g. Tylenol, Zyrtec 10 mg). */
export interface PremedTemplate {
  name: string;
  dose?: string; // free text, e.g. "10 mg", "650 mg PO"
  standing: boolean; // pre-checked ("give every visit") vs available-but-optional
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
  notes?: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
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
  given: boolean;
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

  // --- Premeds given ---
  premedsGiven: PremedGiven[];

  // --- IV access ---
  iv: IVAccess;

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

  status: EncounterStatus;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}
