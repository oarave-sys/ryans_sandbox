import { useEffect, useMemo, useState } from "react";
import { db, recordPrint } from "../db";
import {
  describeDose, computeDueStatus, formatDateHuman, todayISO,
} from "../calc";
import type { Encounter, MedLot, Patient, Regimen } from "../types";
import { DaysheetPrint } from "./DaysheetPrint";
import { ScanVial } from "./ScanVial";
import type { Gs1Parsed } from "../gs1";

const LAB_OPTIONS = ["CBC", "CRP", "ESR", "CMP", "Lipid panel", "TB / QuantiFERON", "Hepatitis panel"];

export function Daysheet({ encounterId, onBack }: { encounterId: string; onBack: () => void }) {
  const [enc, setEnc] = useState<Encounter | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [regimen, setRegimen] = useState<Regimen | null>(null);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const e = await db.encounters.get(encounterId);
      if (!live || !e) return;
      setEnc(e);
      const [p, r] = await Promise.all([
        db.patients.get(e.patientId),
        db.regimens.get(e.regimenId),
      ]);
      setPatient(p ?? null);
      setRegimen(r ?? null);
    })();
    return () => { live = false; };
  }, [encounterId]);

  // Persist a partial update to local state and the server.
  function update(patch: Partial<Encounter>) {
    setEnc((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch, updatedAt: Date.now() };
      setSaved("saving");
      db.encounters.put(next).then(() => setSaved("saved")).catch(() => setSaved("idle"));
      return next;
    });
  }

  const due = useMemo(
    () => (enc ? computeDueStatus(enc.lastInfusionDate, enc.doseEveryWeeks, enc.date) : null),
    [enc]
  );

  const doseHint = useMemo(() => {
    if (!enc || !regimen) return "";
    return describeDose(regimen, enc.weight, enc.weightUnit);
  }, [enc, regimen]);

  if (!enc) {
    return (
      <div className="panel"><div className="empty">Loading daysheet…</div></div>
    );
  }

  const patientName = patient ? `${patient.lastName}, ${patient.firstName}` : "Unknown patient";

  function toggleLab(lab: string) {
    const has = enc!.labsOrdered.includes(lab);
    update({ labsOrdered: has ? enc!.labsOrdered.filter((l) => l !== lab) : [...enc!.labsOrdered, lab] });
  }

  function setLot(i: number, patch: Partial<MedLot>) {
    const lots = enc!.lots.map((l, idx) => (idx === i ? { ...l, ...patch } : l));
    update({ lots });
  }
  function addLot() { update({ lots: [...enc!.lots, { lotNo: "", exp: "", vials: undefined }] }); }
  function removeLot(i: number) { update({ lots: enc!.lots.filter((_, idx) => idx !== i) }); }

  // Merge a scanned vial: bump the count if the same lot was already scanned,
  // otherwise fill the first blank lot row or append a new one.
  function mergeScannedVial(p: Gs1Parsed) {
    const lots = [...enc!.lots];
    const lotNo = p.lot ?? "";
    const exp = p.expiryDisplay ?? "";
    const existing = lots.findIndex((l) => l.lotNo && l.lotNo === lotNo);
    if (existing >= 0) {
      lots[existing] = { ...lots[existing], exp: lots[existing].exp || exp, vials: (lots[existing].vials ?? 0) + 1 };
    } else {
      const blank = lots.findIndex((l) => !l.lotNo && !l.exp && !l.vials);
      const row: MedLot = { lotNo, exp, vials: 1 };
      if (blank >= 0) lots[blank] = row;
      else lots.push(row);
    }
    update({ lots });
  }

  function setPremed(i: number, patch: Partial<Encounter["premedsGiven"][number]>) {
    update({ premedsGiven: enc!.premedsGiven.map((p, idx) => (idx === i ? { ...p, ...patch } : p)) });
  }

  function doPrint() {
    if (enc) void recordPrint(enc.id);
    window.print();
  }

  async function markCompleted() {
    update({ status: "completed" });
    // Advance the standing order's last-infusion date so the next visit's
    // "due" calculation is correct without any extra bookkeeping.
    if (regimen) {
      await db.regimens.update(regimen.id, { lastInfusionDate: enc!.date, updatedAt: Date.now() });
    }
  }

  return (
    <>
      {/* Printable version (hidden on screen, shown when printing) */}
      <DaysheetPrint enc={enc} patient={patient} doseHint={doseHint} due={due} />

      <div className="screen-only">
        <div className="row no-print" style={{ marginBottom: 12 }}>
          <button className="backlink" onClick={onBack}>← Back to roster</button>
          <div className="spacer" style={{ flex: 1 }} />
          <span className="muted small">
            {saved === "saving" ? "Saving…" : saved === "saved" ? "All changes saved" : ""}
          </span>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>{patientName}</h2>
            <span className="badge">{enc.medicationName}</span>
            {due && (
              <span className={`badge ${due.due ? (due.daysUntilDue !== null && due.daysUntilDue < 0 ? "overdue" : "due") : "ok"}`}>
                {due.label}
              </span>
            )}
            <div className="spacer" style={{ flex: 1 }} />
            <button className="btn sm no-print" onClick={doPrint}>Print</button>
          </div>

          {/* --- Visit & scheduling --- */}
          <div className="sheet-section">
            <h3>Visit &amp; scheduling</h3>
            <div className="grid cols-4">
              <label className="field">Appt date
                <input type="date" value={enc.date} onChange={(e) => update({ date: e.target.value })} />
              </label>
              <label className="field">Appt time
                <input type="time" value={enc.apptTime ?? ""} onChange={(e) => update({ apptTime: e.target.value })} />
              </label>
              <label className="field">MD
                <input type="text" value={enc.providerName ?? ""} onChange={(e) => update({ providerName: e.target.value })} />
              </label>
              <label className="field">DX
                <input type="text" value={enc.diagnosis ?? ""} onChange={(e) => update({ diagnosis: e.target.value })} />
              </label>
            </div>
            <div className="grid cols-4" style={{ marginTop: 12 }}>
              <label className="field">MD visit needed?
                <select value={enc.mdVisitNeeded} onChange={(e) => update({ mdVisitNeeded: e.target.value as Encounter["mdVisitNeeded"] })}>
                  <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                </select>
              </label>
              <label className="field">&nbsp;
                <span className="checkline" style={{ paddingTop: 6 }}>
                  <input type="checkbox" checked={!!enc.mdVisitSameDay} onChange={(e) => update({ mdVisitSameDay: e.target.checked })} />
                  Same day
                </span>
              </label>
              <label className="field">MD visit time
                <input type="time" value={enc.mdVisitTime ?? ""} onChange={(e) => update({ mdVisitTime: e.target.value })} />
              </label>
              <label className="field">Date to be scheduled
                <input type="date" value={enc.dateToBeScheduled ?? ""} onChange={(e) => update({ dateToBeScheduled: e.target.value })} />
              </label>
            </div>
          </div>

          {/* --- Clinical review --- */}
          <div className="sheet-section">
            <h3>Clinical review</h3>
            <div className="grid cols-3">
              <label className="field">Infusion due?
                <select value={enc.infusionDue} onChange={(e) => update({ infusionDue: e.target.value as Encounter["infusionDue"] })}>
                  <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                </select>
              </label>
              <label className="field">Last infusion date
                <input type="date" value={enc.lastInfusionDate ?? ""} onChange={(e) => update({ lastInfusionDate: e.target.value })} />
              </label>
              <div className="field">Schedule
                {due && <div className={`dueflag ${due.due ? (due.daysUntilDue !== null && due.daysUntilDue < 0 ? "overdue" : "due") : "ok"}`}>{due.label}{due.dueDate ? ` · next due ${formatDateHuman(due.dueDate)}` : ""}</div>}
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <div className="field" style={{ marginBottom: 6 }}>Labs ordered</div>
              <div className="chalso">
                {LAB_OPTIONS.map((lab) => (
                  <span className="checkline" key={lab}>
                    <input type="checkbox" checked={enc.labsOrdered.includes(lab)} onChange={() => toggleLab(lab)} />
                    {lab}
                  </span>
                ))}
              </div>
              <label className="field" style={{ marginTop: 10 }}>Other labs
                <input type="text" value={enc.labsOther ?? ""} onChange={(e) => update({ labsOther: e.target.value })} placeholder="+ additional labs" />
              </label>
            </div>
            <div className="grid cols-2" style={{ marginTop: 12 }}>
              <label className="field">Previous weight
                <input type="number" value={enc.previousWeight ?? ""} onChange={(e) => update({ previousWeight: numOrUndef(e.target.value) })} />
              </label>
              <label className="field">Previous dose
                <input type="text" value={enc.previousDose ?? ""} onChange={(e) => update({ previousDose: e.target.value })} />
              </label>
            </div>
          </div>

          {/* --- Dosing --- */}
          <div className="sheet-section">
            <h3>Dosing</h3>
            <div className="grid cols-4">
              <label className="field">Current weight
                <input type="number" value={enc.weight ?? ""} onChange={(e) => update({ weight: numOrUndef(e.target.value) })} />
              </label>
              <label className="field">Unit
                <select value={enc.weightUnit} onChange={(e) => update({ weightUnit: e.target.value as "kg" | "lb" })}>
                  <option value="lb">lb</option><option value="kg">kg</option>
                </select>
              </label>
              <label className="field">Every (weeks)
                <input type="number" value={enc.doseEveryWeeks ?? ""} onChange={(e) => update({ doseEveryWeeks: numOrUndef(e.target.value) })} />
              </label>
              <div className="field">Calculated dose
                <div className="calcbox">{doseHint || "—"}</div>
              </div>
            </div>
            <label className="field" style={{ marginTop: 12 }}>Charted dose {regimen ? `(${regimen.route ?? "IV"})` : ""}
              <input type="text" value={enc.computedDose ?? ""} onChange={(e) => update({ computedDose: e.target.value })} placeholder={doseHint || "e.g. 210 mg"} />
            </label>
            {regimen?.administrationNote && <p className="muted small" style={{ marginTop: 6 }}>{regimen.administrationNote}</p>}
          </div>

          {/* --- Premeds --- */}
          <div className="sheet-section">
            <h3>Premeds given</h3>
            {enc.premedsGiven.length === 0 && <p className="muted small">No standing premeds on this regimen.</p>}
            <div className="chalso">
              {enc.premedsGiven.map((p, i) => (
                <span className="checkline" key={i}>
                  <input type="checkbox" checked={p.given} onChange={(e) => setPremed(i, { given: e.target.checked })} />
                  {p.name}{p.dose ? ` · ${p.dose}` : ""}
                </span>
              ))}
            </div>
          </div>

          {/* --- IV access --- */}
          <div className="sheet-section">
            <h3>IV access</h3>
            <div className="grid cols-4">
              <label className="field">Side
                <select value={enc.iv.side} onChange={(e) => update({ iv: { ...enc.iv, side: e.target.value as Encounter["iv"]["side"] } })}>
                  <option value="">—</option><option value="R">R</option><option value="L">L</option>
                </select>
              </label>
              <label className="field">Location
                <select value={enc.iv.location} onChange={(e) => update({ iv: { ...enc.iv, location: e.target.value as Encounter["iv"]["location"] } })}>
                  <option value="">—</option><option value="FA">FA</option><option value="AC">AC</option><option value="Hand">Hand</option><option value="Wrist">Wrist</option>
                </select>
              </label>
              <label className="field">Gauge
                <select value={enc.iv.gauge} onChange={(e) => update({ iv: { ...enc.iv, gauge: e.target.value as Encounter["iv"]["gauge"] } })}>
                  <option value="">—</option><option value="22">22 g</option><option value="24">24 g</option>
                </select>
              </label>
              <label className="field"># attempts
                <input type="number" value={enc.iv.attempts ?? ""} onChange={(e) => update({ iv: { ...enc.iv, attempts: numOrUndef(e.target.value) } })} />
              </label>
            </div>
            <span className="checkline" style={{ marginTop: 10 }}>
              <input type="checkbox" checked={enc.iv.failed} onChange={(e) => update({ iv: { ...enc.iv, failed: e.target.checked } })} />
              IV site failed
            </span>
          </div>

          {/* --- Medication lots --- */}
          <div className="sheet-section">
            <div className="row" style={{ marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Medication lots</h3>
              <div className="spacer" style={{ flex: 1 }} />
              <button className="btn sm primary no-print" onClick={() => setScanning(true)}>⤢ Scan vial</button>
            </div>
            {enc.lots.map((lot, i) => (
              <div className="lot-row" key={i} style={{ marginBottom: 8 }}>
                <label className="field">Lot #
                  <input type="text" value={lot.lotNo} onChange={(e) => setLot(i, { lotNo: e.target.value })} />
                </label>
                <label className="field">Exp
                  <input type="text" value={lot.exp} onChange={(e) => setLot(i, { exp: e.target.value })} placeholder="MM/YYYY" />
                </label>
                <label className="field"># vials
                  <input type="number" value={lot.vials ?? ""} onChange={(e) => setLot(i, { vials: numOrUndef(e.target.value) })} />
                </label>
                <button className="btn sm danger" onClick={() => removeLot(i)} disabled={enc.lots.length === 1}>Remove</button>
              </div>
            ))}
            <button className="btn sm" onClick={addLot}>+ Add lot</button>
          </div>

          {/* --- Administration & vitals --- */}
          <div className="sheet-section">
            <h3>Administration &amp; vitals</h3>
            <div className="grid cols-3">
              <label className="field">Start time
                <input type="time" value={enc.startTime ?? ""} onChange={(e) => update({ startTime: e.target.value })} />
              </label>
              <label className="field">Starting temp
                <input type="text" value={enc.startTemp ?? ""} onChange={(e) => update({ startTemp: e.target.value })} placeholder="°F" />
              </label>
              <label className="field">Weight at start
                <input type="number" value={enc.startWeight ?? ""} onChange={(e) => update({ startWeight: numOrUndef(e.target.value) })} />
              </label>
              <label className="field">Stop time
                <input type="time" value={enc.stopTime ?? ""} onChange={(e) => update({ stopTime: e.target.value })} />
              </label>
              <label className="field">Ending temp
                <input type="text" value={enc.endTemp ?? ""} onChange={(e) => update({ endTemp: e.target.value })} placeholder="°F" />
              </label>
              <label className="field">Vitals time
                <input type="time" value={enc.vitalsTime ?? ""} onChange={(e) => update({ vitalsTime: e.target.value })} />
              </label>
              <label className="field">BP
                <input type="text" value={enc.bp ?? ""} onChange={(e) => update({ bp: e.target.value })} placeholder="120/80" />
              </label>
              <label className="field">Pulse
                <input type="text" value={enc.pulse ?? ""} onChange={(e) => update({ pulse: e.target.value })} />
              </label>
            </div>
            <div className="grid cols-2" style={{ marginTop: 12 }}>
              <label className="field">Infusion completed by
                <input type="text" value={enc.completedBy ?? ""} onChange={(e) => update({ completedBy: e.target.value })} />
              </label>
              <label className="field">Charted by
                <input type="text" value={enc.chartedBy ?? ""} onChange={(e) => update({ chartedBy: e.target.value })} />
              </label>
            </div>
            <label className="field" style={{ marginTop: 12 }}>Notes
              <textarea value={enc.notes ?? ""} onChange={(e) => update({ notes: e.target.value })} />
            </label>
          </div>

          <div className="sticky-actions no-print">
            <button className="btn" onClick={onBack}>Back</button>
            <div className="spacer" style={{ flex: 1 }} />
            <span className="muted small">Appt {formatDateHuman(enc.date)}{enc.date === todayISO() ? " · today" : ""}</span>
            <button className="btn" onClick={doPrint}>Print</button>
            <button className="btn primary" onClick={markCompleted} disabled={enc.status === "completed"}>
              {enc.status === "completed" ? "Completed ✓" : "Mark completed"}
            </button>
          </div>
        </div>
      </div>

      {scanning && <ScanVial onVial={mergeScannedVial} onClose={() => setScanning(false)} />}
    </>
  );
}

function numOrUndef(v: string): number | undefined {
  if (v.trim() === "") return undefined;
  const n = Number(v);
  return isNaN(n) ? undefined : n;
}
