// Builds a fresh daysheet (Encounter) for a regimen on a given date, copying a
// snapshot of the stable patient/regimen data so the day-of edits never mutate
// the standing order. This is the heart of the time savings: the nurse opens a
// sheet that is already ~80% filled in.

import { newId } from "./db";
import type { Encounter, Patient, Provider, Regimen } from "./types";

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
    premedsGiven: regimen.premeds.map((p) => ({ name: p.name, dose: p.dose, given: false })),
    iv: { side: "", location: "", gauge: "", failed: false },
    lots: [{ lotNo: "", exp: "", vials: undefined }],
    status: "scheduled",
    createdAt: ts,
    updatedAt: ts,
  };
}
