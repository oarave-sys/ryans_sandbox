// Local-first persistence using Dexie (IndexedDB).
//
// IMPORTANT (privacy): all data stays in the browser on this device. Nothing is
// sent to a server. This keeps the app clear of PHI transmission while the
// workflow is being validated. A future compliant backend (e.g. Supabase with a
// signed BAA, authentication, and audit logging) can replace this module
// without touching the UI, because every component talks to the data layer
// through these functions rather than to IndexedDB directly.

import Dexie, { type Table } from "dexie";
import type { Encounter, Patient, Provider, Regimen } from "./types";

export class DaysheetDB extends Dexie {
  providers!: Table<Provider, string>;
  patients!: Table<Patient, string>;
  regimens!: Table<Regimen, string>;
  encounters!: Table<Encounter, string>;

  constructor() {
    super("infusion_daysheets");
    this.version(1).stores({
      providers: "id, name, active",
      patients: "id, lastName, providerId, active",
      regimens: "id, patientId, active",
      encounters: "id, date, patientId, regimenId, status",
    });
  }
}

export const db = new DaysheetDB();

/** Sortable, collision-resistant id without external deps. */
export function newId(prefix = "id"): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}_${time}${rand}`;
}

// --- Export / import for backup and moving between devices ---

export interface Backup {
  app: "infusion-daysheets";
  version: 1;
  exportedAt: number;
  providers: Provider[];
  patients: Patient[];
  regimens: Regimen[];
  encounters: Encounter[];
}

export async function exportAll(): Promise<Backup> {
  const [providers, patients, regimens, encounters] = await Promise.all([
    db.providers.toArray(),
    db.patients.toArray(),
    db.regimens.toArray(),
    db.encounters.toArray(),
  ]);
  return {
    app: "infusion-daysheets",
    version: 1,
    exportedAt: Date.now(),
    providers,
    patients,
    regimens,
    encounters,
  };
}

export async function importAll(backup: Backup, mode: "replace" | "merge"): Promise<void> {
  if (backup.app !== "infusion-daysheets") {
    throw new Error("This file is not an infusion-daysheets backup.");
  }
  await db.transaction("rw", db.providers, db.patients, db.regimens, db.encounters, async () => {
    if (mode === "replace") {
      await Promise.all([
        db.providers.clear(),
        db.patients.clear(),
        db.regimens.clear(),
        db.encounters.clear(),
      ]);
    }
    await db.providers.bulkPut(backup.providers ?? []);
    await db.patients.bulkPut(backup.patients ?? []);
    await db.regimens.bulkPut(backup.regimens ?? []);
    await db.encounters.bulkPut(backup.encounters ?? []);
  });
}

export async function isEmpty(): Promise<boolean> {
  const count = await db.patients.count();
  return count === 0;
}
