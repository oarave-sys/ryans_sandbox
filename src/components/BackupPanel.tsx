import { useRef, useState } from "react";
import { db, exportAll, importAll, type Backup } from "../db";
import { seedIfEmpty } from "../seed";
import { formatDateHuman, todayISO } from "../calc";

export function BackupPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string>("");

  async function doExport() {
    const backup = await exportAll();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daysheets-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg("Exported a backup file to your downloads.");
  }

  async function doImport(mode: "replace" | "merge", file: File) {
    try {
      const text = await file.text();
      const backup = JSON.parse(text) as Backup;
      await importAll(backup, mode);
      setMsg(`Imported ${mode === "replace" ? "(replaced all data)" : "(merged)"} from ${file.name}.`);
    } catch (e) {
      setMsg(`Import failed: ${(e as Error).message}`);
    }
  }

  async function clearAll() {
    if (!confirm("Delete ALL local data (patients, regimens, daysheets)? This cannot be undone.")) return;
    await db.transaction("rw", db.providers, db.patients, db.regimens, db.encounters, async () => {
      await Promise.all([db.providers.clear(), db.patients.clear(), db.regimens.clear(), db.encounters.clear()]);
    });
    setMsg("All local data cleared.");
  }

  async function restoreDemo() {
    await seedIfEmpty();
    setMsg("Demo data restored (only if the database was empty).");
  }

  return (
    <div className="panel" style={{ maxWidth: 720 }}>
      <div className="panel-head"><h2>Backup &amp; data</h2></div>
      <div className="panel-body grid" style={{ gap: 16 }}>
        <div className="dueflag ok" style={{ fontWeight: 500 }}>
          <b>Where your data lives:</b> everything is stored only in this browser on this device (IndexedDB).
          Nothing is uploaded. Clearing your browser data, or using a different device or browser, means this
          data will not be there. Use <b>Export</b> regularly to keep a backup file, and to move data between devices.
        </div>

        <div>
          <h3 style={{ marginBottom: 8 }}>Export</h3>
          <p className="small muted" style={{ marginTop: 0 }}>Download a JSON backup of all patients, regimens, and daysheets.</p>
          <button className="btn primary" onClick={doExport}>Export backup file</button>
        </div>

        <div>
          <h3 style={{ marginBottom: 8 }}>Import</h3>
          <p className="small muted" style={{ marginTop: 0 }}>Load a previously exported backup file.</p>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const mode = confirm("OK = REPLACE all current data with the file.\nCancel = MERGE the file into current data.")
                ? "replace" : "merge";
              doImport(mode, f);
              e.target.value = "";
            }}
          />
          <button className="btn" onClick={() => fileRef.current?.click()}>Choose backup file…</button>
        </div>

        <div>
          <h3 style={{ marginBottom: 8 }}>Maintenance</h3>
          <div className="row">
            <button className="btn" onClick={restoreDemo}>Restore demo data</button>
            <button className="btn danger" onClick={clearAll}>Clear all data</button>
          </div>
        </div>

        {msg && <div className="badge ok" style={{ alignSelf: "flex-start" }}>{msg} · {formatDateHuman(todayISO())}</div>}
      </div>
    </div>
  );
}
