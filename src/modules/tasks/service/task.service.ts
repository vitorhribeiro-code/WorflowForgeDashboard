import type { AuditEvent, AuditPort } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import type { SessionContext } from "@/lib/session";
import type { TaskRepository } from "../data/task.repository";
import {
  computePublishability,
  missingScopes,
  type Publishability,
} from "../domain/publishability";
import type { NewTask, RequiredTool, Task, TaskPatch } from "../domain/types";
import { requireAdmin } from "./guards";
import type {
  PublicationPort,
  RuntimeRegistry,
  SchemaValidatorPort,
  TaskCatalogPort,
  TaskContext,
  ToolCatalogPort,
} from "./ports";

export type TaskServiceDeps = {
  repo: TaskRepository;
  tools: ToolCatalogPort; // M3
  schema: SchemaValidatorPort; // ajv
  isKnownRuntime: RuntimeRegistry; // M7
  publication: PublicationPort;
  audit: AuditPort;
};

export type TaskService = ReturnType<typeof createTaskService>;

async function safeAudit(audit: AuditPort, ev: AuditEvent): Promise<void> {
  try {
    await audit.record(ev);
  } catch (err) {
    console.error("[audit] falha ao registar", ev.action, err);
  }
}

export function createTaskService(deps: TaskServiceDeps) {
  const { repo, tools, schema, isKnownRuntime, publication, audit } = deps;

  // Carrega a Task garantindo o isolamento por org (senão 404, não vaza).
  async function load(session: SessionContext, taskId: string): Promise<Task> {
    const task = await repo.getById(taskId, session.orgId);
    if (!task) throw new DomainError("TASK_NOT_FOUND", "Task inexistente", 404);
    return task;
  }

  // Valida runtime + config_schema (partilhado por create/update).
  async function validateShape(input: {
    runtime: string;
    configSchema?: Record<string, unknown> | null;
    organizationId: string;
    areaId?: string | null;
  }): Promise<void> {
    if (!isKnownRuntime(input.runtime)) {
      throw new DomainError("UNKNOWN_RUNTIME", "runtime sem handler", 422);
    }
    if (input.configSchema != null) {
      const r = schema.validateSchema(input.configSchema);
      if (!r.valid) {
        throw new DomainError("INVALID_CONFIG_SCHEMA", "config_schema não compila", 422, r.errors);
      }
    }
    if (input.areaId) {
      const ok = await repo.areaExistsInOrg(input.areaId, input.organizationId);
      if (!ok) throw new DomainError("AREA_NOT_FOUND", "Área de outra org ou inexistente", 422);
    }
  }

  return {
    async create(session: SessionContext, input: Omit<NewTask, "organizationId">): Promise<Task> {
      requireAdmin(session);
      await validateShape({ ...input, organizationId: session.orgId });
      const task = await repo.create({ ...input, organizationId: session.orgId });
      await safeAudit(audit, {
        actorId: session.userId,
        action: "task.created",
        entity: "task",
        entityId: task.id,
        metadata: { type: task.type, runtime: task.runtime },
      });
      return task;
    },

    async update(session: SessionContext, taskId: string, patch: TaskPatch): Promise<Task> {
      requireAdmin(session);
      const current = await load(session, taskId);

      await validateShape({
        runtime: patch.runtime ?? current.runtime,
        configSchema: patch.configSchema !== undefined ? patch.configSchema : current.configSchema,
        organizationId: session.orgId,
        areaId: patch.areaId !== undefined ? patch.areaId : current.areaId,
      });

      const updated = await repo.update(taskId, session.orgId, patch);
      if (!updated) throw new DomainError("TASK_NOT_FOUND", "Task inexistente", 404);

      // Versionamento: alterar o schema não invalida em silêncio — sinaliza
      // as Assignments que precisam de revalidação (a migração é do M5).
      if (patch.configSchema !== undefined) {
        const affected = await repo.countAssignments(taskId);
        await safeAudit(audit, {
          actorId: session.userId,
          action: "task.schema_changed",
          entity: "task",
          entityId: taskId,
          metadata: { affectedAssignments: affected },
        });
      }
      return updated;
    },

    async get(session: SessionContext, taskId: string): Promise<Task> {
      requireAdmin(session);
      return load(session, taskId);
    },

    async list(
      session: SessionContext,
      filter: { areaId?: string; type?: NewTask["type"] } = {},
    ): Promise<Task[]> {
      requireAdmin(session);
      return repo.list(session.orgId, filter);
    },

    /* --- required_tools --------------------------------------------------- */
    async listRequiredTools(session: SessionContext, taskId: string): Promise<RequiredTool[]> {
      requireAdmin(session);
      await load(session, taskId);
      return repo.listRequiredTools(taskId);
    },

    // Substitui o conjunto. Valida cada Tool e scopes ⊆ Tool (M3). Sem duplicados.
    async setRequiredTools(
      session: SessionContext,
      taskId: string,
      items: RequiredTool[],
    ): Promise<RequiredTool[]> {
      requireAdmin(session);
      await load(session, taskId);

      const seen = new Set<string>();
      for (const it of items) {
        if (seen.has(it.toolId)) {
          throw new DomainError("DUPLICATE_REQUIRED_TOOL", "Tool repetida", 422, { toolId: it.toolId });
        }
        seen.add(it.toolId);
        await tools.assertScopesAvailable(it.toolId, it.scopes); // lança se inválido
      }

      await repo.setRequiredTools(taskId, items);
      await safeAudit(audit, {
        actorId: session.userId,
        action: "required_tool.set",
        entity: "task",
        entityId: taskId,
        metadata: { toolIds: items.map((i) => i.toolId) },
      });
      return items;
    },

    /* --- publicação ------------------------------------------------------- */
    // Verifica (não persiste) se a Task reúne condições para publicar.
    async publishability(session: SessionContext, taskId: string): Promise<Publishability> {
      requireAdmin(session);
      const task = await load(session, taskId);
      return this.computeFor(task);
    },

    // Interno/reutilizável: calcula publicabilidade resolvendo required_tools.
    async computeFor(task: Task): Promise<Publishability> {
      const configSchemaValid =
        task.configSchema == null || schema.validateSchema(task.configSchema).valid;
      const runtimeKnown = isKnownRuntime(task.runtime);

      const required = await repo.listRequiredTools(task.id);
      let requiredToolsResolved = true;
      for (const rt of required) {
        const available = await tools.getAvailableScopes(rt.toolId);
        if (available === null || missingScopes(available, rt.scopes).length > 0) {
          requiredToolsResolved = false;
          break;
        }
      }
      return computePublishability({ configSchemaValid, runtimeKnown, requiredToolsResolved });
    },

    async publish(session: SessionContext, taskId: string): Promise<Publishability> {
      requireAdmin(session);
      const task = await load(session, taskId);
      const check = await this.computeFor(task);
      if (!check.publishable) {
        throw new DomainError("TASK_NOT_PUBLISHABLE", "Faltam pré-requisitos", 422, check.blockers);
      }
      await publication.setPublished(taskId, true);
      await safeAudit(audit, {
        actorId: session.userId,
        action: "task.published",
        entity: "task",
        entityId: taskId,
      });
      return check;
    },

    // Despublicar não apaga histórico; o M5 reage suspendendo as Assignments.
    async unpublish(session: SessionContext, taskId: string): Promise<void> {
      requireAdmin(session);
      await load(session, taskId);
      await publication.setPublished(taskId, false);
      await safeAudit(audit, {
        actorId: session.userId,
        action: "task.unpublished",
        entity: "task",
        entityId: taskId,
      });
    },
  };
}

// Adaptador do port exposto ao M5 (sem sessão — usado em contexto de sistema).
export function createTaskCatalogPort(
  repo: TaskRepository,
  publication: PublicationPort,
): TaskCatalogPort {
  return {
    async getTaskContext(taskId: string): Promise<TaskContext | null> {
      // Leitura sem org (o M5 valida o tenant do seu lado); só o essencial.
      const task = await repo.findById(taskId);
      if (!task) return null;
      return {
        id: task.id,
        orgId: task.organizationId,
        type: task.type,
        published: await publication.isPublished(taskId),
        configSchema: task.configSchema,
      };
    },
    // O M5 precisa das required_tools para a prontidão; expomos aqui.
    async getRequiredTools(taskId: string) {
      return repo.listRequiredTools(taskId);
    },
  };
}
