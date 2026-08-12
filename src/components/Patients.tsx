import { useMemo, useState } from "react";
import { db, newId } from "../db";
import { useLive } from "../useLive";
import { generateEncounter } from "../factory";
import { todayISO, formatDateHuman, computeDueStatus } from "../calc";
import { MED_TEMPLATES, templateToRegimenFields } from "../seed";
import type { Patient, Provider, Regimen } from "../types";
import { PatientForm } from "./PatientForm";
import { RegimenForm } from "./RegimenForm";

export function Patients({ onOpenEncounter }: { onOpenEncounter: (id: string) => void }) {
  const patients = useLive<Patient[]>(() => db.patients.toArray(), [], []);
  const providers = useLive<Provider[]>(() => db.providers.toArray(), [], []);
  const regimens = useLive<Regimen[]>(() => db.regimens.toArray(), [], []);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingPatient, setEditingPatient] = useState<Patient | "new" | null>(null);
  const [editingRegimen, setEditingRegimen] = useState<Regimen | "new" | null>(null);

  const sortedPatients = useMemo(
    () => [...patients].sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`)),
    [patients]
  );
  const selected = sortedPatients.find((p) => p.id === selectedId) ?? null;
  const selectedRegimens = regimens.filter((r) => r.patientId === selectedId);
  const providerById = useMemo(() => new Map(providers.map((p) => [p.id, p])), [providers]);

  async function savePatient(p: Patient) {
    await db.patients.put(p);
    setEditingPatient(null);
    setSelectedId(p.id);
  }

  async function saveRegimen(r: Regimen) {
    await db.regimens.put(r);
    setEditingRegimen(null);
  }

  async function deleteRegimen(id: string) {
    if (!confirm("Delete this regimen? Existing daysheets are kept.")) return;
    await db.regimens.delete(id);
  }

  async function scheduleToday(regimen: Regimen) {
    if (!selected) return;
    const enc = generateEncounter(selected, regimen, providers, todayISO());
    await db.encounters.add(enc);
    onOpenEncounter(enc.id);
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: "320px 1fr", gap: 16, alignItems: "start" }}>
      <div className="panel">
        <div className="panel-head">
          <h2>Patients</h2>
          <div className="spacer" style={{ flex: 1 }} />
          <button className="btn sm primary" onClick={() => setEditingPatient("new")}>+ New</button>
        </div>
        {sortedPatients.length === 0 ? (
          <div className="empty">No patients yet.</div>
        ) : (
          <div>
            {sortedPatients.map((p) => {
              const rc = regimens.filter((r) => r.patientId === p.id && r.active).length;
              return (
                <div
                  key={p.id}
                  className="enc-card"
                  style={{ cursor: "pointer", background: p.id === selectedId ? "var(--accent-soft)" : undefined }}
                  onClick={() => setSelectedId(p.id)}
                >
                  <div className="enc-main">
                    <div className="name">{p.lastName}, {p.firstName}</div>
                    <div className="sub">
                      {p.diagnosis ?? "No DX"}{p.providerId ? ` · ${providerById.get(p.providerId)?.name ?? ""}` : ""} · {rc} regimen{rc === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        {!selected ? (
          <div className="panel"><div className="empty">Select a patient to view regimens, or add a new one.</div></div>
        ) : (
          <>
            <div className="panel">
              <div className="panel-head">
                <h2>{selected.lastName}, {selected.firstName}</h2>
                <div className="spacer" style={{ flex: 1 }} />
                <button className="btn sm" onClick={() => setEditingPatient(selected)}>Edit patient</button>
              </div>
              <div className="panel-body">
                <div className="row small muted" style={{ gap: 18 }}>
                  {selected.mrn && <span>MRN {selected.mrn}</span>}
                  {selected.dob && <span>DOB {formatDateHuman(selected.dob)}</span>}
                  {selected.providerId && <span>MD {providerById.get(selected.providerId)?.name}</span>}
                  <span>DX {selected.diagnosis ?? "—"}</span>
                </div>
                {selected.notes && <p className="small" style={{ marginTop: 10 }}>{selected.notes}</p>}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h2>Regimens</h2>
                <div className="spacer" style={{ flex: 1 }} />
                <button className="btn sm primary" onClick={() => setEditingRegimen("new")}>+ Add regimen</button>
              </div>
              {selectedRegimens.length === 0 ? (
                <div className="empty">No regimens yet. Add one to start generating daysheets.</div>
              ) : (
                selectedRegimens.map((r) => {
                  const due = computeDueStatus(r.lastInfusionDate, r.frequencyWeeks, todayISO());
                  return (
                    <div className="sheet-section" key={r.id}>
                      <div className="row">
                        <div className="grow">
                          <div className="name" style={{ fontWeight: 700 }}>{r.medicationName}</div>
                          <div className="sub muted small">
                            {r.doseMode === "per_kg" ? `${r.doseValue} mg/kg` : `${r.doseValue} ${r.doseUnit}`}
                            {" · every "}{r.frequencyWeeks} wk
                            {r.route ? ` · ${r.route}` : ""}
                            {!r.active ? " · inactive" : ""}
                          </div>
                          <div className="small muted" style={{ marginTop: 4 }}>
                            Last infusion {formatDateHuman(r.lastInfusionDate) || "—"}
                            {r.lastInfusionDate && (
                              <span className={`badge ${due.due ? (due.daysUntilDue !== null && due.daysUntilDue < 0 ? "overdue" : "due") : "ok"}`} style={{ marginLeft: 8 }}>{due.label}</span>
                            )}
                          </div>
                        </div>
                        <button className="btn sm primary" onClick={() => scheduleToday(r)}>Schedule today</button>
                        <button className="btn sm" onClick={() => setEditingRegimen(r)}>Edit</button>
                        <button className="btn sm danger" onClick={() => deleteRegimen(r.id)}>Delete</button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {editingPatient && (
        <PatientForm
          patient={editingPatient === "new" ? null : editingPatient}
          providers={providers}
          onCancel={() => setEditingPatient(null)}
          onSave={savePatient}
          onAddProvider={async (name) => {
            const prov: Provider = { id: newId("prov"), name, active: true };
            await db.providers.add(prov);
            return prov.id;
          }}
        />
      )}

      {editingRegimen && selected && (
        <RegimenForm
          regimen={editingRegimen === "new" ? null : editingRegimen}
          patientId={selected.id}
          templates={MED_TEMPLATES}
          templateToFields={templateToRegimenFields}
          onCancel={() => setEditingRegimen(null)}
          onSave={saveRegimen}
        />
      )}
    </div>
  );
}
