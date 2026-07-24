// Token de sessão stateless, assinado por HMAC-SHA256. Sem tabela de sessões
// (mesmo princípio do state CSRF do M6). Formato: base64url(payload).assinatura.
import { createHmac, timingSafeEqual } from "node:crypto";
import { DomainError } from "./errors";
import type { Role } from "./session";

export type TokenPayload = {
  sub: string; // userId
  org: string; // orgId
  role: Role;
  exp: number; // epoch seconds
  jti?: string; // id do token (para denylist opcional)
};

function sign(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function signToken(secret: string, payload: TokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(secret, body)}`;
}

export function verifyToken(secret: string, token: string, nowSeconds: number): TokenPayload {
  const [body, sig] = token.split(".");
  if (!body || !sig) throw new DomainError("INVALID_TOKEN", "Token malformado", 401);

  const expected = sign(secret, body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new DomainError("INVALID_TOKEN", "Assinatura inválida", 401);
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw new DomainError("INVALID_TOKEN", "Payload inválido", 401);
  }
  if (typeof payload.exp !== "number" || payload.exp < nowSeconds) {
    throw new DomainError("TOKEN_EXPIRED", "Sessão expirada", 401);
  }
  return payload;
}
