import { DomainError } from "@/lib/errors";
import type { AuditEvent, AuditPort } from "@/lib/audit";
import type { SessionContext } from "@/lib/session";
import { RUNTIMES, RUNTIME_KEYS } from "../domain/runtimes";
import {
  isValidRuntimeKey,
  mergeRuntimeCatalog,
  type RuntimeCatalogItem,
} from "../domain/runtime-catalog";
import type { RuntimeCatalogRepo, RuntimeCatalogRow } from "../data/runtime-catalog.repository";
import type { TaskType } from "../domain/types";
import { requireAdmin } from "./guards";

export type NewRuntime = {
  key: string;
  label: string;
  taskType: TaskType;
  instruction: string; // vira spec.instruction (obrigatório nos generated)
  system?: string; // spec.system (opcional)
};

export type RuntimeCatalogServiceDeps = {
  repo: RuntimeCatalogRepo;
  audit: AuditPort;
};

export type RuntimeCatalogService = ReturnType<typeof createRuntimeCatalogService>;

async function safeAudit(audit: AuditPort, ev: AuditEvent): Promise<void> {
  try {
    await audit.record(ev);
  } catch (err) {
    console.error("[audit] falha ao registar", ev.action, err);
  }
}

export function createRuntimeCatalogService({ repo, audit }: RuntimeCatalogServiceDeps) {
  return {
    // Lista o catálogo (built-in + generated). Qualquer sessão autenticada:
    // alimenta o dropdown do formulário de tarefa.
    async list(): Promise<RuntimeCatalogItem[]> {
      const catalog = await repo.list();
      return mergeRuntimeCatalog(RUNTIMES, catalog);
    },

    // Cria um runtime GENERATED (admin). key válida, não reservada, única.
    async create(session: SessionContext, input: NewRuntime): Promise<RuntimeCatalogRow> {
      requireAdmin(session);

      const key = input.key.trim().toLowerCase();
      if (!isValidRuntimeKey(key)) {
        throw new DomainError(
          "INVALID_RUNTIME_KEY",
          "key inválida — usa minúsculas namespaced (ex.: custom.resumo)",
          422,
        );
      }
      if (RUNTIME_KEYS.includes(key)) {
        throw new DomainError("RUNTIME_KEY_RESERVED", "Essa key é de um runtime built-in", 409);
      }
      if (await repo.has(key)) {
        throw new DomainError("RUNTIME_KEY_TAKEN", "Já existe um runtime com esta key", 409);
      }

      const label = input.label.trim();
      const instruction = input.instruction.trim();
      if (!instruction) {
        throw new DomainError("MISSING_INSTRUCTION", "Um runtime generated precisa de instrução", 422);
      }
      const system = input.system?.trim();
      const spec: Record<string, unknown> = system ? { instruction, system } : { instruction };

      const row = await repo.create({ key, label, taskType: input.taskType, spec });
      await safeAudit(audit, {
        actorId: session.userId,
        action: "runtime.created",
        entity: "runtime",
        // entityId é uuid na BD; a identidade estável do runtime é a `key` → metadata.
        metadata: { key: row.key, taskType: row.taskType, kind: row.kind },
      });
      return row;
    },
  };
}
