import { Router, type NextFunction, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { pool } from "./db.js";
import { audit } from "./audit.js";

export interface SessionUser {
  id: string;
  username: string;
  fullName: string | null;
  role: "nurse" | "admin";
  mustChangePassword: boolean;
}

declare module "express-session" {
  interface SessionData {
    user?: SessionUser;
  }
}

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  full_name: string | null;
  role: "nurse" | "admin";
  active: boolean;
  must_change_password: boolean;
}

function toSessionUser(u: UserRow): SessionUser {
  return {
    id: u.id,
    username: u.username,
    fullName: u.full_name,
    role: u.role,
    mustChangePassword: u.must_change_password,
  };
}

/** Require an authenticated session. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
}

/** Require a specific role (implies authentication). */
export function requireRole(role: "admin" | "nurse") {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.session?.user;
    if (!user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    if (role === "admin" && user.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  };
}

export const authRouter = Router();

authRouter.post("/login", async (req: Request, res: Response) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "Username and password required" });
    return;
  }
  const { rows } = await pool.query<UserRow>(
    "SELECT * FROM users WHERE lower(username) = lower($1) AND active = TRUE",
    [username]
  );
  const user = rows[0];
  const ok = user ? await bcrypt.compare(password, user.password_hash) : false;
  if (!user || !ok) {
    await audit(req, "login_failed", "session", undefined, { username });
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }
  // Regenerate the session id on login to prevent fixation.
  req.session.regenerate((err) => {
    if (err) {
      res.status(500).json({ error: "Session error" });
      return;
    }
    req.session.user = toSessionUser(user);
    void audit(req, "login", "session", user.id);
    res.json({ user: req.session.user });
  });
});

authRouter.post("/logout", (req: Request, res: Response) => {
  void audit(req, "logout", "session", req.session.user?.id);
  req.session.destroy(() => {
    res.clearCookie("sid");
    res.json({ ok: true });
  });
});

authRouter.get("/me", (req: Request, res: Response) => {
  if (!req.session?.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json({ user: req.session.user });
});

authRouter.post("/change-password", requireAuth, async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body ?? {};
  const sessionUser = req.session.user!;
  if (typeof newPassword !== "string" || newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters" });
    return;
  }
  const { rows } = await pool.query<UserRow>("SELECT * FROM users WHERE id = $1", [sessionUser.id]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(String(currentPassword ?? ""), user.password_hash))) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }
  const hash = await bcrypt.hash(newPassword, 12);
  await pool.query(
    "UPDATE users SET password_hash = $1, must_change_password = FALSE, updated_at = now() WHERE id = $2",
    [hash, user.id]
  );
  req.session.user = { ...sessionUser, mustChangePassword: false };
  void audit(req, "update", "user", user.id, { self: true, changedPassword: true });
  res.json({ ok: true });
});

// --- Admin: user management -------------------------------------------------

export const usersRouter = Router();
usersRouter.use(requireRole("admin"));

usersRouter.get("/", async (_req: Request, res: Response) => {
  const { rows } = await pool.query<Omit<UserRow, "password_hash">>(
    "SELECT id, username, full_name, role, active, must_change_password FROM users ORDER BY username"
  );
  res.json({ users: rows });
});

usersRouter.post("/", async (req: Request, res: Response) => {
  const { username, fullName, role, password } = req.body ?? {};
  if (typeof username !== "string" || !username.trim()) {
    res.status(400).json({ error: "Username required" });
    return;
  }
  if (typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "Temporary password must be at least 8 characters" });
    return;
  }
  const r = role === "admin" ? "admin" : "nurse";
  const hash = await bcrypt.hash(password, 12);
  const id = `usr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  try {
    await pool.query(
      `INSERT INTO users (id, username, password_hash, full_name, role, must_change_password)
       VALUES ($1, $2, $3, $4, $5, TRUE)`,
      [id, username.trim(), hash, typeof fullName === "string" ? fullName.trim() : null, r]
    );
  } catch {
    res.status(409).json({ error: "That username already exists" });
    return;
  }
  void audit(req, "create", "user", id, { username, role: r });
  res.json({ ok: true, id });
});

usersRouter.post("/:id/reset-password", async (req: Request, res: Response) => {
  const { password } = req.body ?? {};
  if (typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "Temporary password must be at least 8 characters" });
    return;
  }
  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    "UPDATE users SET password_hash = $1, must_change_password = TRUE, updated_at = now() WHERE id = $2",
    [hash, req.params.id]
  );
  void audit(req, "update", "user", req.params.id, { resetPassword: true });
  res.json({ ok: true });
});

usersRouter.post("/:id/set-active", async (req: Request, res: Response) => {
  const active = Boolean(req.body?.active);
  await pool.query("UPDATE users SET active = $1, updated_at = now() WHERE id = $2", [active, req.params.id]);
  void audit(req, "update", "user", req.params.id, { active });
  res.json({ ok: true });
});
