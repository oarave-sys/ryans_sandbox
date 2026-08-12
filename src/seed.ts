// Demo seed data. Everything here is OBVIOUSLY FAKE — do not enter real patient
// information until you have decided on a compliant deployment. The names are
// tagged "(DEMO)" so seeded records can never be confused with real patients.
//
// The medication templates double as quick-pick defaults in the regimen form.
// Doses/frequencies are common starting points for illustration only and MUST
// be confirmed against each patient's actual order — they are not medical advice.

import { db, newId, isEmpty } from "./db";
import { todayISO, toISODate, parseISODate } from "./calc";
import type { Patient, Provider, Regimen, Encounter, PremedTemplate } from "./types";

export interface MedTemplate {
  medicationName: string;
  doseMode: "per_kg" | "flat";
  doseValue: number;
  doseUnit: "mg" | "g";
  frequencyWeeks: number;
  route: string;
  administrationNote?: string;
  premeds: PremedTemplate[];
  standingLabs: string[];
}

const TYLENOL: PremedTemplate = { name: "Tylenol (acetaminophen)", dose: "650 mg PO", standing: true };
const ZYRTEC: PremedTemplate = { name: "Zyrtec (cetirizine)", dose: "10 mg PO", standing: true };
const BENADRYL: PremedTemplate = { name: "Benadryl (diphenhydramine)", dose: "25 mg", standing: false };
const SOLUMEDROL: PremedTemplate = { name: "Solu-Medrol (methylprednisolone)", dose: "100 mg IV", standing: false };

export const MED_TEMPLATES: MedTemplate[] = [
  {
    medicationName: "Infliximab (Remicade)",
    doseMode: "per_kg",
    doseValue: 3,
    doseUnit: "mg",
    frequencyWeeks: 8,
    route: "IV — Rapid Remicade",
    administrationNote: "Rapid infusion over ~1 hr if tolerated",
    premeds: [TYLENOL, ZYRTEC, BENADRYL],
    standingLabs: ["CBC", "CRP", "ESR", "CMP"],
  },
  {
    medicationName: "Rituximab (Rituxan)",
    doseMode: "flat",
    doseValue: 1000,
    doseUnit: "mg",
    frequencyWeeks: 24,
    route: "IV",
    administrationNote: "Two doses 2 weeks apart, then every 24 weeks",
    premeds: [TYLENOL, BENADRYL, SOLUMEDROL],
    standingLabs: ["CBC", "CMP"],
  },
  {
    medicationName: "Tocilizumab (Actemra)",
    doseMode: "per_kg",
    doseValue: 8,
    doseUnit: "mg",
    frequencyWeeks: 4,
    route: "IV",
    premeds: [],
    standingLabs: ["CBC", "CMP", "Lipid panel"],
  },
  {
    medicationName: "Abatacept (Orencia)",
    doseMode: "flat",
    doseValue: 750,
    doseUnit: "mg",
    frequencyWeeks: 4,
    route: "IV",
    administrationNote: "Weight-banded: <60 kg 500 mg, 60–100 kg 750 mg, >100 kg 1000 mg",
    premeds: [],
    standingLabs: ["CBC", "CMP"],
  },
  {
    medicationName: "Belimumab (Benlysta)",
    doseMode: "per_kg",
    doseValue: 10,
    doseUnit: "mg",
    frequencyWeeks: 4,
    route: "IV",
    premeds: [],
    standingLabs: ["CBC", "CMP"],
  },
  {
    medicationName: "Zoledronic acid (Reclast)",
    doseMode: "flat",
    doseValue: 5,
    doseUnit: "mg",
    frequencyWeeks: 52,
    route: "IV",
    administrationNote: "Infuse over at least 15 min; ensure hydration",
    premeds: [TYLENOL],
    standingLabs: ["CMP"],
  },
];

function weeksAgo(iso: string, weeks: number): string {
  const d = parseISODate(iso)!;
  d.setDate(d.getDate() - weeks * 7);
  return toISODate(d);
}

