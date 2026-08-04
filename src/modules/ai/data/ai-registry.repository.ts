import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { aiBindings, aiProviders } from "@/db/schema";
import type { AiBindingView, AiProviderView } from "../domain/types";

/* -------------------------------------------------------------------------- */
/*  Porto de dados do registo de IA.                                           */
/*  Tudo escopado por orgId (isolamento tenant). A chave cifrada ENTRA pelo    */
/*  repo (já cifrada pela service) mas NUNCA SAI: as views só reportam hasKey. */
/* -------------------------------------------------------------------------- */

export type CreateProviderInput = {
  provider: string;
  apiKeyEncrypted: string | null;
  defaultModel: string | null;
  enabled: boolean;
};

// undefined = não mexer no campo; para apiKeyEncrypted, undefined mantém a chave.
export type UpdateProviderInput = {
  apiKeyEncrypted?: string;
  defaultModel?: string | null;
  enabled?: boolean;
};

export type UpsertBindingInput = {
  capability: string;
  provider: string;
  model: string | null;
};

/* -------------------------------------------------------------------------- */
/*  Porto de RESOLUÇÃO (system-context, Fase 2).                               */
/*  Devolve o ciphertext da chave e o alvo do binding — SÓ para o resolver     */
/*  (processo server), que decifra e constrói o adapter. NUNCA é exposto pela  */
/*  admin service nem por HTTP: a chave continua write-only na fronteira.      */
/* -------------------------------------------------------------------------- */

export type ProviderSecret = {
  apiKeyEncrypted: string | null;
  defaultModel: string | null;
  enabled: boolean;
};

export type BindingTarget = {
  provider: string;
  model: string | null;
};

export interface AiResolverPort {
  getBindingByCapability(orgId: string, capability: string): Promise<BindingTarget | null>;
  getProviderSecret(orgId: string, provider: string): Promise<ProviderSecret | null>;
}

export interface AiRegistryRepository {
  listProviders(orgId: string): Promise<AiProviderView[]>;
  getProviderByName(orgId: string, provider: string): Promise<AiProviderView | null>;
  createProvider(orgId: string, input: CreateProviderInput): Promise<AiProviderView>;
  updateProvider(
    id: string,
    orgId: string,
    patch: UpdateProviderInput,
  ): Promise<AiProviderView | null>;
  removeProvider(id: string, orgId: string): Promise<boolean>;

  listBindings(orgId: string): Promise<AiBindingView[]>;
  upsertBinding(orgId: string, input: UpsertBindingInput): Promise<AiBindingView>;
  removeBinding(id: string, orgId: string): Promise<boolean>;
}

function toProviderView(row: typeof aiProviders.$inferSelect): AiProviderView {
  return {
    id: row.id,
    provider: row.provider,
    defaultModel: row.defaultModel,
    enabled: row.enabled,
    hasKey: row.apiKeyEncrypted !== null && row.apiKeyEncrypted !== undefined,
    createdAt: row.createdAt,
  };
}

function toBindingView(row: typeof aiBindings.$inferSelect): AiBindingView {
  return {
    id: row.id,
    capability: row.capability,
    provider: row.provider,
    model: row.model,
    createdAt: row.createdAt,
  };
}

export function createDrizzleAiRegistryRepository(db: Db): AiRegistryRepository {
  return {
    async listProviders(orgId) {
      const rows = await db
        .select()
        .from(aiProviders)
        .where(eq(aiProviders.organizationId, orgId))
        .orderBy(asc(aiProviders.provider));
      return rows.map(toProviderView);
    },

    async getProviderByName(orgId, provider) {
      const [row] = await db
        .select()
        .from(aiProviders)
        .where(
          and(
            eq(aiProviders.organizationId, orgId),
            eq(aiProviders.provider, provider),
          ),
        )
        .limit(1);
      return row ? toProviderView(row) : null;
    },

    async createProvider(orgId, input) {
      const [row] = await db
        .insert(aiProviders)
        .values({
          organizationId: orgId,
          provider: input.provider,
          apiKeyEncrypted: input.apiKeyEncrypted,
          defaultModel: input.defaultModel,
          enabled: input.enabled,
        })
        .returning();
      return toProviderView(row!);
    },

    async updateProvider(id, orgId, patch) {
      const values: Partial<typeof aiProviders.$inferInsert> = {};
      if (patch.apiKeyEncrypted !== undefined) values.apiKeyEncrypted = patch.apiKeyEncrypted;
      if (patch.defaultModel !== undefined) values.defaultModel = patch.defaultModel;
      if (patch.enabled !== undefined) values.enabled = patch.enabled;
      if (Object.keys(values).length === 0) {
        const [row] = await db
          .select()
          .from(aiProviders)
          .where(and(eq(aiProviders.id, id), eq(aiProviders.organizationId, orgId)))
          .limit(1);
        return row ? toProviderView(row) : null;
      }
      const [row] = await db
        .update(aiProviders)
        .set(values)
        .where(and(eq(aiProviders.id, id), eq(aiProviders.organizationId, orgId)))
        .returning();
      return row ? toProviderView(row) : null;
    },

    async removeProvider(id, orgId) {
      const rows = await db
        .delete(aiProviders)
        .where(and(eq(aiProviders.id, id), eq(aiProviders.organizationId, orgId)))
        .returning({ id: aiProviders.id });
      return rows.length > 0;
    },

    async listBindings(orgId) {
      const rows = await db
        .select()
        .from(aiBindings)
        .where(eq(aiBindings.organizationId, orgId))
        .orderBy(asc(aiBindings.capability));
      return rows.map(toBindingView);
    },

    async upsertBinding(orgId, input) {
      // Unicidade (org, capability) garantida por índice → onConflictDoUpdate.
      const [row] = await db
        .insert(aiBindings)
        .values({
          organizationId: orgId,
          capability: input.capability,
          provider: input.provider,
          model: input.model,
        })
        .onConflictDoUpdate({
          target: [aiBindings.organizationId, aiBindings.capability],
          set: { provider: input.provider, model: input.model },
        })
        .returning();
      return toBindingView(row!);
    },

    async removeBinding(id, orgId) {
      const rows = await db
        .delete(aiBindings)
        .where(and(eq(aiBindings.id, id), eq(aiBindings.organizationId, orgId)))
        .returning({ id: aiBindings.id });
      return rows.length > 0;
    },
  };
}

// Porto de resolução (system-context). Lê o ciphertext e o alvo do binding;
// só o resolver (server) o usa. Escopado por orgId como o resto.
export function createDrizzleAiResolverPort(db: Db): AiResolverPort {
  return {
    async getBindingByCapability(orgId, capability) {
      const [row] = await db
        .select({ provider: aiBindings.provider, model: aiBindings.model })
        .from(aiBindings)
        .where(
          and(
            eq(aiBindings.organizationId, orgId),
            eq(aiBindings.capability, capability),
          ),
        )
        .limit(1);
      return row ?? null;
    },

    async getProviderSecret(orgId, provider) {
      const [row] = await db
        .select({
          apiKeyEncrypted: aiProviders.apiKeyEncrypted,
          defaultModel: aiProviders.defaultModel,
          enabled: aiProviders.enabled,
        })
        .from(aiProviders)
        .where(
          and(
            eq(aiProviders.organizationId, orgId),
            eq(aiProviders.provider, provider),
          ),
        )
        .limit(1);
      return row ?? null;
    },
  };
}
