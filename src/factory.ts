// Builds a fresh daysheet (Encounter) for a regimen on a given date, copying a
// snapshot of the stable patient/regimen data so the day-of edits never mutate
// the standing order. This is the heart of the time savings: the nurse opens a
// sheet that is already ~80% filled in.

import { newId } from "./db";
import type { Encounter, GateResult, Patient, Provider, Regimen } from "./types";
import type { MedTemplate } from "./seed";
import { templateToRegimenFields } from "./seed";

/** Snapshot a regimen's proceed gates into blank day-of results. */
function gatesToResults(regimen: Regimen): GateResult[] | undefined {
  if (!regimen.gates?.length) return undefined;
  return regimen.gates.map((g) => ({
    label: g.label,
    requiresValue: g.requiresValue,
    requiresMdOk: g.requiresMdOk,
    cleared: false,
  }));
}

export function generateEncounter(
  patient: Patient,
  regimen: Regimen,
  providers: Provider[],
  date: string,
  apptTime?: string
): Encounter {
  const provider = providers.find((p) => p.id === patient.providerId);
  const ts = Date.now();
  return {
    id: newId("enc"),
    regimenId: regimen.id,
    patientId: patient.id,
    date,
    apptTime,
    medicationName: regimen.medicationName,
    providerName: provider?.name,
    diagnosis: patient.diagnosis,
    mdVisitNeeded: "",
    infusionDue: "",
    lastInfusionDate: regimen.lastInfusionDate,
    labsOrdered: [...regimen.standingLabs],
    weightUnit: "lb",
    doseEveryWeeks: regimen.frequencyWeeks,
    // --- snapshot of drug-specific blocks ---
    route: regimen.route,
    scheduleNote: regimen.scheduleNote,
    firstDoseNote: regimen.firstDoseNote,
    maxDosePerPa: regimen.maxDosePerPa,
    gateResults: gatesToResults(regimen),
    observationMinutes: regimen.observationMinutes,
    tracksBoneHealth: regimen.tracksBoneHealth,
    premedsGiven: regimen.premeds.map((p) => ({ name: p.name, dose: p.dose, timing: p.timing, given: false })),
    iv: { side: "", location: "", gauge: "", failed: false },
    lots: [{ lotNo: "", exp: "", vials: undefined }],
    status: "scheduled",
    createdAt: ts,
    updatedAt: ts,
  };
}

/** Build a regimen for a patient from a bundled medication template. */
export function regimenFromTemplate(template: MedTemplate, patientId: string): Regimen {
  const ts = Date.now();
  return {
    id: newId("reg"),
    patientId,
    ...templateToRegimenFields(template),
    active: true,
    createdAt: ts,
    updatedAt: ts,
  };
}
