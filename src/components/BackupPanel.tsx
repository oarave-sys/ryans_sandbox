import { useState } from "react";
import { exportAll } from "../db";
import { formatDateHuman, todayISO } from "../calc";

export function BackupPanel({ role }: { role: "nurse" | "admin" }) {
  const [msg, setMsg] = useState("");

  async function doExport() {
    const backup = await exportAll();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daysheets-export-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg("Exported a JSON snapshot to your downloads.");
  }

  return (
    <div className="panel" style={{ maxWidth: 760 }}>
      <div className="panel-head"><h2>Backup &amp; data</h2></div>
      <div className="panel-body grid" style={{ gap: 16 }}>
        <div className="dueflag ok" style={{ fontWeight: 500 }}>
          <b>Where your data lives:</b> all patient data is stored in this clinic's own database on the
          server your IT manages — not in the browser and not in any outside cloud. The authoritative,
          scheduled backups are handled at the database level by your IT company (see the deployment
          runbook). Nothing here needs to run for your data to be safe.
        </div>

        <div>
          <h3 style={{ marginBottom: 8 }}>On-demand export</h3>
          <p className="small muted" style={{ marginTop: 0 }}>
            Download a one-time JSON snapshot of all records — handy for an ad-hoc copy or to hand to IT.
            This does not replace the scheduled database backups.
          </p>
          {role === "admin" ? (
            <button className="btn primary" onClick={doExport}>Export JSON snapshot</button>
          ) : (
            <p className="small muted">Exporting is limited to administrators.</p>
          )}
        </div>

        {msg && <div className="badge ok" style={{ alignSelf: "flex-start" }}>{msg} · {formatDateHuman(todayISO())}</div>}
      </div>
    </div>
  );
}
