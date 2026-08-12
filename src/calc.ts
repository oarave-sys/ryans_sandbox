// Clinical calculations. Kept pure and separate so they are easy to reason
// about and, later, to unit-test. None of these replace clinical judgment —
// the nurse always confirms the numbers on screen.

import type { Regimen, Encounter } from "./types";

const LB_PER_KG = 2.2046226218;

export function lbToKg(lb: number): number {
  return lb / LB_PER_KG;
}

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}

/** Round to a sensible number of decimals for display. */
export function round(n: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/**
 * Compute the dose for a weight-based (mg/kg) regimen.
 * Returns null if inputs are insufficient.
 */
export function computeWeightBasedDose(
  mgPerKg: number,
  weight: number,
  weightUnit: "kg" | "lb"
): { kg: number; mg: number } | null {
  if (!mgPerKg || !weight || weight <= 0) return null;
  const kg = weightUnit === "lb" ? lbToKg(weight) : weight;
  const mg = mgPerKg * kg;
  return { kg: round(kg, 1), mg: round(mg, 0) };
}

/**
 * Produce the human-readable dose string that pre-fills the daysheet, e.g.
 * "3 mg/kg × 70 kg = 210 mg". For flat doses it just states the amount.
 */
export function describeDose(
  regimen: Pick<Regimen, "doseMode" | "doseValue" | "doseUnit">,
  weight: number | undefined,
  weightUnit: "kg" | "lb"
): string {
  if (regimen.doseMode === "flat") {
    if (!regimen.doseValue) return "";
    return `${regimen.doseValue} ${regimen.doseUnit}`;
  }
  if (weight === undefined) return `${regimen.doseValue} mg/kg`;
  const res = computeWeightBasedDose(regimen.doseValue, weight, weightUnit);
  if (!res) return `${regimen.doseValue} mg/kg`;
  return `${regimen.doseValue} mg/kg × ${res.kg} kg = ${res.mg} mg`;
}

export interface DueStatus {
  due: boolean;
  dueDate: string | null; // ISO date the next infusion is due, if computable
  daysUntilDue: number | null; // negative = overdue
  label: string;
}

/**
 * Determine whether an infusion is due, based on the last infusion date and the
 * every-N-weeks frequency. `asOf` defaults to the encounter/appointment date.
 */
export function computeDueStatus(
  lastInfusionDate: string | undefined,
  frequencyWeeks: number | undefined,
  asOf: string
): DueStatus {
  if (!lastInfusionDate || !frequencyWeeks) {
    return { due: false, dueDate: null, daysUntilDue: null, label: "No schedule on file" };
  }
  const last = parseISODate(lastInfusionDate);
  const ref = parseISODate(asOf);
  if (!last || !ref) {
    return { due: false, dueDate: null, daysUntilDue: null, label: "Invalid date" };
  }
  const dueDate = new Date(last);
  dueDate.setDate(dueDate.getDate() + frequencyWeeks * 7);
  const daysUntilDue = Math.round((dueDate.getTime() - ref.getTime()) / 86400000);
  const due = daysUntilDue <= 0;
  const dueISO = toISODate(dueDate);
  let label: string;
  if (daysUntilDue < 0) label = `Overdue by ${Math.abs(daysUntilDue)} day(s)`;
  else if (daysUntilDue === 0) label = "Due today";
  else label = `Due in ${daysUntilDue} day(s)`;
  return { due, dueDate: dueISO, daysUntilDue, label };
}

// --- Small date helpers that avoid timezone surprises with YYYY-MM-DD ---

export function parseISODate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function formatDateHuman(iso?: string): string {
  if (!iso) return "";
  const d = parseISODate(iso);
  if (!d) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function patientAge(dob?: string): number | null {
  if (!dob) return null;
  const d = parseISODate(dob);
  if (!d) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

/** True if the encounter has enough charted to be considered complete. */
export function isEncounterComplete(e: Encounter): boolean {
  return Boolean(e.startTime && e.stopTime && e.completedBy);
}
