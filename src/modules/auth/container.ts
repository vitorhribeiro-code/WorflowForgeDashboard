// Composition root do M1 — único sítio que lê env e instancia deps reais.
import { db } from "@/db/client";
import { createDrizzleAudit } from "@/lib/audit.drizzle";
import { DomainError } from "@/lib/errors";
import { createAuthService } from "./service/auth.service";
import { createDrizzleUserDirectory } from "./infra/user-directory.drizzle";
import {
  createDrizzleCredentialStore,
  createDrizzleResetTokenStore,
} from "./infra/stores.drizzle";
import { createConsoleMailer, createTokenIssuer } from "./infra/token-issuer";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new DomainError("AUTH_NOT_CONFIGURED", `${name} em falta`, 500);
  return v;
}

export const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS ?? 60 * 60 * 8); // 8h
// Link de convite/onboarding entregue à mão → validade longa (default 7 dias).
const INVITE_TTL_MINUTES = Number(process.env.INVITE_TTL_MINUTES ?? 7 * 24 * 60);
const AUTH_SECRET = requireEnv("AUTH_SECRET");
const BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:3000";
const now = () => new Date();

// URL público da página de definição de password (convite e reset partilham-na).
export function buildSetPasswordUrl(token: string): string {
  return `${BASE_URL}/definir-password?token=${encodeURIComponent(token)}`;
}

export const authService = createAuthService({
  users: createDrizzleUserDirectory(db),
  credentials: createDrizzleCredentialStore(db),
  resets: createDrizzleResetTokenStore(db),
  tokenIssuer: createTokenIssuer(AUTH_SECRET, now, SESSION_TTL_SECONDS),
  mailer: createConsoleMailer(BASE_URL),
  audit: createDrizzleAudit(db),
  now,
  inviteTtlMinutes: INVITE_TTL_MINUTES,
});
