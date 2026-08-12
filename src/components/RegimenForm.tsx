import { useState } from "react";
import { newId } from "../db";
import type { DoseMode, DoseUnit, PremedTemplate, Regimen } from "../types";
import type { MedTemplate } from "../seed";

const COMMON_LABS = ["CBC", "CRP", "ESR", "CMP", "Lipid panel", "TB / QuantiFERON", "Hepatitis panel"];

export function RegimenForm({
  regimen, patientId, templates, templateToFields, onSave, onCancel,
}: {
  regimen: Regimen | null;
  patientId: string;
  templates: MedTemplate[];
  templateToFields: (t: MedTemplate) => Omit<Regimen, "id" | "patientId" | "active" | "createdAt" | "updatedAt" | "lastInfusionDate" | "notes">;
  onSave: (r: Regimen) => void;
  onCancel: () => void;
}) {
  const [medicationName, setMedicationName] = useState(regimen?.medicationName ?? "");
  const [doseMode, setDoseMode] = useState<DoseMode>(regimen?.doseMode ?? "per_kg");
  const [doseValue, setDoseValue] = useState<string>(regimen ? String(regimen.doseValue) : "");
  const [doseUnit, setDoseUnit] = useState<DoseUnit>(regimen?.doseUnit ?? "mg");
  const [frequencyWeeks, setFrequencyWeeks] = useState<string>(regimen ? String(regimen.frequencyWeeks) : "8");
  const [route, setRoute] = useState(regimen?.route ?? "IV");
  const [administrationNote, setAdministrationNote] = useState(regimen?.administrationNote ?? "");
  const [premeds, setPremeds] = useState<PremedTemplate[]>(regimen?.premeds ?? []);
  const [standingLabs, setStandingLabs] = useState<string[]>(regimen?.standingLabs ?? ["CBC", "CMP"]);
  const [lastInfusionDate, setLastInfusionDate] = useState(regimen?.lastInfusionDate ?? "");
  const [priorAuthNumber, setPriorAuthNumber] = useState(regimen?.priorAuthNumber ?? "");
  const [priorAuthExpires, setPriorAuthExpires] = useState(regimen?.priorAuthExpires ?? "");
  const [priorAuthDosesRemaining, setPriorAuthDosesRemaining] = useState<string>(
    regimen?.priorAuthDosesRemaining !== undefined ? String(regimen.priorAuthDosesRemaining) : ""
  );
  const [notes, setNotes] = useState(regimen?.notes ?? "");
  const [active, setActive] = useState(regimen?.active ?? true);

  function applyTemplate(name: string) {
    const t = templates.find((x) => x.medicationName === name);
    if (!t) return;
    const f = templateToFields(t);
    setMedicationName(f.medicationName);
    setDoseMode(f.doseMode);
    setDoseValue(String(f.doseValue));
    setDoseUnit(f.doseUnit);
    setFrequencyWeeks(String(f.frequencyWeeks));
    setRoute(f.route ?? "IV");
    setAdministrationNote(f.administrationNote ?? "");
    setPremeds(f.premeds.map((p) => ({ ...p })));
    setStandingLabs([...f.standingLabs]);
  }

  function toggleLab(lab: string) {
    setStandingLabs((prev) => (prev.includes(lab) ? prev.filter((l) => l !== lab) : [...prev, lab]));
  }
  function updatePremed(i: number, patch: Partial<PremedTemplate>) {
    setPremeds((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }
  function addPremed() { setPremeds((prev) => [...prev, { name: "", dose: "", standing: true }]); }
  function removePremed(i: number) { setPremeds((prev) => prev.filter((_, idx) => idx !== i)); }

  function save() {
    const now = Date.now();
    onSave({
      id: regimen?.id ?? newId("reg"),
      patientId,
      medicationName: medicationName.trim(),
      doseMode,
      doseValue: Number(doseValue) || 0,
      doseUnit,
      frequencyWeeks: Number(frequencyWeeks) || 0,
      route: route.trim() || undefined,
      administrationNote: administrationNote.trim() || undefined,
      premeds: premeds.filter((p) => p.name.trim()).map((p) => ({ ...p, name: p.name.trim() })),
      standingLabs,
      lastInfusionDate: lastInfusionDate || undefined,
      priorAuthNumber: priorAuthNumber.trim() || undefined,
      priorAuthExpires: priorAuthExpires || undefined,
      priorAuthDosesRemaining: priorAuthDosesRemaining.trim() === "" ? undefined : Number(priorAuthDosesRemaining),
      notes: notes.trim() || undefined,
      active,
      createdAt: regimen?.createdAt ?? now,
      updatedAt: now,
    });
  }

  const valid = medicationName.trim() && Number(doseValue) > 0 && Number(frequencyWeeks) > 0;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 620 }}>
        <div className="panel-head"><h2>{regimen ? "Edit regimen" : "Add regimen"}</h2></div>
        <div className="panel-body grid" style={{ gap: 12 }}>
          {!regimen && (
            <label className="field">Start from a medication template
              <select defaultValue="" onChange={(e) => { applyTemplate(e.target.value); e.target.value = ""; }}>
                <option value="">Choose a common medication…</option>
                {templates.map((t) => <option key={t.medicationName} value={t.medicationName}>{t.medicationName}</option>)}
              </select>
            </label>
          )}

          <label className="field">Medication name <span className="req">*</span>
            <input type="text" value={medicationName} onChange={(e) => setMedicationName(e.target.value)} placeholder="e.g. Infliximab (Remicade)" />
          </label>

          <div className="grid cols-3">
            <label className="field">Dose type
              <select value={doseMode} onChange={(e) => setDoseMode(e.target.value as DoseMode)}>
                <option value="per_kg">Weight-based (mg/kg)</option>
                <option value="flat">Flat dose</option>
              </select>
            </label>
            <label className="field">{doseMode === "per_kg" ? "mg per kg" : "Amount"} <span className="req">*</span>
              <input type="number" value={doseValue} onChange={(e) => setDoseValue(e.target.value)} />
            </label>
            {doseMode === "flat" ? (
              <label className="field">Unit
                <select value={doseUnit} onChange={(e) => setDoseUnit(e.target.value as DoseUnit)}>
                  <option value="mg">mg</option><option value="g">g</option>
                </select>
              </label>
            ) : (
              <label className="field">&nbsp;<div className="calcbox small">mg/kg × weight</div></label>
            )}
          </div>

          <div className="grid cols-2">
            <label className="field">Every (weeks) <span className="req">*</span>
              <input type="number" value={frequencyWeeks} onChange={(e) => setFrequencyWeeks(e.target.value)} />
            </label>
            <label className="field">Route
              <input type="text" value={route} onChange={(e) => setRoute(e.target.value)} placeholder="IV / Rapid Remicade / SubQ" />
            </label>
          </div>

          <label className="field">Administration note
            <input type="text" value={administrationNote} onChange={(e) => setAdministrationNote(e.target.value)} placeholder="e.g. rapid infusion over 1 hr" />
          </label>

          <div className="field">Standing premeds
            {premeds.map((p, i) => (
              <div className="row" key={i} style={{ marginTop: 6 }}>
                <input type="text" value={p.name} onChange={(e) => updatePremed(i, { name: e.target.value })} placeholder="Premed name" className="grow" />
                <input type="text" value={p.dose ?? ""} onChange={(e) => updatePremed(i, { dose: e.target.value })} placeholder="Dose" style={{ width: 110 }} />
                <label className="checkline small" title="Given every visit by default">
                  <input type="checkbox" checked={p.standing} onChange={(e) => updatePremed(i, { standing: e.target.checked })} /> standing
                </label>
                <button className="btn sm danger" onClick={() => removePremed(i)}>✕</button>
              </div>
            ))}
            <button className="btn sm" style={{ marginTop: 8, alignSelf: "flex-start" }} onClick={addPremed}>+ Add premed</button>
          </div>

          <div className="field">Standing labs
            <div className="chalso" style={{ marginTop: 6 }}>
              {COMMON_LABS.map((lab) => (
                <span className="checkline" key={lab}>
                  <input type="checkbox" checked={standingLabs.includes(lab)} onChange={() => toggleLab(lab)} /> {lab}
                </span>
              ))}
            </div>
          </div>

          <div className="grid cols-2">
            <label className="field">Last infusion date
              <input type="date" value={lastInfusionDate} onChange={(e) => setLastInfusionDate(e.target.value)} />
            </label>
            <label className="field">&nbsp;
              <span className="checkline" style={{ paddingTop: 6 }}>
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active regimen
              </span>
            </label>
          </div>

          <div className="field" style={{ gap: 8 }}>Prior authorization
            <div className="grid cols-3">
              <label className="field" style={{ fontWeight: 400 }}>Auth #
                <input type="text" value={priorAuthNumber} onChange={(e) => setPriorAuthNumber(e.target.value)} />
              </label>
              <label className="field" style={{ fontWeight: 400 }}>Expires
                <input type="date" value={priorAuthExpires} onChange={(e) => setPriorAuthExpires(e.target.value)} />
              </label>
              <label className="field" style={{ fontWeight: 400 }}>Doses remaining
                <input type="number" value={priorAuthDosesRemaining} onChange={(e) => setPriorAuthDosesRemaining(e.target.value)} />
              </label>
            </div>
          </div>

          <label className="field">Notes
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
        <div className="sticky-actions">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <div className="spacer" style={{ flex: 1 }} />
          <button className="btn primary" disabled={!valid} onClick={save}>Save regimen</button>
        </div>
      </div>
    </div>
  );
}
