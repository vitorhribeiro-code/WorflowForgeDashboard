import { DomainError } from "@/lib/errors";
import type { SessionContext } from "@/lib/session";

// Importar mapeamento e converter em Task é só de super_admin (M11 alimenta o M4).
export function requireAdmin(session: SessionContext): void {
  if (session.role !== "super_admin") {
    throw new DomainError("FORBIDDEN", "Requer super_admin", 403);
  }
}
