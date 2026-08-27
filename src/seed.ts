// Medication templates used as quick-pick defaults in the regimen form and as
// the match targets when a day's schedule is imported.
//
// IMPORTANT: clinical dose amounts and gate thresholds are intentionally left
// BLANK here. These templates provide the *structure* of each drug's daysheet —
// route, schedule shape, which safety gates apply, premed protocol, monitoring
// and hold text — not the numbers. Every dose and threshold MUST be entered and
// confirmed by clinical staff against the patient's actual order. Nothing here
// is medical advice.
//
// Visit frequency (every N weeks) IS populated, because it is a scheduling fact
// the due-date engine needs, not a clinical dose.

import type { PremedTemplate, ProceedGate, Regimen } from "./types";

export interface MedTemplate {
  medicationName: string;
  aliases?: string[]; // names as they may appear on an imported schedule
  doseMode: "per_kg" | "flat";
  doseValue: number; // left 0 (blank) on templates — staff enter the real dose
  doseUnit: "mg" | "g";
  frequencyWeeks: number; // scheduling fact, not a dose
  route: string; // "IV" | "SubQ"
  administrationNote?: string;
  scheduleNote?: string;
  firstDoseNote?: string;
  maxDosePerPa?: string;
  gates?: ProceedGate[];
  injectionSites?: string[];
  observationMinutes?: string;
  firstDoseItems?: string[];
  educationPoints?: string[];
  holdCriteria?: string[];
  tracksBoneHealth?: boolean;
  premeds: PremedTemplate[];
  standingLabs: string[];
}

// --- Common premeds -------------------------------------------------------
const TYLENOL: PremedTemplate = { name: "Tylenol (acetaminophen)", dose: "", standing: true };
const TYLENOL_PM: PremedTemplate = { name: "Tylenol PM", dose: "2 tabs", standing: true };
const ZYRTEC: PremedTemplate = { name: "Zyrtec (cetirizine)", dose: "", standing: false };
const BENADRYL: PremedTemplate = { name: "Benadryl (diphenhydramine)", dose: "", standing: false };
const SOLUMEDROL: PremedTemplate = { name: "Solu-Medrol (methylprednisolone)", dose: "100 mg IVP over 5 min", timing: "30 min before infusion", standing: true };

// --- Common option lists --------------------------------------------------
const SITES_ABD_THIGH = ["R Abd", "L Abd", "R thigh", "L thigh"];
const SITES_ARM_ABD = ["RUA", "LUA", "L Abd", "R Abd"];
const LABS_FULL = ["CBC", "CRP", "ESR", "CMP"];

// Reusable education / hold text for the bone-metabolic agents (Prolia/Evenity).
const BONE_EDUCATION = [
  "Reinforce adequate vitamin D and calcium intake",
  "Symptoms of hypocalcemia (muscle cramps, tingling around mouth, spasms)",
  "Report jaw pain or dental problems",
  "Report signs of infection",
];
const BONE_HOLD = [
  "Hypocalcemia",
  "Vitamin D deficiency not corrected",
  "Recent invasive dental procedures with poor healing",
  "Signs of active infection or fever (increased risk for cellulitis)",
  "Reaction to previous injection",
  "Patient appears unstable or symptomatic in any concerning way",
];

