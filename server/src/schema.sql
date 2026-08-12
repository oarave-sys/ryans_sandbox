-- Schema for the infusion daysheets database.
--
-- Design: each clinical entity keeps its full JSON document in a `data` column
-- (matching the client's TypeScript types exactly) plus a few promoted columns
-- for the queries the app actually runs (by date, by patient). This keeps the
-- client/server contract trivial while still indexing what matters.
--
-- All timestamps are stored in UTC. IDs are client-generated strings (e.g.
-- "pat_...", "enc_...") so the offline-capable client can mint them.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name     TEXT,
  role          TEXT NOT NULL DEFAULT 'nurse' CHECK (role IN ('nurse', 'admin')),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS providers (
  id         TEXT PRIMARY KEY,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS patients (
  id          TEXT PRIMARY KEY,
  last_name   TEXT,
  provider_id TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  data        JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS patients_last_name_idx ON patients (lower(last_name));

CREATE TABLE IF NOT EXISTS regimens (
  id         TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS regimens_patient_idx ON regimens (patient_id);

CREATE TABLE IF NOT EXISTS encounters (
  id         TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  regimen_id TEXT,
  date       DATE NOT NULL,
  status     TEXT,
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS encounters_date_idx ON encounters (date);
CREATE INDEX IF NOT EXISTS encounters_patient_idx ON encounters (patient_id);

-- Immutable audit trail. Required for HIPAA: who did what, to which record, when.
CREATE TABLE IF NOT EXISTS audit_log (
  id        BIGSERIAL PRIMARY KEY,
  at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id   TEXT,
  username  TEXT,
  action    TEXT NOT NULL,          -- login, logout, create, update, delete, view, print
  entity    TEXT,                    -- patient, regimen, encounter, session
  entity_id TEXT,
  detail    JSONB,
  ip        TEXT
);
CREATE INDEX IF NOT EXISTS audit_at_idx ON audit_log (at DESC);
CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_log (entity, entity_id);
