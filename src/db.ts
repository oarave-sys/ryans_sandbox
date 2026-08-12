// Client data layer — talks to the server API over same-origin fetch.
//
// This replaces the earlier browser-only (IndexedDB) storage. It deliberately
// keeps a small Dexie-like surface (toArray/get/add/put/update/delete/where) so
// the UI components did not need to change when we moved from local storage to a
// real, auditable, multi-user database. All PHI now lives in the server's
// Postgres database, never in the browser.

import { revalidate, emitUnauthorized } from "./bus";
import type { Encounter, Patient, Provider, Regimen } from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    credentials: "same-origin",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    emitUnauthorized();
    throw new ApiError(401, "Not authenticated");
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch { /* ignore */ }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

interface Table<T extends { id: string }> {
  toArray(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  add(obj: T): Promise<string>;
  put(obj: T): Promise<string>;
  update(id: string, patch: Partial<T>): Promise<number>;
  delete(id: string): Promise<void>;
  count(): Promise<number>;
  where(column: string): { equals(value: string): { toArray(): Promise<T[]> } };
}

function table<T extends { id: string }>(name: string): Table<T> {
  return {
    toArray: () => req<T[]>("GET", `/${name}`),
    async get(id) {
      try {
        return await req<T>("GET", `/${name}/${encodeURIComponent(id)}`);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return undefined;
        throw e;
      }
    },
    async add(obj) {
      await req("PUT", `/${name}/${encodeURIComponent(obj.id)}`, obj);
      revalidate();
      return obj.id;
    },
    async put(obj) {
      await req("PUT", `/${name}/${encodeURIComponent(obj.id)}`, obj);
      revalidate();
      return obj.id;
    },
    async update(id, patch) {
      const cur = await req<T>("GET", `/${name}/${encodeURIComponent(id)}`);
      const next = { ...cur, ...patch };
      await req("PUT", `/${name}/${encodeURIComponent(id)}`, next);
      revalidate();
      return 1;
    },
    async delete(id) {
      await req("DELETE", `/${name}/${encodeURIComponent(id)}`);
      revalidate();
    },
    async count() {
      return (await req<T[]>("GET", `/${name}`)).length;
    },
    where(column) {
      return {
        equals(value) {
          return {
            toArray: () => req<T[]>("GET", `/${name}?${encodeURIComponent(column)}=${encodeURIComponent(value)}`),
          };
        },
      };
    },
  };
}

export const db = {
  providers: table<Provider>("providers"),
  patients: table<Patient>("patients"),
  regimens: table<Regimen>("regimens"),
  encounters: table<Encounter>("encounters"),
};

/** Record that an encounter's daysheet was printed (for the audit trail). */
export async function recordPrint(encounterId: string): Promise<void> {
  try {
    await req("POST", `/encounters/${encodeURIComponent(encounterId)}/print`);
  } catch {
    /* printing must never be blocked by an audit failure */
  }
}

/** Sortable, collision-resistant id without external deps. */
export function newId(prefix = "id"): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}_${time}${rand}`;
}

// --- Admin backup export (JSON) --------------------------------------------

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
  return { app: "infusion-daysheets", version: 1, exportedAt: Date.now(), providers, patients, regimens, encounters };
}
