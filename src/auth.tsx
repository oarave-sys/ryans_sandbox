import { useEffect, useRef, useState } from "react";

export interface SessionUser {
  id: string;
  username: string;
  fullName: string | null;
  role: "nurse" | "admin";
  mustChangePassword: boolean;
}

async function post(path: string, body?: unknown): Promise<Response> {
  return fetch(`/api${path}`, {
    method: "POST",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    credentials: "same-origin",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export const authApi = {
  async me(): Promise<SessionUser | null> {
    const res = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (!res.ok) return null;
    return (await res.json()).user as SessionUser;
  },
  async login(username: string, password: string): Promise<SessionUser> {
    const res = await post("/auth/login", { username, password });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Login failed");
    return (await res.json()).user as SessionUser;
  },
  async logout(): Promise<void> {
    await post("/auth/logout");
  },
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const res = await post("/auth/change-password", { currentPassword, newPassword });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not change password");
  },
};

export function Login({ onLoggedIn }: { onLoggedIn: (u: SessionUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onLoggedIn(await authApi.login(username, password));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card panel" onSubmit={submit}>
        <div className="brand" style={{ fontSize: 20, marginBottom: 4 }}>
          <span className="dot" /> Infusion Daysheets
        </div>
        <p className="muted small" style={{ marginTop: 0 }}>Sign in to continue</p>
        <label className="field">Username
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
        </label>
        <label className="field">Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        {error && <div className="dueflag overdue" style={{ fontWeight: 500 }}>{error}</div>}
        <button className="btn primary" type="submit" disabled={busy || !username || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

export function ChangePassword({ user, onDone }: { user: SessionUser; onDone: () => void }) {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirm) { setError("New passwords do not match"); return; }
    if (newPassword.length < 8) { setError("New password must be at least 8 characters"); return; }
    setBusy(true);
    setError("");
    try {
      await authApi.changePassword(currentPassword, newPassword);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card panel" onSubmit={submit}>
        <div className="brand" style={{ fontSize: 18, marginBottom: 4 }}>
          <span className="dot" /> Set a new password
        </div>
        <p className="muted small" style={{ marginTop: 0 }}>
          {user.mustChangePassword
            ? "For security, choose a new password before continuing."
            : "Update your password."}
        </p>
        <label className="field">Current password
          <input type="password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </label>
        <label className="field">New password
          <input type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} autoComplete="new-password" />
        </label>
        <label className="field">Confirm new password
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </label>
        {error && <div className="dueflag overdue" style={{ fontWeight: 500 }}>{error}</div>}
        <button className="btn primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
      </form>
    </div>
  );
}

/**
 * Automatically sign the user out after a period of inactivity — a HIPAA
 * safeguard against unattended, logged-in workstations.
 */
export function useIdleLogout(minutes: number, onIdle: () => void) {
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    const reset = () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(onIdle, minutes * 60 * 1000);
    };
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      window.clearTimeout(timer.current);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [minutes, onIdle]);
}
