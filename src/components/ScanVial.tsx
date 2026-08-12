import { useEffect, useRef, useState } from "react";
import { parseGs1, type Gs1Parsed } from "../gs1";

// Minimal typing for the native BarcodeDetector (not in the TS DOM lib yet).
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
interface BarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorCtor;
  }
}

interface Scanned extends Gs1Parsed {
  key: string;
}

export function ScanVial({
  onVial, onClose,
}: {
  onVial: (parsed: Gs1Parsed) => void;
  onClose: () => void;
}) {
  const [buffer, setBuffer] = useState("");
  const [history, setHistory] = useState<Scanned[]>([]);
  const [error, setError] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const cameraSupported = typeof window !== "undefined" && !!window.BarcodeDetector;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function accept(text: string) {
    const parsed = parseGs1(text);
    if (!parsed.ok) {
      setError("Couldn't read a lot # or expiration from that scan. Try again, or enter it by hand below.");
      return;
    }
    setError("");
    onVial(parsed);
    setHistory((h) => [{ ...parsed, key: `${Date.now()}_${h.length}` }, ...h]);
    setBuffer("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (buffer.trim()) accept(buffer);
    }
  }

  // --- Camera scanning (optional) ---
  async function startCamera() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setCameraOn(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const detector = new window.BarcodeDetector!({
        formats: ["data_matrix", "code_128", "qr_code"],
      });
      const seen = new Set<string>();
      const tick = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          for (const c of codes) {
            if (!seen.has(c.rawValue)) {
              seen.add(c.rawValue);
              accept(c.rawValue);
            }
          }
        } catch {
          /* transient detect errors are ignored */
        }
        if (streamRef.current) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch {
      setError("Could not access the camera. Use a USB scanner or enter the lot by hand.");
      setCameraOn(false);
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  useEffect(() => () => stopCamera(), []);

  return (
    <div className="modal-overlay" onClick={() => { stopCamera(); onClose(); }}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head"><h2>Scan medication vial</h2></div>
        <div className="panel-body grid" style={{ gap: 12 }}>
          <p className="small muted" style={{ marginTop: 0 }}>
            Scan the 2D barcode on the vial with a USB scanner (recommended) — the lot #, expiration,
            and a vial count will fill in automatically. Scan each vial to tally the count.
          </p>

          <label className="field">Scanner input
            <input
              ref={inputRef}
              type="text"
              value={buffer}
              onChange={(e) => setBuffer(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Focus here and scan, or paste a barcode…"
              autoComplete="off"
            />
          </label>

          <div className="row">
            <button className="btn sm" onClick={() => buffer.trim() && accept(buffer)} disabled={!buffer.trim()}>
              Add scanned vial
            </button>
            {cameraSupported && !cameraOn && (
              <button className="btn sm" onClick={startCamera}>Use camera</button>
            )}
            {cameraOn && <button className="btn sm danger" onClick={stopCamera}>Stop camera</button>}
            {!cameraSupported && <span className="small muted">Camera scanning not supported in this browser</span>}
          </div>

          {cameraOn && (
            <video ref={videoRef} style={{ width: "100%", borderRadius: 8, background: "#000" }} muted playsInline />
          )}

          {error && <div className="dueflag overdue" style={{ fontWeight: 500 }}>{error}</div>}

          {history.length > 0 && (
            <div>
              <div className="field" style={{ marginBottom: 6 }}>Scanned this session</div>
              {history.map((h) => (
                <div key={h.key} className="row small" style={{ justifyContent: "space-between", borderBottom: "1px solid var(--line)", padding: "6px 0" }}>
                  <span className="mono">Lot {h.lot || "—"}</span>
                  <span className="muted">Exp {h.expiryDisplay || "—"}</span>
                  {h.ndc && <span className="muted mono">NDC {h.ndc}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="sticky-actions">
          <div className="spacer" style={{ flex: 1 }} />
          <button className="btn primary" onClick={() => { stopCamera(); onClose(); }}>Done</button>
        </div>
      </div>
    </div>
  );
}
