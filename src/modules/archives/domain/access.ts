// Controlo de acesso puro. Isolamento por org + regra worker/admin.
import type { SessionContext } from "../../../lib/session";

export function isAdmin(s: SessionContext): boolean {
  return s.role === "super_admin";
}

/**
 * worker: só os seus arquivos (na sua org).
 * super_admin: todos os arquivos da sua org.
 */
export function canViewArchive(
  session: SessionContext,
  archiveOrgId: string,
  archiveWorkerId: string,
): boolean {
  if (session.orgId !== archiveOrgId) return false;
  if (isAdmin(session)) return true;
  return session.userId === archiveWorkerId;
}
