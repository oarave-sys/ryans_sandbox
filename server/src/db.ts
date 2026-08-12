import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Sensible defaults for a small clinic deployment.
  max: Number(process.env.PG_POOL_MAX ?? 10),
});

/** Apply the schema (idempotent) and seed the initial admin account. */
export async function initDb(): Promise<void> {
  const schema = await readFile(join(__dirname, "schema.sql"), "utf8");
  await pool.query(schema);
  await seedAdmin();
}

/**
 * Create the first admin user if no users exist. Credentials come from env so
 * they are never hard-coded; the admin is flagged to change the password on
 * first login.
 */
async function seedAdmin(): Promise<void> {
  const { rows } = await pool.query<{ count: string }>("SELECT count(*)::text FROM users");
  if (Number(rows[0].count) > 0) return;

  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "changeme";
  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO users (id, username, password_hash, full_name, role, must_change_password)
     VALUES ($1, $2, $3, $4, 'admin', TRUE)`,
    [`usr_${Date.now().toString(36)}`, username, hash, "Administrator"]
  );
  console.log(
    `[init] Seeded admin user "${username}". ` +
      (process.env.ADMIN_PASSWORD
        ? "Password taken from ADMIN_PASSWORD."
        : 'Default password is "changeme" — change it at first login.')
  );
}

// --- Generic JSONB entity helpers -------------------------------------------

export interface EntityRow {
  id: string;
  data: Record<string, unknown>;
}

/** Columns (besides id/data) promoted from the JSON document per table. */
type PromotedColumns = Record<string, (data: Record<string, unknown>) => unknown>;

const PROMOTED: Record<string, PromotedColumns> = {
  providers: { active: (d) => d.active ?? true },
  patients: {
    active: (d) => d.active ?? true,
    last_name: (d) => d.lastName ?? null,
    provider_id: (d) => d.providerId ?? null,
  },
  regimens: {
    active: (d) => d.active ?? true,
    patient_id: (d) => d.patientId ?? null,
  },
  encounters: {
    patient_id: (d) => d.patientId ?? null,
    regimen_id: (d) => d.regimenId ?? null,
    date: (d) => d.date ?? null,
    status: (d) => d.status ?? null,
  },
};

const TABLES = new Set(Object.keys(PROMOTED));

function assertTable(table: string): void {
  if (!TABLES.has(table)) throw new Error(`Unknown table: ${table}`);
}

export async function listEntities(
  table: string,
  where?: { column: string; value: unknown }
): Promise<Record<string, unknown>[]> {
  assertTable(table);
  const clause = where ? ` WHERE ${sanitizeColumn(where.column)} = $1` : "";
  const params = where ? [where.value] : [];
  const { rows } = await pool.query<{ data: Record<string, unknown> }>(
    `SELECT data FROM ${table}${clause}`,
    params
  );
  return rows.map((r) => r.data);
}

export async function getEntity(table: string, id: string): Promise<Record<string, unknown> | null> {
  assertTable(table);
  const { rows } = await pool.query<{ data: Record<string, unknown> }>(
    `SELECT data FROM ${table} WHERE id = $1`,
    [id]
  );
  return rows[0]?.data ?? null;
}

/** Insert or update an entity by id. Returns the stored document. */
export async function upsertEntity(
  table: string,
  id: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  assertTable(table);
  const promoted = PROMOTED[table];
  const cols = ["id", ...Object.keys(promoted), "data", "updated_at"];
  const values: unknown[] = [id, ...Object.keys(promoted).map((k) => promoted[k](data)), data, new Date()];
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const updates = cols
    .filter((c) => c !== "id")
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(", ");
  await pool.query(
    `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders.join(", ")})
     ON CONFLICT (id) DO UPDATE SET ${updates}`,
    values
  );
  return data;
}

export async function deleteEntity(table: string, id: string): Promise<void> {
  assertTable(table);
  await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
}

const COLUMN_RE = /^[a-z_]+$/;
function sanitizeColumn(col: string): string {
  if (!COLUMN_RE.test(col)) throw new Error(`Invalid column: ${col}`);
  return col;
}
