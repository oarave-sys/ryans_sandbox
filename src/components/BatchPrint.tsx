import { useMemo } from "react";
import { db, recordPrint } from "../db";
import { useLive } from "../useLive";
import { describeDose, computeDueStatus, formatDateHuman } from "../calc";
import { DaysheetPrint } from "./DaysheetPrint";
import type { Encounter, Patient, Regimen } from "../types";

// Renders a print-ready stack of every daysheet for a given day. On screen it
// shows a compact summary and a Print button; the sheets themselves are
// print-only (one per page) so a single Print run produces the whole day.

export function BatchPrint({ date, onBack }: { date: string; onBack: () => void }) {
  const encounters = useLive<Encounter[]>(
    () => db.encounters.where("date").equals(date).toArray(), [date], []
  );
  const patients = useLive<Patient[]>(() => db.patients.toArray(), [], []);
  const regimens = useLive<Regimen[]>(() => db.regimens.toArray(), [], []);

  const patientById = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients]);
  const regimenById = useMemo(() => new Map(regimens.map((r) => [r.id, r])), [regimens]);

  const sorted = useMemo(
    () => [...encounters].sort((a, b) => (a.apptTime || "99").localeCompare(b.apptTime || "99")),
    [encounters]
  );

  function printAll() {
    for (const e of sorted) void recordPrint(e.id);
    window.print();
  }

  return (
    <>
      <div className="screen-only">
        <div className="row no-print" style={{ marginBottom: 12 }}>
          <button className="backlink" onClick={onBack}>← Back</button>
          <div className="spacer" style={{ flex: 1 }} />
          <button className="btn primary" onClick={printAll} disabled={sorted.length === 0}>
            Print all {sorted.length} sheet{sorted.length === 1 ? "" : "s"}
          </button>
        </div>
        <div className="panel">
          <div className="panel-head">
            <h2>Print day · {formatDateHuman(date)}</h2>
            <span className="muted small">{sorted.length} sheet{sorted.length === 1 ? "" : "s"} ready — one page each</span>
          </div>
          {sorted.length === 0 ? (
            <div className="empty">No sheets for this day yet. Generate them from Import day or the Roster.</div>
          ) : (
            sorted.map((e) => {
              const p = patientById.get(e.patientId) ?? null;
              return (
                <div className="sheet-section row" key={e.id} style={{ justifyContent: "space-between" }}>
                  <span><b>{e.apptTime || "—"}</b> · {p ? `${p.lastName}, ${p.firstName}` : "Unknown"} · {e.medicationName}</span>
                  <span className="badge">{e.status}</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {sorted.map((e) => {
        const p = patientById.get(e.patientId) ?? null;
        const r = e.regimenId ? regimenById.get(e.regimenId) ?? null : null;
        const doseHint = r ? describeDose(r, e.weight, e.weightUnit) : (e.computedDose ?? "");
        const due = computeDueStatus(e.lastInfusionDate, e.doseEveryWeeks, e.date);
        return (
          <div className="page-break" key={e.id}>
            <DaysheetPrint enc={e} patient={p} doseHint={doseHint} due={due} regimen={r} />
          </div>
        );
      })}
    </>
  );
}
