// Parser for the GS1 barcodes printed on medication vials (2D DataMatrix or
// GS1-128). Pharmaceutical packaging encodes data in Application Identifiers
// (AIs); the ones that matter for a daysheet are:
//   (01) GTIN         — global trade item number (contains the NDC)
//   (17) Expiration   — YYMMDD
//   (10) Lot / batch  — variable length
//   (21) Serial       — variable length (ignored here)
//
// Variable-length AIs are terminated by the FNC1 / group-separator character
// (ASCII 29, "\x1d") or the end of the string. A keyboard-wedge scanner usually
// emits that separator; some emit a printable substitute. We handle both.

export interface Gs1Parsed {
  gtin?: string;
  ndc?: string; // best-effort NDC derived from the GTIN
  lot?: string;
  expiry?: string; // ISO date (YYYY-MM-DD)
  expiryDisplay?: string; // MM/YYYY for charting
  serial?: string;
  raw: string;
  ok: boolean; // true if at least a lot or expiry was found
}

// Fixed-length AI value lengths (excluding the 2-digit AI itself).
const FIXED_LEN: Record<string, number> = {
  "00": 18, "01": 14, "02": 14,
  "11": 6, "12": 6, "13": 6, "15": 6, "16": 6, "17": 6,
  "20": 2,
};

const GS = "\x1d";

/** Normalize common scanner encodings of the FNC1/group separator to \x1d. */
function normalize(input: string): string {
  return input
    .replace(/␝/g, GS) // ␝ symbol
    .replace(/\{GS\}/gi, GS)
    .replace(/\]d2/gi, "") // AIM symbology identifier prefix for DataMatrix
    .replace(/\]C1/gi, "") // AIM prefix for GS1-128
    .trim();
}

export function parseGs1(input: string): Gs1Parsed {
  const raw = input;
  let s = normalize(input);
  const out: Gs1Parsed = { raw, ok: false };

  // Strip a leading FNC1 if present.
  if (s.startsWith(GS)) s = s.slice(1);

  let i = 0;
  let guard = 0;
  while (i < s.length && guard++ < 50) {
    // Skip stray separators.
    if (s[i] === GS) { i++; continue; }
    const ai = s.slice(i, i + 2);
    if (!/^\d{2}$/.test(ai)) break; // not a GS1 stream we understand
    i += 2;

    const fixed = FIXED_LEN[ai];
    let value: string;
    if (fixed !== undefined) {
      value = s.slice(i, i + fixed);
      i += fixed;
    } else {
      // Variable length: read until next GS or end of string.
      const next = s.indexOf(GS, i);
      const end = next === -1 ? s.length : next;
      value = s.slice(i, end);
      i = end;
    }

    switch (ai) {
      case "01":
      case "02":
        out.gtin = value;
        out.ndc = gtinToNdc(value);
        break;
      case "17":
        out.expiry = yymmddToISO(value);
        out.expiryDisplay = out.expiry ? isoToMonthYear(out.expiry) : undefined;
        break;
      case "10":
        out.lot = value;
        break;
      case "21":
        out.serial = value;
        break;
      default:
        // Other AIs ignored.
        break;
    }
  }

  out.ok = Boolean(out.lot || out.expiry);
  return out;
}

/**
 * Best-effort NDC from a 14-digit GTIN. US drug GTINs are typically a 10- or
 * 11-digit NDC padded with a leading "003" (indicator + UPC "3" for drugs).
 * We return the 11-digit core; exact 10-digit segmentation depends on the
 * labeler and is not attempted here.
 */
function gtinToNdc(gtin: string): string | undefined {
  if (!/^\d{14}$/.test(gtin)) return undefined;
  // Drop the packaging indicator (first digit) and the check digit (last).
  const core = gtin.slice(1, 13);
  // US pharma NDCs live in the trailing 11 digits of that core.
  const ndc11 = core.slice(-11);
  return ndc11;
}

function yymmddToISO(v: string): string | undefined {
  if (!/^\d{6}$/.test(v)) return undefined;
  const yy = Number(v.slice(0, 2));
  const mm = v.slice(2, 4);
  let dd = v.slice(4, 6);
  // GS1: a day of "00" means "last day of the month".
  const year = 2000 + yy;
  if (dd === "00") {
    const last = new Date(year, Number(mm), 0).getDate();
    dd = String(last).padStart(2, "0");
  }
  const iso = `${year}-${mm}-${dd}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : undefined;
}

function isoToMonthYear(iso: string): string {
  const [y, m] = iso.split("-");
  return `${m}/${y}`;
}
