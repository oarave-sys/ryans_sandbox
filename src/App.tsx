import { useCallback, useEffect, useState } from "react";
import { Roster } from "./components/Roster";
import { PrepWorklist } from "./components/PrepWorklist";
import { Patients } from "./components/Patients";
import { BackupPanel } from "./components/BackupPanel";
import { AdminPanel } from "./components/AdminPanel";
import { Daysheet } from "./components/Daysheet";
import { authApi, ChangePassword, Login, useIdleLogout, type SessionUser } from "./auth";
import { onUnauthorized } from "./bus";

const IDLE_MINUTES = 15;

export default function App() {
  const [user, setUser] = useState<SessionUser | null | "loading">("loading");

  useEffect(() => {
    authApi.me().then((u) => setUser(u));
    const off = onUnauthorized(() => setUser(null));
    return off;
  }, []);

  if (user === "loading") {
    return <div className="auth-screen"><div className="muted">Loading…</div></div>;
  }
  if (!user) {
    return <Login onLoggedIn={setUser} />;
  }
  if (user.mustChangePassword) {
    return <ChangePassword user={user} onDone={() => authApi.me().then((u) => setUser(u))} />;
  }
  return <AuthedApp user={user} onLoggedOut={() => setUser(null)} />;
}

type View =
  | { name: "roster" }
  | { name: "prep" }
  | { name: "patients" }
  | { name: "backup" }
  | { name: "admin" }
  | { name: "daysheet"; encounterId: string; from: "roster" | "prep" | "patients" };

function AuthedApp({ user, onLoggedOut }: { user: SessionUser; onLoggedOut: () => void }) {
  const [view, setView] = useState<View>({ name: "roster" });
  const [changingPw, setChangingPw] = useState(false);

  const logout = useCallback(async () => {
    await authApi.logout();
    onLoggedOut();
  }, [onLoggedOut]);

  useIdleLogout(IDLE_MINUTES, logout);

  const go = (name: "roster" | "prep" | "patients" | "backup" | "admin") => setView({ name } as View);

  if (changingPw) {
    return <ChangePassword user={user} onDone={() => setChangingPw(false)} />;
  }

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
          {user.role === "admin" && (
            <button className={view.name === "admin" ? "active" : ""} onClick={() => go("admin")}>
              Admin
            </button>
          )}
        </nav>
        <div className="spacer" />
        <div className="user-area">
          <span className="small muted">{user.fullName || user.username} · {user.role}</span>
          <button className="btn sm ghost" onClick={() => setChangingPw(true)}>Password</button>
          <button className="btn sm" onClick={logout}>Sign out</button>
        </div>
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
        {view.name === "backup" && <BackupPanel role={user.role} />}
        {view.name === "admin" && user.role === "admin" && <AdminPanel />}
        {view.name === "daysheet" && (
          <Daysheet encounterId={view.encounterId} onBack={() => setView({ name: view.from } as View)} />
        )}
      </main>
    </div>
  );
}
