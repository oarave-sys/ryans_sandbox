import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import helmet from "helmet";
import { initDb, pool } from "./db.js";
import { authRouter, requireAuth, usersRouter } from "./auth.js";
import {
  auditRouter, encountersRouter, patientsRouter, providersRouter, regimensRouter,
} from "./routes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 8080);
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-insecure-secret-change-me";
const SESSION_MINUTES = Number(process.env.SESSION_MINUTES ?? 30);
const SECURE_COOKIES = process.env.SECURE_COOKIES === "1";
const CLIENT_DIR = process.env.CLIENT_DIR || join(__dirname, "../../dist");

const app = express();

// Behind a reverse proxy terminating TLS, trust it so secure cookies work.
if (process.env.TRUST_PROXY) app.set("trust proxy", 1);

app.use(helmet({ contentSecurityPolicy: false })); // CSP tuned at the proxy/app level
app.use(express.json({ limit: "1mb" }));

const PgSession = connectPgSimple(session);
app.use(
  session({
    name: "sid",
    store: new PgSession({ pool, tableName: "session", createTableIfMissing: true }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true, // sliding expiration: activity extends the session
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: SECURE_COOKIES,
      maxAge: SESSION_MINUTES * 60 * 1000,
    },
  })
);

// CSRF-lite: for state-changing API calls, require a same-origin request.
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (origin) {
    const host = req.get("host");
    try {
      if (new URL(origin).host !== host) {
        res.status(403).json({ error: "Cross-origin request rejected" });
        return;
      }
    } catch {
      res.status(403).json({ error: "Bad origin" });
      return;
    }
  }
  next();
});

app.get("/api/health", async (_req: Request, res: Response) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

app.use("/api/auth", authRouter);
app.use("/api/users", requireAuth, usersRouter);
app.use("/api/providers", requireAuth, providersRouter);
app.use("/api/patients", requireAuth, patientsRouter);
app.use("/api/regimens", requireAuth, regimensRouter);
app.use("/api/encounters", requireAuth, encountersRouter);
app.use("/api/audit", requireAuth, auditRouter);

app.use("/api", (_req: Request, res: Response) => res.status(404).json({ error: "Unknown API route" }));

// --- Static client (built SPA) ---------------------------------------------
app.use(express.static(CLIENT_DIR));
// SPA fallback for client-side navigation.
app.get("*", (_req: Request, res: Response) => {
  res.sendFile(join(CLIENT_DIR, "index.html"));
});

// Centralized error handler so async failures return JSON, not HTML stacks.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[error]", err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error" });
});

async function main() {
  await initDb();
  app.listen(PORT, () => console.log(`[server] listening on :${PORT}`));
}

main().catch((e) => {
  console.error("Fatal startup error:", e);
  process.exit(1);
});
