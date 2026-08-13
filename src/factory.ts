// Builds a fresh daysheet (Encounter) for a regimen on a given date, copying a
// snapshot of the stable patient/regimen data so the day-of edits never mutate
// the standing order. This is the heart of the time savings: the nurse opens a
// sheet that is already ~80% filled in.

import { newId } from "./db";
import type { Encounter, GateResult, Patient, Provider, ProceedGate, Regimen } from "./types";
import type { MedTemplate } from "./seed";
import { templateToRegimenFields } from "./seed";

/** Snapshot proceed gates into blank day-of results. */
function gatesToResults(gates: ProceedGate[] | undefined): GateResult[] | undefined {
  if (!gates?.length) return undefined;
  return gates.map((g) => ({
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
    dob: patient.dob,
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
    gateResults: gatesToResults(regimen.gates),
    observationMinutes: regimen.observationMinutes,
    tracksBoneHealth: regimen.tracksBoneHealth,
    injectionSites: regimen.injectionSites,
    firstDoseItems: regimen.firstDoseItems,
    educationPoints: regimen.educationPoints,
    holdCriteria: regimen.holdCriteria,
    premedsGiven: regimen.premeds.map((p) => ({ name: p.name, dose: p.dose, timing: p.timing, given: false })),
    iv: { side: "", location: "", gauge: "", failed: false },
    lots: [{ lotNo: "", exp: "", vials: undefined }],
    status: "scheduled",
    createdAt: ts,
    updatedAt: ts,
  };
}

/**
 * Build a self-contained daysheet directly from a medication template, with NO
 * stored patient or regimen. Used by schedule import: the printed sheet carries
 * the correct drug structure with the patient line and DOB left BLANK for the
 * nurse to hand-write. Everything the sheet renders is snapshotted onto the
 * encounter, so no patient/regimen record is created.
 */
export function encounterFromTemplate(
  template: MedTemplate,
  date: string,
  apptTime?: string,
  providerName?: string
): Encounter {
  const ts = Date.now();
  return {
    id: newId("enc"),
    regimenId: "", // no stored regimen
    patientId: "", // no stored patient — patient line prints blank
    date,
    apptTime,
    medicationName: template.medicationName,
    providerName,
    mdVisitNeeded: "",
    infusionDue: "",
    labsOrdered: [...template.standingLabs],
    weightUnit: "lb",
    doseEveryWeeks: template.frequencyWeeks,
    route: template.route,
    scheduleNote: template.scheduleNote,
    firstDoseNote: template.firstDoseNote,
    maxDosePerPa: template.maxDosePerPa,
    gateResults: gatesToResults(template.gates),
    observationMinutes: template.observationMinutes,
    tracksBoneHealth: template.tracksBoneHealth,
    injectionSites: template.injectionSites,
    firstDoseItems: template.firstDoseItems,
    educationPoints: template.educationPoints,
    holdCriteria: template.holdCriteria,
    premedsGiven: template.premeds.map((p) => ({ name: p.name, dose: p.dose, timing: p.timing, given: false })),
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
