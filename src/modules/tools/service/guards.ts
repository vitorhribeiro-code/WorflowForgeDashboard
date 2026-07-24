import { DomainError } from "@/lib/errors";
import type { SessionContext } from "@/lib/session";

// Mutações do catálogo global são só de super_admin.
// NOTA: Tool é global (cross-org); idealmente seria um papel de plataforma
// acima de super_admin. Enquanto o schema só tem super_admin|worker, é este
// que gere o catálogo (ver questão em aberto §8).
export function requireAdmin(session: SessionContext): void {
  if (session.role !== "super_admin") {
    throw new DomainError("FORBIDDEN", "Requer super_admin", 403);
  }
}
