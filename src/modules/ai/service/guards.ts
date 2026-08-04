import { DomainError } from "@/lib/errors";
import type { SessionContext } from "@/lib/session";

// O registo de IA (chaves + bindings) é só de super_admin (matriz §5, mesma
// regra do M2/M4). Um worker nunca lê nem escreve chaves de LLM.
export function requireAdmin(session: SessionContext): void {
  if (session.role !== "super_admin") {
    throw new DomainError("FORBIDDEN", "Requer super_admin", 403);
  }
}