export const MED_TEMPLATES: MedTemplate[] = [
  {
    medicationName: "Tocilizumab (Actemra)",
    aliases: ["Actemra"],
    doseMode: "per_kg", doseValue: 0, doseUnit: "mg", frequencyWeeks: 4,
    route: "IV", maxDosePerPa: "",
    gates: [{ label: "Lipid panel on file (within 6 months prior to starting)", requiresValue: true }],
    premeds: [], standingLabs: ["CBC", "CMP", "Lipid panel"],
  },
  {
    medicationName: "Belimumab (Benlysta)",
    aliases: ["Benlysta"],
    doseMode: "per_kg", doseValue: 0, doseUnit: "mg", frequencyWeeks: 4,
    route: "IV", maxDosePerPa: "",
    scheduleNote: "at weeks 0, 2, 4 then every 4 weeks",
    premeds: [], standingLabs: LABS_FULL,
  },
  {
    medicationName: "Certolizumab pegol (Cimzia)",
    aliases: ["Cimzia"],
    doseMode: "flat", doseValue: 0, doseUnit: "mg", frequencyWeeks: 2,
    route: "SubQ", injectionSites: SITES_ABD_THIGH,
    administrationNote: "2–3 min injection time",
    premeds: [], standingLabs: [],
  },
  {
    medicationName: "Secukinumab (Cosentyx)",
    aliases: ["Cosentyx"],
    doseMode: "per_kg", doseValue: 0, doseUnit: "mg", frequencyWeeks: 4,
    route: "IV",
    firstDoseNote: "Loading: __ mg/kg IV × 1 dose, then __ mg/kg IV every 4 weeks",
    premeds: [], standingLabs: LABS_FULL,
  },
  {
    medicationName: "Romosozumab (Evenity)",
    aliases: ["Evenity"],
    doseMode: "flat", doseValue: 0, doseUnit: "mg", frequencyWeeks: 4,
    route: "SubQ", injectionSites: SITES_ARM_ABD, tracksBoneHealth: true,
    administrationNote: "210 mg SQ every month (2 injections of 105 mg)",
    gates: [{ label: "Confirm no heart-related concerns since starting (esp. stroke or heart attack)", requiresMdOk: false }],
    firstDoseItems: [
      "Give a new medication brochure or handout",
      "Maintain calcium and vitamin D",
      "Make dentist aware that Evenity was started",
      "Monthly doses × 12, then a different medication will be prescribed",
    ],
    educationPoints: BONE_EDUCATION,
    holdCriteria: [...BONE_HOLD, "Recent MI or stroke or high-risk symptoms"],
    premeds: [], standingLabs: [],
  },
  {
    medicationName: "Canakinumab (Ilaris)",
    aliases: ["Ilaris"],
    doseMode: "flat", doseValue: 0, doseUnit: "mg", frequencyWeeks: 12,
    route: "SubQ", injectionSites: SITES_ABD_THIGH, observationMinutes: "15-30",
    administrationNote: "1–2 min injection time; observe 15–30 min",
    premeds: [], standingLabs: [],
  },
  {
    medicationName: "Pegloticase (Krystexxa)",
    aliases: ["Krystexxa"],
    doseMode: "flat", doseValue: 0, doseUnit: "mg", frequencyWeeks: 2,
    route: "IV", scheduleNote: "every 14 days", observationMinutes: "60",
    administrationNote: "Wait 30 min after premeds before starting. 1-hour post-observation.",
    gates: [
      { label: "G6PD result on file", requiresValue: true },
      { label: "Stat uric acid drawn before infusion", requiresValue: true, requiresMdOk: true },
      { label: "Confirmed patient is taking methotrexate", requiresMdOk: false },
    ],
    premeds: [SOLUMEDROL, TYLENOL_PM],
    standingLabs: ["CBC", "CRP", "ESR", "CMP", "Uric acid"],
  },
  {
    medicationName: "Ocrelizumab (Ocrevus)",
    aliases: ["Ocrevus"],
    doseMode: "flat", doseValue: 0, doseUnit: "mg", frequencyWeeks: 26,
    route: "IV",
    firstDoseNote: "First dose split — Day One / Day Two rate (2 × 300 mg)",
    administrationNote: "Dilute in 500 mL bag",
    educationPoints: ["Covid vaccine discussion — B-cell deplete"],
    premeds: [SOLUMEDROL, TYLENOL_PM], standingLabs: LABS_FULL,
  },
  {
    medicationName: "Abatacept (Orencia)",
    aliases: ["Orencia"],
    doseMode: "flat", doseValue: 0, doseUnit: "mg", frequencyWeeks: 4,
    route: "IV", maxDosePerPa: "",
    scheduleNote: "IV at weeks 0, 2, 4 then every 4 weeks",
    administrationNote: "Weight-banded dose",
    premeds: [], standingLabs: LABS_FULL,
  },
  {
    medicationName: "Denosumab (Prolia)",
    aliases: ["Prolia"],
    doseMode: "flat", doseValue: 0, doseUnit: "mg", frequencyWeeks: 26,
    route: "SubQ", injectionSites: SITES_ARM_ABD, tracksBoneHealth: true,
    firstDoseItems: [
      "Give a new medication brochure or handout",
      "Maintain calcium and vitamin D",
      "Make dentist aware that Prolia was started",
    ],
    educationPoints: BONE_EDUCATION,
    holdCriteria: [...BONE_HOLD, "Severe renal impairment without provider clearance"],
    premeds: [], standingLabs: [],
  },
  {
    medicationName: "Zoledronic acid (Reclast)",
    aliases: ["Reclast"],
    doseMode: "flat", doseValue: 0, doseUnit: "mg", frequencyWeeks: 52,
    route: "IV", tracksBoneHealth: true,
    administrationNote: "Renal panel within 4–8 weeks pre-infusion. Caution if on a loop diuretic (Bumex, edecrin, Lasix, Demadex).",
    gates: [{ label: "CrCL must be over 35", requiresValue: true, threshold: "" }],
    educationPoints: ["On calcium / Vitamin D 1200 mg / 800 IU daily, in divided doses"],
    premeds: [TYLENOL], standingLabs: ["CMP"],
  },
  {
    medicationName: "Infliximab (Remicade)",
    aliases: ["Remicade"],
    doseMode: "per_kg", doseValue: 0, doseUnit: "mg", frequencyWeeks: 8,
    route: "IV", maxDosePerPa: "",
    scheduleNote: "at 0, 2, 6 weeks then every ___ weeks",
    premeds: [TYLENOL_PM], standingLabs: LABS_FULL,
  },
  {
    medicationName: "Infliximab (Remicade) — every 5 weeks",
    aliases: ["Remicade Q5", "Remicade Q5 weeks", "Remicade Q5wk", "Remicade q5wks"],
    doseMode: "per_kg", doseValue: 0, doseUnit: "mg", frequencyWeeks: 5,
    route: "IV", maxDosePerPa: "",
    scheduleNote: "at 0, 2, 6 weeks then every 5 weeks",
    premeds: [TYLENOL_PM], standingLabs: LABS_FULL,
  },
  {
    medicationName: "Infliximab-abda (Renflexis)",
    aliases: ["Renflexis"],
    doseMode: "per_kg", doseValue: 0, doseUnit: "mg", frequencyWeeks: 8,
    route: "IV", maxDosePerPa: "",
    scheduleNote: "at 0, 2, 6 weeks then every ___ weeks",
    premeds: [TYLENOL_PM], standingLabs: LABS_FULL,
  },
  {
    medicationName: "Golimumab (Simponi Aria)",
    aliases: ["Simponi Aria", "Simponi"],
    doseMode: "per_kg", doseValue: 0, doseUnit: "mg", frequencyWeeks: 8,
    route: "IV",
    scheduleNote: "at weeks 0, 4 then every 8 weeks",
    premeds: [], standingLabs: LABS_FULL,
  },
  {
    medicationName: "Rituximab (Rituxan)",
    aliases: ["Rituxan", "Rituxan 2", "Riabni", "Ruxience", "Truxima"],
    doseMode: "flat", doseValue: 0, doseUnit: "mg", frequencyWeeks: 24,
    route: "IV",
    firstDoseNote: "Two doses 2 weeks apart, then every 24 weeks",
    premeds: [TYLENOL, BENADRYL, SOLUMEDROL, ZYRTEC], standingLabs: ["CBC", "CMP"],
  },
];