function daysAway(iso: string, days: number): string {
  const d = parseISODate(iso)!;
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

const now = Date.now();

export async function seedIfEmpty(): Promise<void> {
  if (!(await isEmpty())) return;

  const drDoe: Provider = { id: newId("prov"), name: "Dr. Jordan Doe", active: true };
  const drRoe: Provider = { id: newId("prov"), name: "Dr. Sam Roe", active: true };

  const today = todayISO();

  const patients: Patient[] = [
    {
      id: newId("pat"), firstName: "Ada", lastName: "Testpatient (DEMO)", mrn: "DEMO-1001",
      dob: "1972-04-12", providerId: drDoe.id, diagnosis: "Rheumatoid arthritis", active: true,
      createdAt: now, updatedAt: now,
    },
    {
      id: newId("pat"), firstName: "Ben", lastName: "Sampleman (DEMO)", mrn: "DEMO-1002",
      dob: "1959-11-30", providerId: drRoe.id, diagnosis: "Psoriatic arthritis", active: true,
      createdAt: now, updatedAt: now,
    },
    {
      id: newId("pat"), firstName: "Carol", lastName: "Example (DEMO)", mrn: "DEMO-1003",
      dob: "1985-07-08", providerId: drDoe.id, diagnosis: "Systemic lupus erythematosus", active: true,
      createdAt: now, updatedAt: now,
    },
  ];

  const t0 = MED_TEMPLATES[0]; // Remicade
  const t2 = MED_TEMPLATES[2]; // Actemra
  const t4 = MED_TEMPLATES[4]; // Benlysta

  const regimens: Regimen[] = [
    {
      id: newId("reg"), patientId: patients[0].id, ...templateToRegimenFields(t0),
      lastInfusionDate: weeksAgo(today, 8), notes: "Tolerates rapid infusion well.",
      priorAuthNumber: "AUTH-55021", priorAuthExpires: daysAway(today, 120), priorAuthDosesRemaining: 4,
      active: true, createdAt: now, updatedAt: now,
    },
    {
      id: newId("reg"), patientId: patients[1].id, ...templateToRegimenFields(t2),
      lastInfusionDate: weeksAgo(today, 4),
      priorAuthNumber: "AUTH-55022", priorAuthExpires: daysAway(today, 18), priorAuthDosesRemaining: 2,
      active: true, createdAt: now, updatedAt: now,
    },
    {
      id: newId("reg"), patientId: patients[2].id, ...templateToRegimenFields(t4),
      lastInfusionDate: weeksAgo(today, 5), notes: "Overdue — confirm labs before infusing.",
      priorAuthNumber: "AUTH-55023", priorAuthExpires: daysAway(today, -3), priorAuthDosesRemaining: 0,
      active: true, createdAt: now, updatedAt: now,
    },
  ];

  const tomorrow = daysAway(today, 1);

  // Encounters on today's roster and tomorrow's prep worklist to show the flow.
  const encounters: Encounter[] = [
    makeScheduledEncounter(patients[0], regimens[0], drDoe.name, today, "09:00"),
    makeScheduledEncounter(patients[2], regimens[2], drDoe.name, today, "10:30"),
    // Tomorrow — one ready, one blocked (expired auth), to demonstrate prep flags.
    makeScheduledEncounter(patients[1], regimens[1], drRoe.name, tomorrow, "08:30"),
    makeScheduledEncounter(patients[2], regimens[2], drDoe.name, tomorrow, "11:00"),
  ];
  // Give the "ready" tomorrow patient a weight + completed prep so it shows green.
  encounters[2].previousWeight = 168;
  encounters[2].prep = { labsOnFile: true, orderVerified: true, authVerified: true };

  await db.transaction("rw", db.providers, db.patients, db.regimens, db.encounters, async () => {
    await db.providers.bulkAdd([drDoe, drRoe]);
    await db.patients.bulkAdd(patients);
    await db.regimens.bulkAdd(regimens);
    await db.encounters.bulkAdd(encounters);
  });
}

export function templateToRegimenFields(t: MedTemplate) {
  return {
    medicationName: t.medicationName,
    doseMode: t.doseMode,
    doseValue: t.doseValue,
    doseUnit: t.doseUnit,
    frequencyWeeks: t.frequencyWeeks,
    route: t.route,
    administrationNote: t.administrationNote,
    premeds: t.premeds.map((p) => ({ ...p })),
    standingLabs: [...t.standingLabs],
  };
}

function makeScheduledEncounter(
  patient: Patient,
  regimen: Regimen,
  providerName: string,
  date: string,
  apptTime: string
): Encounter {
  return {
    id: newId("enc"),
    regimenId: regimen.id,
    patientId: patient.id,
    date,
    apptTime,
    medicationName: regimen.medicationName,
    providerName,
    diagnosis: patient.diagnosis,
    mdVisitNeeded: "",
    infusionDue: "",
    lastInfusionDate: regimen.lastInfusionDate,
    labsOrdered: [...regimen.standingLabs],
    weightUnit: "lb",
    doseEveryWeeks: regimen.frequencyWeeks,
    premedsGiven: regimen.premeds.map((p) => ({ name: p.name, dose: p.dose, given: false })),
    iv: { side: "", location: "", gauge: "", failed: false },
    lots: [{ lotNo: "", exp: "", vials: undefined }],
    status: "scheduled",
    createdAt: now,
    updatedAt: now,
  };
}
