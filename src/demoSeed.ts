// Sample data for the standalone demo build (VITE_DEMO=1). Populates a few
// fictional patients so every screen has something to click. NOT used in the
// real app — all values here are illustrative, not medical advice.

import { db, newId } from "./db";
import { MED_TEMPLATES, templateToRegimenFields } from "./seed";
import { generateEncounter } from "./factory";
import { todayISO, toISODate } from "./calc";
import type { Patient, Provider, Regimen } from "./types";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toISODate(d);
}

export async function seedDemo(): Promise<void> {
  if ((await db.patients.count()) > 0) return;
  const ts = Date.now();

  const providers: Provider[] = [
    { id: newId("prov"), name: "Meier, Svetlana", active: true },
    { id: newId("prov"), name: "Lagwinski, Mikael", active: true },
  ];
  for (const p of providers) await db.providers.add(p);

  const cases: Array<{
    last: string; first: string; dx: string; tmpl: string;
    dose: number; freq: number; lastInf: number; weight: number; time: string; providerIdx: number;
  }> = [
    { last: "Rivera", first: "Dana", dx: "SLE", tmpl: "Belimumab (Benlysta)", dose: 10, freq: 4, lastInf: 21, weight: 163, time: "08:15", providerIdx: 0 },
    { last: "Nguyen", first: "Paul", dx: "Chronic gout", tmpl: "Pegloticase (Krystexxa)", dose: 8, freq: 2, lastInf: 14, weight: 190, time: "10:30", providerIdx: 0 },
    { last: "Delgado", first: "Marie", dx: "Osteoporosis", tmpl: "Denosumab (Prolia)", dose: 60, freq: 26, lastInf: 170, weight: 145, time: "09:00", providerIdx: 1 },
  ];

  for (const c of cases) {
    const provider = providers[c.providerIdx];
    const patient: Patient = {
      id: newId("pat"), firstName: c.first, lastName: c.last, dob: "1968-05-12",
      providerId: provider.id, diagnosis: c.dx, active: true, createdAt: ts, updatedAt: ts,
    };
    await db.patients.add(patient);

    const t = MED_TEMPLATES.find((x) => x.medicationName === c.tmpl)!;
    const regimen: Regimen = {
      id: newId("reg"), patientId: patient.id,
      ...templateToRegimenFields(t),
      doseValue: c.dose, // demo value
      frequencyWeeks: c.freq,
      lastInfusionDate: daysAgo(c.lastInf),
      priorAuthNumber: "PA-" + Math.floor(1000 + c.weight),
      priorAuthExpires: daysAgo(-300),
      active: true, createdAt: ts, updatedAt: ts,
    };
    await db.regimens.add(regimen);

    const enc = generateEncounter(patient, regimen, providers, todayISO(), c.time);
    enc.previousWeight = c.weight;
    await db.encounters.add(enc);
  }
}
