// Controlo de acesso puro. Isolamento por org + regra worker/admin.
import type { SessionContext } from "../../../lib/session";
import type { RunContext } from "../service/ports";

/**
 * super_admin: vê artefactos de qualquer run da SUA org.
 * worker:      só os runs de que é dono (assignment.worker_id = ele) e na sua org.
 * Nota: role segue o schema (super_admin | worker), não "admin" da docx.
 */
export function canAccessRun(session: SessionContext, ctx: RunContext): boolean {
  if (session.orgId !== ctx.orgId) return false;
  if (session.role === "super_admin") return true;
  return session.userId === ctx.workerId;
}
