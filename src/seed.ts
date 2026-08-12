// Medication templates used as quick-pick defaults in the regimen form.
//
// Doses/frequencies are common starting points for illustration only and MUST
// be confirmed against each patient's actual order — they are not medical advice.
//
// (This module used to also seed demo patients into local storage. Now that PHI
// lives in the server database, the app starts empty and the clinic enters real
// patients; only these clinical templates remain.)

import type { PremedTemplate, Regimen } from "./types";

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
    doseMode: "per_kg", doseValue: 3, doseUnit: "mg", frequencyWeeks: 8,
    route: "IV — Rapid Remicade", administrationNote: "Rapid infusion over ~1 hr if tolerated",
    premeds: [TYLENOL, ZYRTEC, BENADRYL], standingLabs: ["CBC", "CRP", "ESR", "CMP"],
  },
  {
    medicationName: "Rituximab (Rituxan)",
    doseMode: "flat", doseValue: 1000, doseUnit: "mg", frequencyWeeks: 24,
    route: "IV", administrationNote: "Two doses 2 weeks apart, then every 24 weeks",
    premeds: [TYLENOL, BENADRYL, SOLUMEDROL], standingLabs: ["CBC", "CMP"],
  },
  {
    medicationName: "Tocilizumab (Actemra)",
    doseMode: "per_kg", doseValue: 8, doseUnit: "mg", frequencyWeeks: 4,
    route: "IV", premeds: [], standingLabs: ["CBC", "CMP", "Lipid panel"],
  },
  {
    medicationName: "Abatacept (Orencia)",
    doseMode: "flat", doseValue: 750, doseUnit: "mg", frequencyWeeks: 4,
    route: "IV", administrationNote: "Weight-banded: <60 kg 500 mg, 60–100 kg 750 mg, >100 kg 1000 mg",
    premeds: [], standingLabs: ["CBC", "CMP"],
  },
  {
    medicationName: "Belimumab (Benlysta)",
    doseMode: "per_kg", doseValue: 10, doseUnit: "mg", frequencyWeeks: 4,
    route: "IV", premeds: [], standingLabs: ["CBC", "CMP"],
  },
  {
    medicationName: "Zoledronic acid (Reclast)",
    doseMode: "flat", doseValue: 5, doseUnit: "mg", frequencyWeeks: 52,
    route: "IV", administrationNote: "Infuse over at least 15 min; ensure hydration",
    premeds: [TYLENOL], standingLabs: ["CMP"],
  },
];

export function templateToRegimenFields(
  t: MedTemplate
): Omit<Regimen, "id" | "patientId" | "active" | "createdAt" | "updatedAt" | "lastInfusionDate" | "notes" | "priorAuthNumber" | "priorAuthExpires" | "priorAuthDosesRemaining"> {
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
