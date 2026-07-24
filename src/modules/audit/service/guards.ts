import { DomainError } from "@/lib/errors";
import type { SessionContext } from "@/lib/session";

// M10: consulta de auditoria e métricas são SÓ para super_admin (matriz §5).
export function requireAdmin(session: SessionContext): void {
  if (session.role !== "super_admin") {
    throw new DomainError("FORBIDDEN", "Requer super_admin", 403);
  }
}
