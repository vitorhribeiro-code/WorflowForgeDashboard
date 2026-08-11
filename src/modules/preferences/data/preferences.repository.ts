import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { users } from "@/db/schema";
import { normalizePreferences, type UserPreferences } from "../domain/preferences";

export interface PreferencesRepository {
  get(userId: string): Promise<UserPreferences>;
  save(userId: string, prefs: UserPreferences): Promise<UserPreferences>;
  /** Valida que o utilizador pertence à org (isolamento tenant na leitura admin). */
  workerInOrg(orgId: string, workerId: string): Promise<boolean>;
}

// A coluna users.preferences é jsonb livre (Record<string, unknown>); o domínio
// normaliza-a na leitura e na escrita, por isso a BD nunca guarda tokens inválidos.
export function createDrizzlePreferencesRepository(db: Db): PreferencesRepository {
  return {
    async get(userId) {
      const [row] = await db
        .select({ p: users.preferences })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return normalizePreferences(row?.p);
    },

    async save(userId, prefs) {
      const [row] = await db
        .update(users)
        .set({ preferences: prefs })
        .where(eq(users.id, userId))
        .returning({ p: users.preferences });
      return normalizePreferences(row?.p);
    },

    async workerInOrg(orgId, workerId) {
      const [row] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, workerId), eq(users.organizationId, orgId)))
        .limit(1);
      return !!row;
    },
  };
}
