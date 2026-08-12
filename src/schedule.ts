// Parsing a day's appointment schedule — from pasted grid text or from OCR of
// an uploaded screenshot — into rows the Import screen can turn into daysheets.
//
// The clinic's schedule (NextGen day view) has columns like:
//   Beg Tm | Event (drug) | Nxt Appt Dt | Nxt Event | Rendering (provider)
// and, in real use, a patient column. Layout varies, so the parser is
// best-effort and delimiter-agnostic (tabs, or runs of spaces from OCR); the
// Import screen always shows an EDITABLE review grid so staff fix any misread
// before anything is generated.

export interface ScheduleRow {
  time?: string; // normalized "8:00 AM"
  drugRaw: string; // the Event cell, e.g. "Rituxan 2", "Simponi Aria"
  provider?: string; // "Lastname, First"
  patientRaw?: string; // patient name if a patient column was present
  nextAppt?: string; // next appointment date, if shown
  raw: string; // the original line, for reference
}

const TIME_RE = /(\d{1,2}):(\d{2})\s*([AaPp])\.?\s*[Mm]?/;
const DATE_RE = /(\d{1,2}\/\d{1,2}\/\d{2,4})/g;
// "Lastname, First" — allows hyphen/apostrophe/period, requires the comma.
const NAME_RE = /([A-Z][A-Za-z.'-]+,\s*[A-Z][A-Za-z.'-]+)/g;

function normalizeTime(m: RegExpMatchArray): string {
  const h = m[1];
  const min = m[2];
  const ap = m[3].toUpperCase();
  return `${h}:${min} ${ap}M`;
}

/** Heading / noise lines we never want to treat as appointments. */
function isNoise(line: string): boolean {
  const l = line.trim().toLowerCase();
  if (!l) return true;
  // Column headers and page furniture.
  if (/beg\s*tm|nxt\s*appt|rendering|\bevent\b\s*$/.test(l) && !TIME_RE.test(line)) return true;
  return false;
}

/** Parse a single line into a row, or null if it has no time and no drug. */
export function parseLine(line: string): ScheduleRow | null {
  if (isNoise(line)) return null;

  const timeMatch = line.match(TIME_RE);
  const names = [...line.matchAll(NAME_RE)].map((m) => ({ text: m[1].replace(/\s+/g, " ").trim(), index: m.index ?? 0 }));
  const dates = [...line.matchAll(DATE_RE)].map((m) => ({ text: m[1], index: m.index ?? 0 }));

  const timeEnd = timeMatch ? (timeMatch.index ?? 0) + timeMatch[0].length : 0;

  // The drug (Event) sits after the time and before the first date or name.
  const firstDate = dates.length ? dates[0].index : Infinity;
  const firstName = names.length ? names[0].index : Infinity;
  const drugEnd = Math.min(firstDate, firstName);
  let drugRaw = line.slice(timeEnd, drugEnd === Infinity ? undefined : drugEnd);
  drugRaw = drugRaw.replace(/[\t|]+/g, " ").replace(/\s{2,}/g, " ").trim();

  // Provider is the last name-like token; a patient (if any) is one that
  // appears before the drug/date region.
  const provider = names.length ? names[names.length - 1].text : undefined;
  const patient = names.length >= 2 && names[0].index < firstDate ? names[0].text : undefined;

  if (!timeMatch && !drugRaw) return null;

  return {
    time: timeMatch ? normalizeTime(timeMatch) : undefined,
    drugRaw,
    provider,
    patientRaw: patient,
    nextAppt: dates.length ? dates[0].text : undefined,
    raw: line.trim(),
  };
}

/** Parse a full schedule blob (pasted or OCR'd) into candidate rows. */
export function parseSchedule(text: string): ScheduleRow[] {
  return text
    .split(/\r?\n/)
    .map(parseLine)
    .filter((r): r is ScheduleRow => r !== null && (!!r.time || !!r.drugRaw));
}

/**
 * Run on-device OCR over an uploaded image and return the recognized text.
 *
 * Uses tesseract.js, which runs entirely in the browser — no image leaves the
 * clinic network, consistent with the self-hosted / no-BAA design.
 *
 * When built with VITE_OCR_ASSETS set (e.g. "/ocr/"), the worker, WASM core, and
 * language data are loaded from that locally-served path so OCR works fully
 * offline behind a locked-down clinic network — run `npm run fetch:ocr` to
 * populate it (see DEPLOY.md). When the var is unset, tesseract.js falls back to
 * its default CDN, which is convenient in development but blocked in the clinic.
 */
export async function ocrImage(
  file: File | Blob,
  onProgress?: (fraction: number) => void
): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const base = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_OCR_ASSETS;
  const options: Record<string, unknown> = {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text" && onProgress) onProgress(m.progress);
    },
  };
  if (base) {
    options.workerPath = `${base}worker.min.js`;
    options.corePath = base; // directory — tesseract picks the right core variant
    options.langPath = base; // serves eng.traineddata.gz
  }
  const worker = await createWorker("eng", 1, options);
  try {
    const { data } = await worker.recognize(file);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
