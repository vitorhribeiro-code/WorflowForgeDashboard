import type { AuditEvent, AuditPort } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import type { SessionContext } from "@/lib/session";
import type { Cipher } from "@/modules/connections/service/crypto";
import type { AiRegistryRepository } from "../data/ai-registry.repository";
import type { AiBindingView, AiProviderView } from "../domain/types";
import { requireAdmin } from "./guards";

/* -------------------------------------------------------------------------- */
/*  Registo de IA (§5.2 fase 1b).                                              */
/*                                                                             */
/*  - Só super_admin escreve/lê (requireAdmin em toda a superfície).           */
/*  - A chave de API é cifrada com o MESMO cipher do M6 (ENCRYPTION_KEY) e é    */
/*    WRITE-ONLY: nunca regressa ao exterior. As views só expõem `hasKey`.     */
/*  - Ações sensíveis geram Audit_Log (append-only). A falha de auditoria      */
/*    alerta mas não reverte a ação principal (regra §6).                      */
/* -------------------------------------------------------------------------- */

export type AiRegistryServiceDeps = {
  repo: AiRegistryRepository;
  cipher: Cipher;
  audit: AuditPort;
};

export type CreateProviderInput = {
  provider: string;
  apiKey?: string;
  defaultModel?: string | null;
  enabled?: boolean;
};

export type UpdateProviderInput = {
  apiKey?: string;
  defaultModel?: string | null;
  enabled?: boolean;
};

export type SetBindingInput = {
  capability: string;
  provider: string;
  model?: string | null;
};

export interface AiRegistryService {
  listProviders(session: SessionContext): Promise<AiProviderView[]>;
  createProvider(session: SessionContext, input: CreateProviderInput): Promise<AiProviderView>;
  updateProvider(
    session: SessionContext,
    id: string,
    patch: UpdateProviderInput,
  ): Promise<AiProviderView>;
  removeProvider(session: SessionContext, id: string): Promise<void>;
  listBindings(session: SessionContext): Promise<AiBindingView[]>;
  setBinding(session: SessionContext, input: SetBindingInput): Promise<AiBindingView>;
  removeBinding(session: SessionContext, id: string): Promise<void>;
}

async function safeAudit(audit: AuditPort, ev: AuditEvent): Promise<void> {
  try {
    await audit.record(ev);
  } catch (err) {
    console.error("[audit] falha ao registar", ev.action, err);
  }
}

// Normaliza o identificador do provider (case-insensitive, sem espaços).
function normProvider(p: string): string {
  return p.trim().toLowerCase();
}

export function createAiRegistryService({
  repo,
  cipher,
  audit,
}: AiRegistryServiceDeps): AiRegistryService {
  return {
    async listProviders(session) {
      requireAdmin(session);
      // As views não trazem a chave — só hasKey.
      return repo.listProviders(session.orgId);
    },

    async createProvider(session, input) {
      requireAdmin(session);
      const provider = normProvider(input.provider);
      if (!provider) {
        throw new DomainError("BAD_INPUT", "Provider em falta", 400);
      }
      if (await repo.getProviderByName(session.orgId, provider)) {
        throw new DomainError("AI_PROVIDER_EXISTS", "Provider já registado nesta organização", 409);
      }
      const key = input.apiKey?.trim();
      const apiKeyEncrypted = key ? cipher.encrypt(key) : null;
      const view = await repo.createProvider(session.orgId, {
        provider,
        apiKeyEncrypted,
        defaultModel: input.defaultModel ?? null,
        enabled: input.enabled ?? true,
      });
      await safeAudit(audit, {
        actorId: session.userId,
        action: "ai_provider.set",
        entity: "ai_provider",
        entityId: view.id,
        // Nunca a chave — só se foi definida.
        metadata: { provider, keySet: apiKeyEncrypted !== null, created: true },
      });
      return view;
    },

    async updateProvider(session, id, patch) {
      requireAdmin(session);
      const values: {
        apiKeyEncrypted?: string;
        defaultModel?: string | null;
        enabled?: boolean;
      } = {};
      const key = patch.apiKey?.trim();
      if (key) values.apiKeyEncrypted = cipher.encrypt(key);
      if (patch.defaultModel !== undefined) values.defaultModel = patch.defaultModel;
      if (patch.enabled !== undefined) values.enabled = patch.enabled;

      const view = await repo.updateProvider(id, session.orgId, values);
      if (!view) {
        throw new DomainError("AI_PROVIDER_NOT_FOUND", "Provider inexistente", 404);
      }
      await safeAudit(audit, {
        actorId: session.userId,
        action: "ai_provider.set",
        entity: "ai_provider",
        entityId: view.id,
        metadata: { provider: view.provider, keySet: values.apiKeyEncrypted !== undefined },
      });
      return view;
    },

    async removeProvider(session, id) {
      requireAdmin(session);
      const removed = await repo.removeProvider(id, session.orgId);
      if (!removed) {
        throw new DomainError("AI_PROVIDER_NOT_FOUND", "Provider inexistente", 404);
      }
      await safeAudit(audit, {
        actorId: session.userId,
        action: "ai_provider.removed",
        entity: "ai_provider",
        entityId: id,
      });
    },

    async listBindings(session) {
      requireAdmin(session);
      return repo.listBindings(session.orgId);
    },

    async setBinding(session, input) {
      requireAdmin(session);
      const capability = input.capability.trim();
      const provider = normProvider(input.provider);
      if (!capability || !provider) {
        throw new DomainError("BAD_INPUT", "capability e provider são obrigatórios", 400);
      }
      // Binding órfão (provider ainda não registado) é permitido de propósito:
      // o resolver da Fase 2 faz fallback quando não resolve (ver schema).
      const view = await repo.upsertBinding(session.orgId, {
        capability,
        provider,
        model: input.model ?? null,
      });
      await safeAudit(audit, {
        actorId: session.userId,
        action: "ai_binding.set",
        entity: "ai_binding",
        entityId: view.id,
        metadata: { capability, provider },
      });
      return view;
    },

    async removeBinding(session, id) {
      requireAdmin(session);
      const removed = await repo.removeBinding(id, session.orgId);
      if (!removed) {
        throw new DomainError("AI_BINDING_NOT_FOUND", "Binding inexistente", 404);
      }
      await safeAudit(audit, {
        actorId: session.userId,
        action: "ai_binding.removed",
        entity: "ai_binding",
        entityId: id,
      });
    },
  };
}
