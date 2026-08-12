import { useState } from "react";
import { Roster } from "./components/Roster";
import { PrepWorklist } from "./components/PrepWorklist";
import { Patients } from "./components/Patients";
import { BackupPanel } from "./components/BackupPanel";
import { Daysheet } from "./components/Daysheet";

type View =
  | { name: "roster" }
  | { name: "prep" }
  | { name: "patients" }
  | { name: "backup" }
  | { name: "daysheet"; encounterId: string; from: "roster" | "prep" | "patients" };

export default function App() {
  const [view, setView] = useState<View>({ name: "roster" });

  const go = (name: "roster" | "prep" | "patients" | "backup") => setView({ name } as View);

  return (
    <div className="app">
      <header className="topbar no-print">
        <div className="brand">
          <span className="dot" />
          Infusion Daysheets <small>· rheumatology infusion center</small>
        </div>
        <nav className="nav">
          <button className={view.name === "roster" || view.name === "daysheet" ? "active" : ""} onClick={() => go("roster")}>
            Daily Roster
          </button>
          <button className={view.name === "prep" ? "active" : ""} onClick={() => go("prep")}>
            Prep Worklist
          </button>
          <button className={view.name === "patients" ? "active" : ""} onClick={() => go("patients")}>
            Patients &amp; Regimens
          </button>
          <button className={view.name === "backup" ? "active" : ""} onClick={() => go("backup")}>
            Backup
          </button>
        </nav>
        <div className="spacer" />
        <span className="privacy-pill" title="All data is stored only in this browser on this device. Nothing is sent to a server.">
          <span className="dot" /> Local only · no data leaves this device
        </span>
      </header>

      <main className="main">
        {view.name === "roster" && (
          <Roster onOpen={(encounterId) => setView({ name: "daysheet", encounterId, from: "roster" })} />
        )}
        {view.name === "prep" && (
          <PrepWorklist onOpen={(encounterId) => setView({ name: "daysheet", encounterId, from: "prep" })} />
        )}
        {view.name === "patients" && (
          <Patients onOpenEncounter={(encounterId) => setView({ name: "daysheet", encounterId, from: "patients" })} />
        )}
        {view.name === "backup" && <BackupPanel />}
        {view.name === "daysheet" && (
          <Daysheet encounterId={view.encounterId} onBack={() => setView({ name: view.from } as View)} />
        )}
      </main>
    </div>
  );
}
