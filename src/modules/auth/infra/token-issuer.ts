import { signToken } from "@/lib/auth-token";
import type { SessionContext } from "@/lib/session";
import type { MailerPort, TokenIssuerPort } from "../service/ports";

// Emite o token stateless com o segredo da app e um TTL.
export function createTokenIssuer(
  secret: string,
  now: () => Date,
  ttlSeconds: number,
): TokenIssuerPort {
  return {
    issue(session: SessionContext): string {
      const iat = Math.floor(now().getTime() / 1000);
      return signToken(secret, {
        sub: session.userId,
        org: session.orgId,
        role: session.role,
        exp: iat + ttlSeconds,
      });
    },
  };
}

// Mailer de desenvolvimento — imprime o link. Trocar por provider real.
export function createConsoleMailer(baseUrl: string): MailerPort {
  return {
    async sendResetLink(email: string, token: string): Promise<void> {
      const link = `${baseUrl}/reset?token=${encodeURIComponent(token)}`;
      console.info(`[mailer] reset para ${email}: ${link}`);
    },
  };
}
