import { useState } from "react";
import { newId } from "../db";
import type { Patient, Provider } from "../types";

export function PatientForm({
  patient, providers, onSave, onCancel, onAddProvider,
}: {
  patient: Patient | null;
  providers: Provider[];
  onSave: (p: Patient) => void;
  onCancel: () => void;
  onAddProvider: (name: string) => Promise<string>;
}) {
  const [firstName, setFirstName] = useState(patient?.firstName ?? "");
  const [lastName, setLastName] = useState(patient?.lastName ?? "");
  const [mrn, setMrn] = useState(patient?.mrn ?? "");
  const [dob, setDob] = useState(patient?.dob ?? "");
  const [providerId, setProviderId] = useState(patient?.providerId ?? "");
  const [diagnosis, setDiagnosis] = useState(patient?.diagnosis ?? "");
  const [notes, setNotes] = useState(patient?.notes ?? "");
  const [active, setActive] = useState(patient?.active ?? true);
  const [newProvider, setNewProvider] = useState("");

  function save() {
    const now = Date.now();
    onSave({
      id: patient?.id ?? newId("pat"),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      mrn: mrn.trim() || undefined,
      dob: dob || undefined,
      providerId: providerId || undefined,
      diagnosis: diagnosis.trim() || undefined,
      notes: notes.trim() || undefined,
      active,
      createdAt: patient?.createdAt ?? now,
      updatedAt: now,
    });
  }

  async function addProvider() {
    const name = newProvider.trim();
    if (!name) return;
    const id = await onAddProvider(name);
    setProviderId(id);
    setNewProvider("");
  }

  const valid = firstName.trim() && lastName.trim();

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head"><h2>{patient ? "Edit patient" : "New patient"}</h2></div>
        <div className="panel-body grid" style={{ gap: 12 }}>
          <div className="grid cols-2">
            <label className="field">First name <span className="req">*</span>
              <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </label>
            <label className="field">Last name <span className="req">*</span>
              <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </label>
          </div>
          <div className="grid cols-2">
            <label className="field">MRN
              <input type="text" value={mrn} onChange={(e) => setMrn(e.target.value)} />
            </label>
            <label className="field">Date of birth
              <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
            </label>
          </div>
          <label className="field">Diagnosis (DX)
            <input type="text" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="e.g. Rheumatoid arthritis" />
          </label>
          <label className="field">Primary MD
            <select value={providerId} onChange={(e) => setProviderId(e.target.value)}>
              <option value="">—</option>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <div className="row">
            <input type="text" value={newProvider} onChange={(e) => setNewProvider(e.target.value)} placeholder="Add a new MD…" />
            <button className="btn sm" onClick={addProvider} disabled={!newProvider.trim()}>Add MD</button>
          </div>
          <label className="field">Notes
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <span className="checkline">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active patient
          </span>
        </div>
        <div className="sticky-actions">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <div className="spacer" style={{ flex: 1 }} />
          <button className="btn primary" disabled={!valid} onClick={save}>Save patient</button>
        </div>
      </div>
    </div>
  );
}