/** Regimen fields produced from a template — everything except the identity,
 *  audit, and per-patient (auth / last-infusion / notes) fields. */
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
    scheduleNote: t.scheduleNote,
    firstDoseNote: t.firstDoseNote,
    maxDosePerPa: t.maxDosePerPa,
    gates: t.gates?.map((g) => ({ ...g })),
    injectionSites: t.injectionSites ? [...t.injectionSites] : undefined,
    observationMinutes: t.observationMinutes,
    firstDoseItems: t.firstDoseItems ? [...t.firstDoseItems] : undefined,
    educationPoints: t.educationPoints ? [...t.educationPoints] : undefined,
    holdCriteria: t.holdCriteria ? [...t.holdCriteria] : undefined,
    tracksBoneHealth: t.tracksBoneHealth,
    premeds: t.premeds.map((p) => ({ ...p })),
    standingLabs: [...t.standingLabs],
  };
}

/**
 * Match a free-text medication name (e.g. from an imported schedule row like
 * "Rituxan 2" or "Simponi Aria") to a bundled template. Case-insensitive; tries
 * the medication name and each alias, longest alias first so "Simponi Aria"
 * beats a bare "Simponi". Returns null when nothing matches confidently.
 */
export function matchTemplate(raw: string): MedTemplate | null {
  const q = raw.trim().toLowerCase();
  if (!q) return null;
  // Prefer an exact name/alias match over a substring one, so a plain
  // "Remicade" resolves to the base template and not to "Remicade Q5"; among
  // matches of the same kind, the longest needle wins (e.g. "Simponi Aria"
  // beats a bare "Simponi").
  let best: { t: MedTemplate; len: number; exact: boolean } | null = null;
  for (const t of MED_TEMPLATES) {
    const needles = [t.medicationName, ...(t.aliases ?? [])];
    for (const n of needles) {
      const nl = n.toLowerCase();
      const exact = q === nl;
      if (exact || q.includes(nl) || nl.includes(q)) {
        const better = !best || (exact && !best.exact) || (exact === best.exact && nl.length > best.len);
        if (better) best = { t, len: nl.length, exact };
      }
    }
  }
  return best?.t ?? null;
}
