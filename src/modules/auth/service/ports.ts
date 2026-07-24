import type { SessionContext } from "@/lib/session";
import type { AuthUser } from "../domain/types";
import type { ResetRecord } from "../domain/reset";

// M2/users: procura de utilizadores (adaptador Drizzle sobre `users` incluído).
export interface UserDirectoryPort {
  findByEmail(email: string): Promise<AuthUser | null>;
  findById(id: string): Promise<AuthUser | null>;
}

// Credenciais (migração: tabela user_credentials). Isolado — a tabela não existe
// no schema atual, tal como o publication do M4.
export interface CredentialStorePort {
  getHash(userId: string): Promise<string | null>;
  setHash(userId: string, hash: string): Promise<void>;
}

// Tokens de reset (migração: tabela password_reset_tokens).
export interface ResetTokenStorePort {
  save(rec: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  findByHash(tokenHash: string): Promise<ResetRecord | null>;
  markUsed(id: string, usedAt: Date): Promise<void>;
}

// Emissão do token de sessão (embrulha lib/auth-token com o segredo/TTL).
export interface TokenIssuerPort {
  issue(session: SessionContext): string;
}

// Envio de email (dev: consola; prod: provider real).
export interface MailerPort {
  sendResetLink(email: string, token: string): Promise<void>;
}
