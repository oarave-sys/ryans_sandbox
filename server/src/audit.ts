import type { Request } from "express";
import { pool } from "./db.js";

export type AuditAction = "login" | "logout" | "login_failed" | "create" | "update" | "delete" | "view" | "print";

/**
 * Append an entry to the immutable audit trail. Never throws into the request
 * path — a failed audit write is logged but must not break clinical work.
 */
export async function audit(
  req: Request,
  action: AuditAction,
  entity?: string,
  entityId?: string,
  detail?: unknown
): Promise<void> {
  try {
    const user = req.session?.user;
    await pool.query(
      `INSERT INTO audit_log (user_id, username, action, entity, entity_id, detail, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        user?.id ?? null,
        user?.username ?? null,
        action,
        entity ?? null,
        entityId ?? null,
        detail ? JSON.stringify(detail) : null,
        clientIp(req),
      ]
    );
  } catch (e) {
    console.error("[audit] failed to write audit entry", e);
  }
}

function clientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return req.socket.remoteAddress ?? "";
}
