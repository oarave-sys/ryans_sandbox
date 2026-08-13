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

/** Express a number of days as weeks + days, e.g. 45 -> "6 weeks 3 days". */
export function formatWeeksDays(days: number): string {
  const a = Math.abs(days);
  const w = Math.floor(a / 7);
  const d = a % 7;
  const wk = w > 0 ? `${w} week${w === 1 ? "" : "s"}` : "";
  const dy = d > 0 ? `${d} day${d === 1 ? "" : "s"}` : "";
  if (w === 0 && d === 0) return "0 days";
  return [wk, dy].filter(Boolean).join(" ");
}

export interface DueStatus {
  due: boolean;
  dueDate: string | null; // ISO date the next infusion is due, if computable
  daysUntilDue: number | null; // negative = overdue
  label: string;
  daysSinceLast: number | null; // days from last infusion to asOf
  sinceLabel: string; // "6 weeks 3 days since last infusion"
}

/**
 * Determine whether an infusion is due, based on the last infusion date and the
 * every-N-weeks frequency, and how long it has been since the last infusion —
 * both expressed in weeks + days. `asOf` is the encounter/appointment date.
 */
export function computeDueStatus(
  lastInfusionDate: string | undefined,
  frequencyWeeks: number | undefined,
  asOf: string
): DueStatus {
  const ref = parseISODate(asOf);
  const last = lastInfusionDate ? parseISODate(lastInfusionDate) : null;

  // Elapsed since last infusion is useful even without a frequency on file.
  let daysSinceLast: number | null = null;
  let sinceLabel = "";
  if (last && ref) {
    daysSinceLast = Math.round((ref.getTime() - last.getTime()) / 86400000);
    if (daysSinceLast >= 0) sinceLabel = `${formatWeeksDays(daysSinceLast)} since last infusion`;
  }

  if (!lastInfusionDate || !frequencyWeeks || !ref || !last) {
    const label = lastInfusionDate && !frequencyWeeks ? "No frequency on file" : "No schedule on file";
    return { due: false, dueDate: null, daysUntilDue: null, label, daysSinceLast, sinceLabel };
  }

  const dueDate = new Date(last);
  dueDate.setDate(dueDate.getDate() + frequencyWeeks * 7);
  const daysUntilDue = Math.round((dueDate.getTime() - ref.getTime()) / 86400000);
  const due = daysUntilDue <= 0;
  const dueISO = toISODate(dueDate);
  let label: string;
  if (daysUntilDue < 0) label = `Overdue by ${formatWeeksDays(daysUntilDue)}`;
  else if (daysUntilDue === 0) label = "Due today";
  else label = `Due in ${formatWeeksDays(daysUntilDue)}`;
  return { due, dueDate: dueISO, daysUntilDue, label, daysSinceLast, sinceLabel };
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

export interface AuthStatus {
  state: "ok" | "expiring" | "expired" | "no_doses" | "none";
  label: string;
}

/**
 * Prior-authorization status for a regimen as of a given date. Expiring window
 * is 30 days. Missing auth data returns "none" (unknown), not a blocker.
 */
export function computeAuthStatus(
  expires: string | undefined,
  dosesRemaining: number | undefined,
  asOf: string
): AuthStatus {
  if (dosesRemaining !== undefined && dosesRemaining <= 0) {
    return { state: "no_doses", label: "No auth doses remaining" };
  }
  if (!expires) {
    return { state: "none", label: "No auth on file" };
  }
  const exp = parseISODate(expires);
  const ref = parseISODate(asOf);
  if (!exp || !ref) return { state: "none", label: "Auth date invalid" };
  const days = Math.round((exp.getTime() - ref.getTime()) / 86400000);
  if (days < 0) return { state: "expired", label: `Auth expired ${Math.abs(days)} day(s) ago` };
  if (days <= 30) return { state: "expiring", label: `Auth expires in ${days} day(s)` };
  return { state: "ok", label: `Auth valid through ${formatDateHuman(expires)}` };
}

export interface PrepStatus {
  ready: boolean;
  blockers: string[]; // must be resolved before infusing
  warnings: string[]; // worth noting, not blocking
}

/**
 * Combine the automatic signals (weight on file, infusion due, auth) with the
 * manual prep checklist into a single readiness verdict for the worklist.
 */
export function computePrepStatus(e: Encounter, auth: AuthStatus): PrepStatus {
  const blockers: string[] = [];
  const warnings: string[] = [];

  const hasWeight = (e.weight ?? e.previousWeight) !== undefined;
  if (!hasWeight) blockers.push("No weight on file");

  const prep = e.prep ?? { labsOnFile: false, orderVerified: false, authVerified: false };
  if (!prep.labsOnFile) blockers.push("Labs not confirmed");
  if (!prep.orderVerified) blockers.push("Order not verified");

  if (auth.state === "expired") blockers.push("Prior auth expired");
  else if (auth.state === "no_doses") blockers.push("No auth doses remaining");
  else if (auth.state === "expiring") warnings.push(auth.label);
  else if (auth.state === "none" && !prep.authVerified) warnings.push("Auth not confirmed");

  const due = computeDueStatus(e.lastInfusionDate, e.doseEveryWeeks, e.date);
  if (due.daysUntilDue !== null && due.daysUntilDue < 0) warnings.push(due.label);

  // Drug-specific proceed gates (CrCL > 35, uric acid + MD OK, G6PD, etc.).
  // A visit is not ready until every gate the drug requires has been cleared.
  for (const g of e.gateResults ?? []) {
    if (!g.cleared) blockers.push(`Proceed gate: ${g.label}`);
  }

  return { ready: blockers.length === 0, blockers, warnings };
}
