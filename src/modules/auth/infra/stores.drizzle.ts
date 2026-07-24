import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { ResetRecord } from "../domain/reset";
import type { CredentialStorePort, ResetTokenStorePort } from "../service/ports";

// -------------------------------------------------------------------------- //
//  O schema atual NÃO tem tabelas de credenciais nem de tokens de reset.       //
//  Isolámos atrás de ports e usamos SQL cru para não tocar em schema.ts.       //
//  MIGRAÇÕES EXIGIDAS:                                                          //
//    CREATE TABLE user_credentials (                                           //
//      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,        //
//      password_hash text NOT NULL,                                            //
//      updated_at timestamptz NOT NULL DEFAULT now());                         //
//    CREATE TABLE password_reset_tokens (                                      //
//      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),                          //
//      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,           //
//      token_hash text NOT NULL,                                               //
//      expires_at timestamptz NOT NULL,                                        //
//      used_at timestamptz,                                                    //
//      created_at timestamptz NOT NULL DEFAULT now());                         //
//    CREATE UNIQUE INDEX password_reset_tokens_hash_uq                         //
//      ON password_reset_tokens (token_hash);                                  //
// -------------------------------------------------------------------------- //
function rowsOf<T>(res: unknown): T[] {
  const r = res as { rows?: T[] };
  return Array.isArray(r?.rows) ? r.rows : ((res as T[]) ?? []);
}

export function createDrizzleCredentialStore(db: Db): CredentialStorePort {
  return {
    async getHash(userId: string): Promise<string | null> {
      const res = await db.execute(
        sql`select password_hash from user_credentials where user_id = ${userId}`,
      );
      return rowsOf<{ password_hash: string }>(res)[0]?.password_hash ?? null;
    },
    async setHash(userId: string, hash: string): Promise<void> {
      await db.execute(sql`
        insert into user_credentials (user_id, password_hash, updated_at)
        values (${userId}, ${hash}, now())
        on conflict (user_id) do update set password_hash = ${hash}, updated_at = now()
      `);
    },
  };
}

export function createDrizzleResetTokenStore(db: Db): ResetTokenStorePort {
  return {
    async save(rec): Promise<void> {
      await db.execute(sql`
        insert into password_reset_tokens (user_id, token_hash, expires_at)
        values (${rec.userId}, ${rec.tokenHash}, ${rec.expiresAt})
      `);
    },
    async findByHash(tokenHash: string): Promise<ResetRecord | null> {
      const res = await db.execute(sql`
        select id, user_id, token_hash, expires_at, used_at
        from password_reset_tokens where token_hash = ${tokenHash} limit 1
      `);
      const row = rowsOf<{
        id: string;
        user_id: string;
        token_hash: string;
        expires_at: string | Date;
        used_at: string | Date | null;
      }>(res)[0];
      if (!row) return null;
      return {
        id: row.id,
        userId: row.user_id,
        tokenHash: row.token_hash,
        expiresAt: new Date(row.expires_at),
        usedAt: row.used_at ? new Date(row.used_at) : null,
      };
    },
    async markUsed(id: string, usedAt: Date): Promise<void> {
      await db.execute(sql`update password_reset_tokens set used_at = ${usedAt} where id = ${id}`);
    },
  };
}
