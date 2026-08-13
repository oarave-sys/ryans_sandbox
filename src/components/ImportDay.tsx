import { useState } from "react";
import { db } from "../db";
import { todayISO, formatDateHuman } from "../calc";
import { MED_TEMPLATES, matchTemplate, type MedTemplate } from "../seed";
import { parseSchedule, ocrImage } from "../schedule";
import { encounterFromTemplate } from "../factory";

// Import a whole day's schedule (pasted text or an OCR'd screenshot), match each
// row to a drug template, review, and generate the pre-filled daysheets in one
// pass — then print the stack. This is the "photo → filled sheets → print"
// workflow. Parsing is best-effort, so every row stays editable before anything
// is created.
//
// By design the sheets are generated with the PATIENT LINE AND DOB LEFT BLANK
// (no patient is selected or stored) — the nurse hand-writes those, matching the
// paper workflow and keeping patient identity out of the app.

interface EditRow {
  time?: string;
  drugRaw: string;
  templateName: string; // "" = unmatched / skip
  provider?: string;
  include: boolean;
}

interface GenResult { created: number; skipped: number; }

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

export function ImportDay({ onPrintDay }: { onPrintDay: (date: string) => void }) {
  const [mode, setMode] = useState<"paste" | "image">("paste");
  const [text, setText] = useState("");
  const [date, setDate] = useState(todayISO());
  const [rows, setRows] = useState<EditRow[] | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrPct, setOcrPct] = useState(0);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenResult | null>(null);

  function buildRows(raw: string) {
    const parsed = parseSchedule(raw);
    const next: EditRow[] = parsed.map((r) => ({
      time: r.time,
      drugRaw: r.drugRaw,
      templateName: matchTemplate(r.drugRaw)?.medicationName ?? "",
      provider: r.provider,
      include: true,
    }));
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

  async function generate() {
    if (!rows) return;
    setGenerating(true);
    const res: GenResult = { created: 0, skipped: 0 };
    try {
      for (const row of rows) {
        if (!row.include) continue;
        const template = MED_TEMPLATES.find((t) => t.medicationName === row.templateName) as MedTemplate | undefined;
        if (!template) { res.skipped++; continue; }
        const enc = encounterFromTemplate(template, date, to24h(row.time), row.provider);
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
            <span className="muted small" style={{ marginLeft: 10 }}>Fix any misread drug before generating. Patient name &amp; DOB are left blank on each sheet.</span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="import-table">
              <thead>
                <tr><th>Use</th><th>Time</th><th>Schedule text</th><th>Drug template</th><th>Provider</th></tr>
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
            <span className="muted small">for {formatDateHuman(date)} — patient line &amp; DOB blank</span>
          </div>
        </div>
      )}

      {result && (
        <div className="sheet-section">
          <div className="callout ok">
            <b>{result.created} daysheet{result.created === 1 ? "" : "s"} generated</b> for {formatDateHuman(date)}
            {result.skipped > 0 && ` · ${result.skipped} row${result.skipped === 1 ? "" : "s"} skipped (no drug match)`}.
            &nbsp;Patient name and DOB are blank on each sheet for the nurse to complete.
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
