import type { Encounter, Patient, Regimen } from "../types";
import type { DueStatus } from "../calc";
import { formatDateHuman } from "../calc";

// Clean, chart-ready rendering of a daysheet for printing. Mirrors the paper
// form so a printed copy can drop straight into the existing workflow.

function chk(on: boolean) {
  return <span className="ps-check">{on ? "[x]" : "[ ]"}</span>;
}
function blank(v?: string | number | null, min = 90) {
  return <span className="ps-blank" style={{ minWidth: min }}>{v ?? ""}</span>;
}

export function DaysheetPrint({
  enc, patient, doseHint, due, regimen,
}: {
  enc: Encounter;
  patient: Patient | null;
  doseHint: string;
  due: DueStatus | null;
  regimen?: Regimen | null;
}) {
  const name = patient ? `${patient.lastName}, ${patient.firstName}` : "Unknown patient";
  const labs = [...enc.labsOrdered];
  if (enc.labsOther) labs.push(enc.labsOther);
  const isSubQ = (enc.route ?? regimen?.route) === "SubQ";
  const gates = enc.gateResults ?? [];
  const firstDoseItems = regimen?.firstDoseItems ?? [];
  const educationPoints = regimen?.educationPoints ?? [];
  const holdCriteria = regimen?.holdCriteria ?? [];

  return (
    <div className="print-only print-sheet">
      <div className="ps-head">
        <div>
          <h1>Infusion Daysheet</h1>
          <div>{enc.medicationName}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div><b>{formatDateHuman(enc.date)}</b> {enc.apptTime ? `· ${enc.apptTime}` : ""}</div>
          {patient?.mrn && <div>MRN {patient.mrn}</div>}
        </div>
      </div>

      <table>
        <tbody>
          <tr><td className="ps-label">Patient</td><td>{name}</td><td className="ps-label">MD</td><td>{enc.providerName ?? ""}</td></tr>
          <tr><td className="ps-label">DX</td><td>{enc.diagnosis ?? ""}</td><td className="ps-label">Medication</td><td>{enc.medicationName}</td></tr>
          <tr>
            <td className="ps-label">MD visit needed?</td>
            <td>{chk(enc.mdVisitNeeded === "yes")} Yes&nbsp;&nbsp;{chk(enc.mdVisitNeeded === "no")} No&nbsp;&nbsp;{chk(!!enc.mdVisitSameDay)} Same day {enc.mdVisitTime ? `@ ${enc.mdVisitTime}` : ""}</td>
            <td className="ps-label">Date to schedule</td><td>{formatDateHuman(enc.dateToBeScheduled)}</td>
          </tr>
          {enc.maxDosePerPa !== undefined && (
            <tr><td className="ps-label">MAX DOSE per PA</td><td colSpan={3}>{blank(enc.maxDosePerPa, 120)}</td></tr>
          )}
        </tbody>
      </table>

      <div className="ps-section">Clinical review</div>
      <table>
        <tbody>
          <tr>
            <td className="ps-label">Infusion due?</td>
            <td>{chk(enc.infusionDue === "yes")} Yes&nbsp;&nbsp;{chk(enc.infusionDue === "no")} No&nbsp;&nbsp;{due ? `(${due.label})` : ""}</td>
            <td className="ps-label">Last INF date</td><td>{formatDateHuman(enc.lastInfusionDate)}</td>
          </tr>
          <tr><td className="ps-label">Labs</td><td colSpan={3}>{labs.length ? labs.join(", ") : "—"}</td></tr>
          <tr>
            <td className="ps-label">Previous weight</td><td>{blank(enc.previousWeight)}</td>
            <td className="ps-label">Previous dose</td><td>{blank(enc.previousDose)}</td>
          </tr>
        </tbody>
      </table>

      {gates.length > 0 && (
        <>
          <div className="ps-section">Before proceeding</div>
          <table>
            <tbody>
              {gates.map((g, i) => (
                <tr key={i}>
                  <td className="ps-label">{g.label}</td>
                  <td>{g.requiresValue ? <>Value {blank(g.value, 70)}&nbsp;&nbsp;</> : null}{g.requiresMdOk ? <>{chk(!!g.mdOk)} MD OK&nbsp;&nbsp;</> : null}{chk(g.cleared)} Cleared</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="ps-section">Dosing &amp; premeds</div>
      <table>
        <tbody>
          {(enc.scheduleNote || enc.firstDoseNote) && (
            <tr><td className="ps-label">Schedule</td><td colSpan={3}>{[enc.firstDoseNote, enc.scheduleNote].filter(Boolean).join(" · ")}</td></tr>
          )}
          <tr>
            <td className="ps-label">Weight</td><td>{blank(enc.weight)} {enc.weightUnit}</td>
            <td className="ps-label">Dose</td><td>{enc.computedDose || doseHint || blank(null)}</td>
          </tr>
          <tr>
            <td className="ps-label">Frequency</td><td>every {blank(enc.doseEveryWeeks, 40)} weeks</td>
            <td className="ps-label">Premeds</td>
            <td>{enc.premedsGiven.length ? enc.premedsGiven.map((p, i) => <span key={i}>{chk(p.given)} {p.name}{p.dose ? ` (${p.dose})` : ""}{p.timeGiven ? ` @ ${p.timeGiven}` : ""}&nbsp;&nbsp;</span>) : "—"}</td>
          </tr>
        </tbody>
      </table>

      <div className="ps-section">{isSubQ ? "Injection" : "IV access"} &amp; medication lots</div>
      <table>
        <tbody>
          {isSubQ ? (
            <tr>
              <td className="ps-label">Injection site</td>
              <td colSpan={3}>{blank(enc.injectionSite, 200)}</td>
            </tr>
          ) : (
            <tr>
              <td className="ps-label">IV site</td>
              <td>{enc.iv.side || "R/L"} · {enc.iv.location || "FA/AC/Hand/Wrist"} · {enc.iv.gauge ? `${enc.iv.gauge} g` : "22/24 g"}</td>
              <td className="ps-label"># attempts / failed</td>
              <td>{blank(enc.iv.attempts, 40)} &nbsp; {chk(enc.iv.failed)} failed</td>
            </tr>
          )}
          {enc.lots.map((lot, i) => (
            <tr key={i}>
              <td className="ps-label">Lot #</td><td>{blank(lot.lotNo)}</td>
              <td className="ps-label">Exp / # vials</td><td>{blank(lot.exp, 60)} · {blank(lot.vials, 30)} vials</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ps-section">Administration &amp; vitals</div>
      <table>
        <tbody>
          <tr>
            <td className="ps-label">Start time</td><td>{blank(enc.startTime)}</td>
            <td className="ps-label">Starting temp / weight</td><td>{blank(enc.startTemp, 50)} · {blank(enc.startWeight, 50)}</td>
          </tr>
          <tr>
            <td className="ps-label">Stop time</td><td>{blank(enc.stopTime)}</td>
            <td className="ps-label">Ending temp</td><td>{blank(enc.endTemp)}</td>
          </tr>
          {enc.observationMinutes !== undefined && (
            <tr>
              <td className="ps-label">Observation ({enc.observationMinutes || "—"} min)</td><td>End {blank(enc.observationEnd, 60)}</td>
              <td className="ps-label">Last temp</td><td>{blank(enc.lastTemp)}</td>
            </tr>
          )}
          <tr>
            <td className="ps-label">Vitals time</td><td>{blank(enc.vitalsTime)}</td>
            <td className="ps-label">BP / P</td><td>{blank(enc.bp, 60)} · {blank(enc.pulse, 40)}</td>
          </tr>
          <tr>
            <td className="ps-label">Completed by</td><td>{blank(enc.completedBy, 140)}</td>
            <td className="ps-label">Charted by</td><td>{blank(enc.chartedBy, 140)}</td>
          </tr>
        </tbody>
      </table>

      {enc.tracksBoneHealth && (
        <>
          <div className="ps-section">Bone health</div>
          <table>
            <tbody>
              <tr>
                <td className="ps-label">Last DEXA</td><td>{blank(enc.dexaDate, 90)}</td>
                <td className="ps-label">Calcium</td><td>{blank(enc.calciumValue, 70)}</td>
              </tr>
              <tr>
                <td className="ps-label">Note to provider (order if due)</td>
                <td colSpan={3}>{chk(enc.noteToProviderSent === "yes")} Yes&nbsp;&nbsp;{chk(enc.noteToProviderSent === "no")} No</td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      {firstDoseItems.length > 0 && (
        <div className="ps-ref"><b>1st dose — review / explain:</b>
          <ul>{firstDoseItems.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}
      {educationPoints.length > 0 && (
        <div className="ps-ref"><b>Ongoing education:</b>
          <ul>{educationPoints.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}
      {holdCriteria.length > 0 && (
        <div className="ps-ref"><b>Hold if:</b>
          <ul>{holdCriteria.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}

      {enc.notes && <p><b>Notes:</b> {enc.notes}</p>}
    </div>
  );
}
