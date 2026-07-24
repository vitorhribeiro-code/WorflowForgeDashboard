import { DomainError } from "./errors";
import { verifyToken } from "./auth-token";

// Erro de sessão ausente/ inválida. Subclasse de DomainError → toHttp mapeia-o
// para 401 na mesma; o M7 apanha-o pelo tipo na route SSE.
export class UnauthenticatedError extends DomainError {
  constructor(message = "Sem sessão") {
    super("UNAUTHENTICATED", message, 401);
    this.name = "UnauthenticatedError";
  }
}

export type Role = "super_admin" | "worker";

// Contexto derivado da sessão. Todas as queries filtram por orgId (isolamento tenant).
export type SessionContext = {
  userId: string;
  orgId: string;
  role: Role;
};

// Extrai o token do cookie `session` ou do header Authorization: Bearer.
function extractToken(req?: Request): string | null {
  if (!req) return null;
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  const cookie = req.headers.get("cookie");
  if (cookie) {
    for (const part of cookie.split(";")) {
      const [k, ...v] = part.trim().split("=");
      if (k === "session") return decodeURIComponent(v.join("="));
    }
  }
  return null;
}

// getSession REAL (implementado pelo M1). Verifica o token stateless e devolve
// o contexto. Lança 401 se ausente/ inválido/ expirado.
export async function getSession(req?: Request): Promise<SessionContext> {
  const token = extractToken(req);
  if (!token) throw new UnauthenticatedError();

  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new DomainError("AUTH_NOT_CONFIGURED", "AUTH_SECRET em falta", 500);

  const p = verifyToken(secret, token, Math.floor(Date.now() / 1000));
  return { userId: p.sub, orgId: p.org, role: p.role };
}
