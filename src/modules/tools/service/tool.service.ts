import { DomainError } from "@/lib/errors";
import type { AuditEvent, AuditPort } from "@/lib/audit";
import type { SessionContext } from "@/lib/session";
import type { ToolRepository } from "../data/tool.repository";
import { checkScopes, normalizeScopes } from "../domain/scopes";
import { isValidToolKey } from "../domain/tool";
import type { NewTool, Tool, ToolPatch } from "../domain/types";
import { requireAdmin } from "./guards";
import type { ToolCatalogPort } from "./ports";

export type ToolServiceDeps = {
  repo: ToolRepository;
  audit: AuditPort;
};

export type ToolService = ReturnType<typeof createToolService>;

// Auditoria não bloqueia a ação principal (spec §6): falha só alerta.
async function safeAudit(audit: AuditPort, ev: AuditEvent): Promise<void> {
  try {
    await audit.record(ev);
  } catch (err) {
    console.error("[audit] falha ao registar", ev.action, err);
  }
}

export function createToolService({ repo, audit }: ToolServiceDeps) {
  return {
    // Criar Tool (admin). key único e válido; scopes normalizados.
    async create(session: SessionContext, input: NewTool): Promise<Tool> {
      requireAdmin(session);
      const key = input.key.trim();
      if (!isValidToolKey(key)) {
        throw new DomainError("INVALID_TOOL_KEY", "key inválida (slug)", 422);
      }
      if (await repo.getByKey(key)) {
        throw new DomainError("TOOL_KEY_TAKEN", "Já existe uma Tool com esta key", 409);
      }
      const tool = await repo.create({
        key,
        name: input.name.trim(),
        authType: input.authType,
        availableScopes: normalizeScopes(input.availableScopes),
      });
      await safeAudit(audit, {
        actorId: session.userId,
        action: "tool.created",
        entity: "tool",
        entityId: tool.id,
        metadata: { key: tool.key, authType: tool.authType },
      });
      return tool;
    },

    // Editar Tool (admin). Só name e availableScopes; key/authType imutáveis.
    async update(session: SessionContext, id: string, patch: ToolPatch): Promise<Tool> {
      requireAdmin(session);
      const current = await repo.getById(id);
      if (!current) throw new DomainError("TOOL_NOT_FOUND", "Tool inexistente", 404);

      const next: ToolPatch = {};
      if (patch.name !== undefined) next.name = patch.name.trim();
      if (patch.availableScopes !== undefined) {
        next.availableScopes = normalizeScopes(patch.availableScopes);
      }

      const updated = await repo.update(id, next);
      if (!updated) throw new DomainError("TOOL_NOT_FOUND", "Tool inexistente", 404);

      await safeAudit(audit, {
        actorId: session.userId,
        action: "tool.updated",
        entity: "tool",
        entityId: id,
        metadata: { fields: Object.keys(next) },
      });
      return updated;
    },

    // Ler o catálogo (qualquer sessão autenticada; workers precisam para ligar).
    async list(_session: SessionContext): Promise<Tool[]> {
      return repo.list();
    },

    async get(_session: SessionContext, id: string): Promise<Tool> {
      const tool = await repo.getById(id);
      if (!tool) throw new DomainError("TOOL_NOT_FOUND", "Tool inexistente", 404);
      return tool;
    },

    // Resolve a key da Tool → id (Tool é global ⇒ sem sessão). Usado pelo M11
    // para ligar as required_tools de um candidato ao catálogo (M3).
    async resolveKey(key: string): Promise<string | null> {
      const tool = await repo.getByKey(key);
      return tool?.id ?? null;
    },
  };
}

// Adaptador do port cross-module (sem sessão) — exportado pelo container p/ M4/M6.
export function createToolCatalogPort(repo: ToolRepository): ToolCatalogPort {
  return {
    async getAvailableScopes(toolId: string): Promise<string[] | null> {
      const tool = await repo.getById(toolId);
      return tool ? tool.availableScopes : null;
    },
    async assertScopesAvailable(toolId: string, requested: string[]): Promise<void> {
      const tool = await repo.getById(toolId);
      if (!tool) throw new DomainError("TOOL_NOT_FOUND", "Tool inexistente", 404);
      const check = checkScopes(tool.availableScopes, requested);
      if (!check.ok) {
        throw new DomainError(
          "SCOPES_NOT_DECLARED",
          "Scopes não declarados nesta Tool",
          422,
          { missing: check.missing },
        );
      }
    },
  };
}
