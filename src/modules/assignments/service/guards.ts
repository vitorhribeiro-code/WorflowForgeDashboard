import { DomainError } from "@/lib/errors";
import type { SessionContext } from "@/lib/session";

// Criar/atribuir/toggle/schedule/config são só de super_admin (matriz §5).
// O worker não faz toggle — só pede/religa conexões (M6).
export function requireAdmin(session: SessionContext): void {
  if (session.role !== "super_admin") {
    throw new DomainError("FORBIDDEN", "Requer super_admin", 403);
  }
}
