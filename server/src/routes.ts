import { Router, type Request, type Response } from "express";
import { deleteEntity, getEntity, listEntities, pool, upsertEntity } from "./db.js";
import { audit } from "./audit.js";
import { requireRole } from "./auth.js";

/**
 * Build a REST router for a JSONB-backed entity table.
 *
 * @param table       physical table name
 * @param entity      audit label (singular)
 * @param filterMap   query-string param -> promoted column, for list filtering
 * @param auditView   whether GET /:id records a "view" (used for encounters/PHI)
 */
function entityRouter(
  table: string,
  entity: string,
  filterMap: Record<string, string> = {},
  auditView = false
): Router {
  const r = Router();

  r.get("/", async (req: Request, res: Response) => {
    for (const [param, column] of Object.entries(filterMap)) {
      const value = req.query[param];
      if (typeof value === "string" && value.length) {
        res.json(await listEntities(table, { column, value }));
        return;
      }
    }
    res.json(await listEntities(table));
  });

  r.get("/:id", async (req: Request, res: Response) => {
    const doc = await getEntity(table, req.params.id);
    if (!doc) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (auditView) void audit(req, "view", entity, req.params.id);
    res.json(doc);
  });

  r.put("/:id", async (req: Request, res: Response) => {
    const id = req.params.id;
    const body = req.body;
    if (!body || typeof body !== "object" || body.id !== id) {
      res.status(400).json({ error: "Body must be the full object with a matching id" });
      return;
    }
    const existing = await getEntity(table, id);
    await upsertEntity(table, id, body);
    void audit(req, existing ? "update" : "create", entity, id);
    res.json(body);
  });

  r.delete("/:id", async (req: Request, res: Response) => {
    await deleteEntity(table, req.params.id);
    void audit(req, "delete", entity, req.params.id);
    res.json({ ok: true });
  });

  return r;
}

export const providersRouter = entityRouter("providers", "provider");
export const patientsRouter = entityRouter("patients", "patient");
export const regimensRouter = entityRouter("regimens", "regimen", { patientId: "patient_id" });
export const encountersRouter = entityRouter(
  "encounters",
  "encounter",
  { date: "date", patientId: "patient_id" },
  true
);

// Record a print event for an encounter (called by the client before printing).
encountersRouter.post("/:id/print", async (req: Request, res: Response) => {
  void audit(req, "print", "encounter", req.params.id);
  res.json({ ok: true });
});

// --- Audit log (admin only) -------------------------------------------------

export const auditRouter = Router();
auditRouter.use(requireRole("admin"));

auditRouter.get("/", async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const { rows } = await pool.query(
    `SELECT at, username, action, entity, entity_id, detail, ip
     FROM audit_log ORDER BY at DESC LIMIT $1`,
    [limit]
  );
  res.json({ entries: rows });
});
