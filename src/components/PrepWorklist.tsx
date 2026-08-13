import { useMemo, useState } from "react";
import { db } from "../db";
import { useLive } from "../useLive";
import {
  todayISO, parseISODate, toISODate, formatDateHuman,
  computeAuthStatus, computePrepStatus,
} from "../calc";
import type { Encounter, Patient, PrepChecklist, Regimen } from "../types";

const EMPTY_PREP: PrepChecklist = { labsOnFile: false, orderVerified: false, authVerified: false };

export function PrepWorklist({ onOpen }: { onOpen: (encounterId: string) => void }) {
  // Default to tomorrow — prep is a day-before activity.
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toISODate(d);
  });

  const encounters = useLive<Encounter[]>(
    () => db.encounters.where("date").equals(date).toArray(),
    [date],
    []
  );
  const patients = useLive<Patient[]>(() => db.patients.toArray(), [], []);
  const regimens = useLive<Regimen[]>(() => db.regimens.toArray(), [], []);

  const patientById = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients]);
  const regimenById = useMemo(() => new Map(regimens.map((r) => [r.id, r])), [regimens]);

  const sorted = useMemo(
    () => [...encounters].sort((a, b) => (a.apptTime || "99").localeCompare(b.apptTime || "99")),
    [encounters]
  );

  const rows = sorted.map((enc) => {
    const regimen = regimenById.get(enc.regimenId);
    const auth = computeAuthStatus(regimen?.priorAuthExpires, regimen?.priorAuthDosesRemaining, enc.date);
    const status = computePrepStatus(enc, auth);
    return { enc, regimen, auth, status };
  });

  const readyCount = rows.filter((r) => r.status.ready).length;
  const attentionCount = rows.length - readyCount;

  function shiftDay(delta: number) {
    const d = parseISODate(date)!;
    d.setDate(d.getDate() + delta);
    setDate(toISODate(d));
  }

  function setPrep(enc: Encounter, patch: Partial<PrepChecklist>) {
    const prep = { ...EMPTY_PREP, ...(enc.prep ?? {}), ...patch };
    db.encounters.update(enc.id, { prep, updatedAt: Date.now() });
  }

  return (
    <>
      <div className="roster-toolbar">
        <button className="btn sm" onClick={() => shiftDay(-1)} aria-label="Previous day">←</button>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "auto" }} />
        <button className="btn sm" onClick={() => shiftDay(1)} aria-label="Next day">→</button>
        <button className="btn sm" onClick={() => setDate(todayISO())}>Today</button>
        <div className="spacer" style={{ flex: 1 }} />
        <div className="stat"><b>{rows.length}</b><span>scheduled</span></div>
        <div className="stat"><b style={{ color: "var(--ok)" }}>{readyCount}</b><span>ready</span></div>
        <div className="stat"><b style={{ color: attentionCount ? "var(--danger)" : undefined }}>{attentionCount}</b><span>need attention</span></div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Prep · {formatDateHuman(date)}</h2>
          <span className="muted small">Confirm each patient is ready before infusion day</span>
        </div>

        {rows.length === 0 ? (
          <div className="empty">Nothing scheduled for this day. Add infusions from the Daily Roster.</div>
        ) : (
          rows.map(({ enc, regimen, auth, status }) => {
            const patient = patientById.get(enc.patientId);
            const prep = enc.prep ?? EMPTY_PREP;
            return (
              <div className="sheet-section" key={enc.id}>
                <div className="row" style={{ alignItems: "flex-start" }}>
                  <div className="enc-time" style={{ width: 56 }}>{enc.apptTime || "—"}</div>
                  <div className="grow">
                    <div className="name" style={{ fontWeight: 700 }}>
                      {patient ? `${patient.lastName}, ${patient.firstName}` : "Unassigned (blank patient)"}
                    </div>
                    <div className="sub muted small">{enc.medicationName}{enc.providerName ? ` · ${enc.providerName}` : ""}</div>

                    <div className="row" style={{ gap: 14, marginTop: 8 }}>
                      <label className="checkline small">
                        <input type="checkbox" checked={prep.labsOnFile} onChange={(e) => setPrep(enc, { labsOnFile: e.target.checked })} />
                        Labs on file
                      </label>
                      <label className="checkline small">
                        <input type="checkbox" checked={prep.orderVerified} onChange={(e) => setPrep(enc, { orderVerified: e.target.checked })} />
                        Order verified
                      </label>
                      <label className="checkline small">
                        <input type="checkbox" checked={prep.authVerified} onChange={(e) => setPrep(enc, { authVerified: e.target.checked })} />
                        Auth confirmed
                      </label>
                    </div>

                    <div className="row" style={{ gap: 8, marginTop: 8 }}>
                      <span className={`badge ${(enc.weight ?? enc.previousWeight) !== undefined ? "ok" : "overdue"}`}>
                        {(enc.weight ?? enc.previousWeight) !== undefined ? "Weight on file" : "No weight"}
                      </span>
                      <span className={`badge ${authBadge(auth.state)}`}>{auth.label}</span>
                      {regimen?.priorAuthDosesRemaining !== undefined && (
                        <span className="badge">{regimen.priorAuthDosesRemaining} dose(s) left</span>
                      )}
                    </div>

                    {(status.blockers.length > 0 || status.warnings.length > 0) && (
                      <div className="small" style={{ marginTop: 8 }}>
                        {status.blockers.map((b, i) => <div key={`b${i}`} style={{ color: "var(--danger)" }}>• {b}</div>)}
                        {status.warnings.map((w, i) => <div key={`w${i}`} style={{ color: "var(--warn)" }}>• {w}</div>)}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                    {status.ready
                      ? <span className="badge ok">Ready ✓</span>
                      : <span className="badge overdue">{status.blockers.length} to resolve</span>}
                    <button className="btn sm" onClick={() => onOpen(enc.id)}>Open daysheet</button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

function authBadge(state: string): string {
  if (state === "ok") return "ok";
  if (state === "expiring") return "due";
  if (state === "expired" || state === "no_doses") return "overdue";
  return "";
}
