import { DomainError } from "@/lib/errors";
import type { SessionContext } from "@/lib/session";

// Gestão de org/áreas/utilizadores é só de super_admin (matriz §5).
export function requireAdmin(session: SessionContext): void {
  if (session.role !== "super_admin") {
    throw new DomainError("FORBIDDEN", "Requer super_admin", 403);
  }
}
