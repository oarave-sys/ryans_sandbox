import { useEffect, useState } from "react";
import { newId } from "../db";

interface UserRow {
  id: string;
  username: string;
  full_name: string | null;
  role: "nurse" | "admin";
  active: boolean;
  must_change_password: boolean;
}
interface AuditRow {
  at: string;
  username: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  ip: string | null;
}

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    credentials: "same-origin",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

export function AdminPanel() {
  const [tab, setTab] = useState<"users" | "audit">("users");
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Admin</h2>
        <div className="nav" style={{ marginLeft: 12 }}>
          <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>Users</button>
          <button className={tab === "audit" ? "active" : ""} onClick={() => setTab("audit")}>Audit log</button>
        </div>
      </div>
      {tab === "users" ? <Users /> : <Audit />}
    </div>
  );
}

function Users() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [msg, setMsg] = useState("");
  const [adding, setAdding] = useState(false);
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"nurse" | "admin">("nurse");
  const [password, setPassword] = useState("");

  async function load() {
    try { setUsers((await api("GET", "/users")).users); } catch (e) { setMsg((e as Error).message); }
  }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("POST", "/users", { username, fullName, role, password });
      setMsg(`Created ${username}. They'll be prompted to change the temporary password at first sign-in.`);
      setUsername(""); setFullName(""); setPassword(""); setRole("nurse"); setAdding(false);
      load();
    } catch (e) { setMsg((e as Error).message); }
  }

  async function setActive(u: UserRow, active: boolean) {
    await api("POST", `/users/${u.id}/set-active`, { active });
    load();
  }
  async function resetPw(u: UserRow) {
    const pw = newId("tmp").slice(0, 12);
    await api("POST", `/users/${u.id}/reset-password`, { password: pw });
    setMsg(`Temporary password for ${u.username}: ${pw}  (they must change it at next sign-in)`);
  }

  return (
    <div className="panel-body">
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn sm primary" onClick={() => setAdding((v) => !v)}>{adding ? "Cancel" : "+ New user"}</button>
      </div>
      {adding && (
        <form className="grid cols-2" style={{ gap: 10, marginBottom: 16 }} onSubmit={create}>
          <label className="field">Username<input value={username} onChange={(e) => setUsername(e.target.value)} /></label>
          <label className="field">Full name<input value={fullName} onChange={(e) => setFullName(e.target.value)} /></label>
          <label className="field">Role
            <select value={role} onChange={(e) => setRole(e.target.value as "nurse" | "admin")}>
              <option value="nurse">Nurse</option><option value="admin">Admin</option>
            </select>
          </label>
          <label className="field">Temporary password (min 8)
            <input value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <div><button className="btn primary" type="submit" disabled={!username || password.length < 8}>Create user</button></div>
        </form>
      )}
      {msg && <div className="badge ok" style={{ marginBottom: 12, whiteSpace: "normal" }}>{msg}</div>}
      <table className="admin-table">
        <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.username}</td>
              <td>{u.full_name || "—"}</td>
              <td>{u.role}</td>
              <td>{u.active ? <span className="badge ok">active</span> : <span className="badge overdue">disabled</span>}</td>
              <td style={{ textAlign: "right" }}>
                <button className="btn sm" onClick={() => resetPw(u)}>Reset password</button>{" "}
                <button className="btn sm" onClick={() => setActive(u, !u.active)}>{u.active ? "Disable" : "Enable"}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Audit() {
  const [entries, setEntries] = useState<AuditRow[]>([]);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api("GET", "/audit?limit=300").then((r) => setEntries(r.entries)).catch((e) => setMsg((e as Error).message));
  }, []);
  return (
    <div className="panel-body">
      {msg && <div className="dueflag overdue">{msg}</div>}
      <p className="small muted" style={{ marginTop: 0 }}>Most recent 300 events. Every view, edit, print, and sign-in is recorded.</p>
      <table className="admin-table">
        <thead><tr><th>When</th><th>User</th><th>Action</th><th>Entity</th><th>ID</th><th>IP</th></tr></thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i}>
              <td className="mono small">{new Date(e.at).toLocaleString()}</td>
              <td>{e.username || "—"}</td>
              <td><span className="badge">{e.action}</span></td>
              <td>{e.entity || "—"}</td>
              <td className="mono small">{e.entity_id || "—"}</td>
              <td className="mono small">{e.ip || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
