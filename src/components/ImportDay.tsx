import { useMemo, useState } from "react";
import { db, newId } from "../db";
import { useLive } from "../useLive";
import { todayISO, formatDateHuman } from "../calc";
import { MED_TEMPLATES, matchTemplate, type MedTemplate } from "../seed";
import { parseSchedule, ocrImage } from "../schedule";
import { generateEncounter, regimenFromTemplate } from "../factory";
import type { Patient, Provider, Regimen } from "../types";

// Import a whole day's schedule (pasted text or an OCR'd screenshot), match each
// row to a drug template, review, and generate the pre-filled daysheets in one
// pass — then print the stack. This is the "photo → filled sheets → print"
// workflow. Parsing is best-effort, so every row stays editable before anything
// is created.

interface EditRow {
  time?: string;
  drugRaw: string;
  templateName: string; // "" = unmatched / skip
  patientRaw: string;
  patientId: string; // assigned existing patient, or "" to create/placeholder
  provider?: string;
  include: boolean;
}

interface GenResult { created: number; patientsCreated: number; skipped: number; }

function to24h(t?: string): string | undefined {
  if (!t) return undefined;
  const m = /(\d{1,2}):(\d{2})\s*([AP])M/i.exec(t);
  if (!m) return undefined;
  let h = Number(m[1]);
  const min = m[2];
  const ap = m[3].toUpperCase();
  if (ap === "P" && h !== 12) h += 12;
  if (ap === "A" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${min}`;
}

function nameParts(s: string): { last: string; first: string } {
  const parts = s.split(",");
  return { last: (parts[0] ?? "").trim(), first: (parts[1] ?? "").trim() };
}
function patientKey(last: string, first: string): string {
  return `${last}|${first}`.toLowerCase();
}

export function ImportDay({ onPrintDay }: {
  onPrintDay: (date: string) => void;
}) {
  const patients = useLive<Patient[]>(() => db.patients.toArray(), [], []);
  const regimens = useLive<Regimen[]>(() => db.regimens.toArray(), [], []);
  const providers = useLive<Provider[]>(() => db.providers.toArray(), [], []);

  const [mode, setMode] = useState<"paste" | "image">("paste");
  const [text, setText] = useState("");
  const [date, setDate] = useState(todayISO());
  const [rows, setRows] = useState<EditRow[] | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrPct, setOcrPct] = useState(0);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenResult | null>(null);

  const patientByKey = useMemo(() => {
    const m = new Map<string, Patient>();
    for (const p of patients) m.set(patientKey(p.lastName, p.firstName), p);
    return m;
  }, [patients]);

  function buildRows(raw: string) {
    const parsed = parseSchedule(raw);
    const next: EditRow[] = parsed.map((r) => {
      const t = matchTemplate(r.drugRaw);
      let patientId = "";
      if (r.patientRaw) {
        const { last, first } = nameParts(r.patientRaw);
        patientId = patientByKey.get(patientKey(last, first))?.id ?? "";
      }
      return {
        time: r.time,
        drugRaw: r.drugRaw,
        templateName: t?.medicationName ?? "",
        patientRaw: r.patientRaw ?? "",
        patientId,
        provider: r.provider,
        include: true,
      };
    });
    setRows(next);
    setResult(null);
  }

  async function handleImage(file: File) {
    setOcrBusy(true);
    setOcrError(null);
    setOcrPct(0);
    try {
      const out = await ocrImage(file, setOcrPct);
      setText(out);
      buildRows(out);
    } catch (e) {
      setOcrError(
        "On-device OCR could not run here. In the clinic build the OCR assets are served locally; " +
        "for now, paste the schedule text instead. (" + (e instanceof Error ? e.message : String(e)) + ")"
      );
    } finally {
      setOcrBusy(false);
    }
  }

  function setRow(i: number, patch: Partial<EditRow>) {
    setRows((prev) => (prev ? prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) : prev));
  }

  function findOrCreateProvider(name: string, created: Provider[]): string | undefined {
    const n = name.trim();
    if (!n) return undefined;
    const existing = [...providers, ...created].find((p) => p.name.toLowerCase() === n.toLowerCase());
    if (existing) return existing.id;
    const prov: Provider = { id: newId("prov"), name: n, active: true };
    created.push(prov);
    return prov.id;
  }

  async function generate() {
    if (!rows) return;
    setGenerating(true);
    const res: GenResult = { created: 0, patientsCreated: 0, skipped: 0 };
    // Track entities created during this run so multiple rows reuse them.
    const localPatients = new Map(patients.map((p) => [patientKey(p.lastName, p.firstName), p]));
    const localRegimens = [...regimens];
    const newProviders: Provider[] = [];

    try {
      for (const row of rows) {
        if (!row.include || !row.templateName) { if (row.include) res.skipped++; continue; }
        const template = MED_TEMPLATES.find((t) => t.medicationName === row.templateName) as MedTemplate | undefined;
        if (!template) { res.skipped++; continue; }

        // --- resolve patient ---
        let patient: Patient | undefined;
        if (row.patientId) {
          patient = patients.find((p) => p.id === row.patientId);
        }
        if (!patient && row.patientRaw.trim()) {
          const { last, first } = nameParts(row.patientRaw);
          patient = localPatients.get(patientKey(last, first));
          if (!patient) {
            const ts = Date.now();
            patient = {
              id: newId("pat"), firstName: first, lastName: last || row.patientRaw.trim(),
              providerId: row.provider ? findOrCreateProvider(row.provider, newProviders) : undefined,
              active: true, createdAt: ts, updatedAt: ts,
            };
            localPatients.set(patientKey(patient.lastName, patient.firstName), patient);
            res.patientsCreated++;
          }
        }
        if (!patient) {
          // No patient on the row (de-identified schedule) — create a placeholder
          // so the correct drug sheet can still be generated and printed.
          const ts = Date.now();
          patient = {
            id: newId("pat"), firstName: "", lastName: `(unassigned ${row.time ?? ""})`.trim(),
            providerId: row.provider ? findOrCreateProvider(row.provider, newProviders) : undefined,
            active: true, createdAt: ts, updatedAt: ts,
          };
          res.patientsCreated++;
        }

        // --- resolve regimen (reuse the patient's active one for this drug) ---
        let regimen = localRegimens.find(
          (r) => r.patientId === patient!.id && r.active && r.medicationName === template.medicationName
        );
        if (!regimen) {
          regimen = regimenFromTemplate(template, patient.id);
          localRegimens.push(regimen);
        }

        // --- persist any newly-created dependencies, then the encounter ---
        if (!patients.some((p) => p.id === patient!.id) && !(await db.patients.get(patient.id))) {
          for (const prov of newProviders) if (!(await db.providers.get(prov.id))) await db.providers.add(prov);
          await db.patients.add(patient);
        }
        if (!regimens.some((r) => r.id === regimen!.id) && !(await db.regimens.get(regimen.id))) {
          await db.regimens.add(regimen);
        }

        const enc = generateEncounter(patient, regimen, [...providers, ...newProviders], date, to24h(row.time));
        if (row.provider) enc.providerName = row.provider;
        await db.encounters.add(enc);
        res.created++;
      }
      setResult(res);
    } finally {
      setGenerating(false);
    }
  }

  const includable = rows?.filter((r) => r.include && r.templateName).length ?? 0;

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Import day</h2>
        <span className="muted small">Paste the schedule or upload a screenshot → review → generate every sheet</span>
      </div>

      <div className="sheet-section">
        <div className="row" style={{ gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <div className="seg">
            <button className={`seg-btn ${mode === "paste" ? "active" : ""}`} onClick={() => setMode("paste")}>Paste text</button>
            <button className={`seg-btn ${mode === "image" ? "active" : ""}`} onClick={() => setMode("image")}>Upload image (OCR)</button>
          </div>
          <div className="spacer" style={{ flex: 1 }} />
          <label className="field" style={{ margin: 0 }}>Day
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>

        {mode === "paste" ? (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"Paste the schedule grid, e.g.\n8:00 A   Benlysta   09/01/2026   Benlysta   Meier, Svetlana"}
              style={{ minHeight: 160, fontFamily: "ui-monospace, monospace", fontSize: 13 }}
            />
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn primary" disabled={!text.trim()} onClick={() => buildRows(text)}>Parse schedule</button>
            </div>
          </>
        ) : (
          <div className="dropzone">
            <input
              type="file" accept="image/*"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImage(f); }}
              disabled={ocrBusy}
            />
            <p className="muted small" style={{ marginTop: 8 }}>
              The image is read on this device — it never leaves the network.
              {ocrBusy && ` Reading… ${Math.round(ocrPct * 100)}%`}
            </p>
            {ocrError && <p className="small" style={{ color: "var(--danger)" }}>{ocrError}</p>}
          </div>
        )}
      </div>

      {rows && (
        <div className="sheet-section">
          <div className="row" style={{ marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>Review — {rows.length} row{rows.length === 1 ? "" : "s"}</h3>
            <span className="muted small" style={{ marginLeft: 10 }}>Fix any misread drug or assign a patient before generating.</span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="import-table">
              <thead>
                <tr><th>Use</th><th>Time</th><th>Schedule text</th><th>Drug template</th><th>Patient</th><th>Provider</th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={r.templateName ? "" : "unmatched"}>
                    <td><input type="checkbox" checked={r.include} onChange={(e) => setRow(i, { include: e.target.checked })} /></td>
                    <td className="nowrap">{r.time ?? "—"}</td>
                    <td className="muted small">{r.drugRaw || "—"}</td>
                    <td>
                      <select value={r.templateName} onChange={(e) => setRow(i, { templateName: e.target.value })}>
                        <option value="">— no match (skip) —</option>
                        {MED_TEMPLATES.map((t) => <option key={t.medicationName} value={t.medicationName}>{t.medicationName}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={r.patientId} onChange={(e) => setRow(i, { patientId: e.target.value })}>
                        <option value="">{r.patientRaw ? `New: ${r.patientRaw}` : "(unassigned)"}</option>
                        {patients.map((p) => <option key={p.id} value={p.id}>{p.lastName}, {p.firstName}</option>)}
                      </select>
                    </td>
                    <td className="muted small nowrap">{r.provider ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="row" style={{ marginTop: 14, gap: 10 }}>
            <button className="btn primary" disabled={generating || includable === 0} onClick={generate}>
              {generating ? "Generating…" : `Generate ${includable} daysheet${includable === 1 ? "" : "s"}`}
            </button>
            <span className="muted small">for {formatDateHuman(date)}</span>
          </div>
        </div>
      )}

      {result && (
        <div className="sheet-section">
          <div className="callout ok">
            <b>{result.created} daysheet{result.created === 1 ? "" : "s"} generated</b> for {formatDateHuman(date)}
            {result.patientsCreated > 0 && ` · ${result.patientsCreated} new patient record${result.patientsCreated === 1 ? "" : "s"} created`}
            {result.skipped > 0 && ` · ${result.skipped} row${result.skipped === 1 ? "" : "s"} skipped (no drug match)`}.
          </div>
          <div className="row" style={{ marginTop: 12, gap: 10 }}>
            <button className="btn primary" onClick={() => onPrintDay(date)} disabled={result.created === 0}>Print all sheets</button>
            <span className="muted small">Opens a print-ready stack of every sheet for the day.</span>
          </div>
        </div>
      )}
    </div>
  );
}
