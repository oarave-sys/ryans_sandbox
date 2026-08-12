import { useMemo, useState } from "react";
import { db } from "../db";
import { useLive } from "../useLive";
import { generateEncounter } from "../factory";
import {
  todayISO, parseISODate, toISODate, formatDateHuman, computeDueStatus, isEncounterComplete,
} from "../calc";
import type { Encounter, Patient, Provider, Regimen } from "../types";

export function Roster({ onOpen }: { onOpen: (encounterId: string) => void }) {
  const [date, setDate] = useState(todayISO());
  const [adding, setAdding] = useState(false);

  const encounters = useLive<Encounter[]>(
    () => db.encounters.where("date").equals(date).toArray(),
    [date],
    []
  );
  const patients = useLive<Patient[]>(() => db.patients.toArray(), [], []);
  const regimens = useLive<Regimen[]>(() => db.regimens.toArray(), [], []);
  const providers = useLive<Provider[]>(() => db.providers.toArray(), [], []);

  const patientById = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients]);

  const sorted = useMemo(
    () => [...encounters].sort((a, b) => (a.apptTime || "99").localeCompare(b.apptTime || "99")),
    [encounters]
  );

  const completedCount = sorted.filter(isEncounterComplete).length;
  const dueCount = sorted.filter((e) => e.infusionDue === "yes").length;

  function shiftDay(delta: number) {
    const d = parseISODate(date)!;
    d.setDate(d.getDate() + delta);
    setDate(toISODate(d));
  }

  async function addEncounter(patientId: string, regimenId: string, apptTime: string) {
    const patient = patients.find((p) => p.id === patientId);
    const regimen = regimens.find((r) => r.id === regimenId);
    if (!patient || !regimen) return;
    const enc = generateEncounter(patient, regimen, providers, date, apptTime || undefined);
    await db.encounters.add(enc);
    setAdding(false);
    onOpen(enc.id);
  }

  async function removeEncounter(id: string) {
    if (!confirm("Remove this daysheet from the roster? Charted data will be lost.")) return;
    await db.encounters.delete(id);
  }

  return (
    <>
      <div className="roster-toolbar">
        <button className="btn sm" onClick={() => shiftDay(-1)} aria-label="Previous day">←</button>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "auto" }} />
        <button className="btn sm" onClick={() => shiftDay(1)} aria-label="Next day">→</button>
        <button className="btn sm" onClick={() => setDate(todayISO())}>Today</button>
        <div className="spacer" style={{ flex: 1 }} />
        <div className="stat"><b>{sorted.length}</b><span>on roster</span></div>
        <div className="stat"><b>{completedCount}</b><span>completed</span></div>
        <div className="stat"><b>{dueCount}</b><span>infusion due</span></div>
        <button className="btn primary" onClick={() => setAdding(true)} disabled={patients.length === 0}>
          + Add to roster
        </button>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>{formatDateHuman(date)}</h2>
          <span className="muted small">{sorted.length} infusion{sorted.length === 1 ? "" : "s"} scheduled</span>
        </div>
        {sorted.length === 0 ? (
          <div className="empty">
            No infusions on the roster for this day.<br />
            {patients.length === 0
              ? "Add a patient and regimen first, under Patients & Regimens."
              : "Click “Add to roster” to schedule one."}
          </div>
        ) : (
          <div>
            {sorted.map((enc) => {
              const patient = patientById.get(enc.patientId);
              const due = computeDueStatus(enc.lastInfusionDate, enc.doseEveryWeeks, enc.date);
              const complete = isEncounterComplete(enc);
              return (
                <div className="enc-card" key={enc.id}>
                  <div className="enc-time">{enc.apptTime || "—"}</div>
                  <div className="enc-main">
                    <div className="name">
                      {patient ? `${patient.lastName}, ${patient.firstName}` : "Unassigned (blank patient)"}
                    </div>
                    <div className="sub">
                      {enc.medicationName}
                      {enc.providerName ? ` · ${enc.providerName}` : ""}
                      {patient?.diagnosis ? ` · ${patient.diagnosis}` : ""}
                    </div>
                  </div>
                  <div className="enc-actions">
                    {complete ? (
                      <span className="badge done">Completed</span>
                    ) : enc.status === "in_progress" || enc.startTime ? (
                      <span className="badge">In progress</span>
                    ) : due.due ? (
                      <span className={`badge ${due.daysUntilDue !== null && due.daysUntilDue < 0 ? "overdue" : "due"}`}>
                        {due.label}
                      </span>
                    ) : (
                      <span className="badge">Scheduled</span>
                    )}
                    <button className="btn sm primary" onClick={() => onOpen(enc.id)}>Open daysheet</button>
                    <button className="btn sm danger" onClick={() => removeEncounter(enc.id)} aria-label="Remove">✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {adding && (
        <AddToRoster
          patients={patients}
          regimens={regimens}
          onCancel={() => setAdding(false)}
          onAdd={addEncounter}
        />
      )}
    </>
  );
}

function AddToRoster({
  patients, regimens, onAdd, onCancel,
}: {
  patients: Patient[];
  regimens: Regimen[];
  onAdd: (patientId: string, regimenId: string, apptTime: string) => void;
  onCancel: () => void;
}) {
  const activePatients = patients.filter((p) => p.active);
  const [patientId, setPatientId] = useState(activePatients[0]?.id ?? "");
  const patientRegimens = regimens.filter((r) => r.patientId === patientId && r.active);
  const [regimenId, setRegimenId] = useState(patientRegimens[0]?.id ?? "");
  const [apptTime, setApptTime] = useState("");

  // Keep regimen selection valid when the patient changes.
  const effectiveRegimens = regimens.filter((r) => r.patientId === patientId && r.active);
  const effectiveRegimenId = effectiveRegimens.some((r) => r.id === regimenId)
    ? regimenId
    : effectiveRegimens[0]?.id ?? "";

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head"><h2>Add to roster</h2></div>
        <div className="panel-body grid" style={{ gap: 14 }}>
          <label className="field">
            Patient
            <select value={patientId} onChange={(e) => { setPatientId(e.target.value); }}>
              {activePatients.map((p) => (
                <option key={p.id} value={p.id}>{p.lastName}, {p.firstName}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Medication / regimen
            {effectiveRegimens.length === 0 ? (
              <span className="muted small">This patient has no active regimen. Add one under Patients &amp; Regimens.</span>
            ) : (
              <select value={effectiveRegimenId} onChange={(e) => setRegimenId(e.target.value)}>
                {effectiveRegimens.map((r) => (
                  <option key={r.id} value={r.id}>{r.medicationName} · every {r.frequencyWeeks} wk</option>
                ))}
              </select>
            )}
          </label>
          <label className="field">
            Appointment time
            <input type="time" value={apptTime} onChange={(e) => setApptTime(e.target.value)} />
          </label>
        </div>
        <div className="sticky-actions">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <div className="spacer" style={{ flex: 1 }} />
          <button
            className="btn primary"
            disabled={!patientId || !effectiveRegimenId}
            onClick={() => onAdd(patientId, effectiveRegimenId, apptTime)}
          >
            Create pre-filled daysheet
          </button>
        </div>
      </div>
    </div>
  );
}
