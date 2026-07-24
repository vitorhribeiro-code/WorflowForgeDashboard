import type { AuditEvent, AuditPort } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import { hashPassword, verifyPassword } from "../domain/password";
import { generateResetToken, hashResetToken, isResetUsable } from "../domain/reset";
import { redirectForRole, type LoginResult } from "../domain/types";
import type {
  CredentialStorePort,
  MailerPort,
  ResetTokenStorePort,
  TokenIssuerPort,
  UserDirectoryPort,
} from "./ports";

export type AuthServiceDeps = {
  users: UserDirectoryPort;
  credentials: CredentialStorePort;
  resets: ResetTokenStorePort;
  tokenIssuer: TokenIssuerPort;
  mailer: MailerPort;
  audit: AuditPort;
  now: () => Date;
  resetTtlMinutes?: number; // validade curta do link (default 30 min)
};

export type AuthService = ReturnType<typeof createAuthService>;

async function safeAudit(audit: AuditPort, ev: AuditEvent): Promise<void> {
  try {
    await audit.record(ev);
  } catch (err) {
    console.error("[audit] falha ao registar", ev.action, err);
  }
}

export function createAuthService(deps: AuthServiceDeps) {
  const { users, credentials, resets, tokenIssuer, mailer, audit, now } = deps;
  const resetTtlMs = (deps.resetTtlMinutes ?? 30) * 60_000;

  return {
    // Login: valida credenciais e emite o token de sessão.
    async login(input: { email: string; password: string }): Promise<LoginResult> {
      const email = input.email.trim().toLowerCase();
      const user = await users.findByEmail(email);

      // Mesma resposta genérica para "não existe" e "password errada".
      const invalid = () => new DomainError("INVALID_CREDENTIALS", "Credenciais inválidas", 401);

      if (!user) throw invalid();
      if (user.suspended) throw new DomainError("ACCOUNT_SUSPENDED", "Conta suspensa", 403);

      const stored = await credentials.getHash(user.id);
      if (!stored || !verifyPassword(input.password, stored)) throw invalid();

      const session = { userId: user.id, orgId: user.orgId, role: user.role };
      const token = tokenIssuer.issue(session);

      await safeAudit(audit, {
        actorId: user.id,
        action: "session.started",
        entity: "user",
        entityId: user.id,
        metadata: { role: user.role, method: "password" },
      });

      return { token, session, redirect: redirectForRole(user.role) };
    },

    // Logout: os tokens são stateless — o cliente larga o cookie (a rota limpa-o).
    // Invalidação server-side real exige denylist (ver notas de integração).
    async logout(_token: string | null): Promise<void> {
      return;
    },

    // Pede reset: resposta SEMPRE genérica (não revela se o email existe).
    async requestPasswordReset(emailRaw: string): Promise<void> {
      const email = emailRaw.trim().toLowerCase();
      const user = await users.findByEmail(email);
      if (user) {
        const token = generateResetToken();
        await resets.save({
          userId: user.id,
          tokenHash: hashResetToken(token),
          expiresAt: new Date(now().getTime() + resetTtlMs),
        });
        await mailer.sendResetLink(email, token);
      }
      // Sem sinal de existência para o exterior.
    },

    // Confirma reset: token válido, não usado e dentro da validade → nova password.
    async resetPassword(token: string, newPassword: string): Promise<void> {
      const rec = await resets.findByHash(hashResetToken(token));
      if (!rec || !isResetUsable(rec, now())) {
        throw new DomainError("INVALID_RESET_TOKEN", "Link inválido ou expirado", 400);
      }
      await credentials.setHash(rec.userId, hashPassword(newPassword));
      await resets.markUsed(rec.id, now());
      await safeAudit(audit, {
        actorId: rec.userId,
        action: "password.reset",
        entity: "user",
        entityId: rec.userId,
      });
    },
  };
}
