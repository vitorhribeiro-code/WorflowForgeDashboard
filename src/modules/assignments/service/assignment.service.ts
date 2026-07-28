import type { AuditEvent, AuditPort } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import type { SessionContext } from "@/lib/session";
import type { AssignmentRepository } from "../data/assignment.repository";
import { isValidCron } from "../domain/cron";
import { blockingReasons, evaluateEligibility } from "../domain/eligibility";
import type {
  AssignmentReadiness,
  NewAssignment,
  TaskAssignment,
} from "../domain/types";
import { requireAdmin } from "./guards";
import type {
  AssignmentForRun,
  AssignmentMatrix,
  AssignmentReadPort,
  AssignmentSuspenderPort,
  MatrixCell,
  ReadinessPort,
  SchemaValidatorPort,
  TaskContext,
  TaskDepsPort,
  WorkerAssignmentView,
  WorkerDirectoryPort,
} from "./ports";

export type AssignmentServiceDeps = {
  repo: AssignmentRepository;
  taskDeps: TaskDepsPort; // M4
  readiness: ReadinessPort; // M6
  schema: SchemaValidatorPort; // ajv
  workers: WorkerDirectoryPort; // M2
  audit: AuditPort;
  now: () => Date;
};

export type AssignmentService = ReturnType<typeof createAssignmentService>;

async function safeAudit(audit: AuditPort, ev: AuditEvent): Promise<void> {
  try {
    await audit.record(ev);
  } catch (err) {
    console.error("[audit] falha ao registar", ev.action, err);
  }
}

// config válida sse não há schema OU se valida contra o schema vigente.
function isConfigValid(
  schema: SchemaValidatorPort,
  configSchema: Record<string, unknown> | null,
  config: Record<string, unknown> | null,
): boolean {
  if (configSchema == null) return true;
  return schema.validateData(configSchema, config ?? {}).valid;
}

export function createAssignmentService(deps: AssignmentServiceDeps) {
  const { repo, taskDeps, readiness, schema, workers, audit, now } = deps;

  async function loadTaskInOrg(taskId: string, orgId: string): Promise<TaskContext> {
    const ctx = await taskDeps.getTaskContext(taskId);
    if (!ctx || ctx.orgId !== orgId) {
      throw new DomainError("TASK_NOT_FOUND", "Task inexistente nesta org", 404);
    }
    return ctx;
  }

  async function load(session: SessionContext, id: string): Promise<TaskAssignment> {
    const a = await repo.getByIdInOrg(id, session.orgId);
    if (!a) throw new DomainError("ASSIGNMENT_NOT_FOUND", "Atribuição inexistente", 404);
    return a;
  }

  async function computeReadiness(a: TaskAssignment): Promise<AssignmentReadiness> {
    const ctx = await taskDeps.getTaskContext(a.taskId);
    const required = await taskDeps.getRequiredTools(a.taskId);
    const connections = await readiness.check(a.workerId, required);
    return evaluateEligibility({
      published: ctx?.published ?? false,
      configValid: isConfigValid(schema, ctx?.configSchema ?? null, a.config),
      connections,
    });
  }

  return {
    // Atribuir Task a um worker (nasce enabled=false).
    async create(session: SessionContext, input: NewAssignment): Promise<TaskAssignment> {
      requireAdmin(session);
      const ctx = await loadTaskInOrg(input.taskId, session.orgId);

      const workerOrg = await workers.getWorkerOrg(input.workerId);
      if (workerOrg !== session.orgId) {
        throw new DomainError("WORKER_NOT_IN_ORG", "Trabalhador de outra org", 422);
      }
      if (!isConfigValid(schema, ctx.configSchema, input.config ?? null)) {
        throw new DomainError("CONFIG_INVALID", "config fora do config_schema", 422);
      }
      if (await repo.findByTaskWorker(input.taskId, input.workerId)) {
        throw new DomainError("ASSIGNMENT_EXISTS", "Par (task, worker) já existe", 409);
      }
      if (input.schedule != null) {
        if (ctx.type !== "automation") {
          throw new DomainError("SCHEDULE_NOT_ALLOWED", "Assistida não aceita schedule", 422);
        }
        if (!isValidCron(input.schedule)) {
          throw new DomainError("INVALID_CRON", "cron inválido", 422);
        }
      }

      const created = await repo.create(input);
      await safeAudit(audit, {
        actorId: session.userId,
        action: "assignment.created",
        entity: "task_assignment",
        entityId: created.id,
        metadata: { taskId: input.taskId, workerId: input.workerId },
      });
      return created;
    },

    async get(session: SessionContext, id: string): Promise<TaskAssignment> {
      requireAdmin(session);
      return load(session, id);
    },

    async listByOrg(session: SessionContext): Promise<TaskAssignment[]> {
      requireAdmin(session);
      return repo.listByOrg(session.orgId);
    },

    // Matriz Task × Trabalhador para a consola: tarefas (linhas), workers
    // (colunas) e, por célula, a atribuição (se existir) + a prontidão. A
    // prontidão calcula-se mesmo em células sem atribuição, para o admin ver o
    // semáforo antes de tentar ativar.
    async matrix(session: SessionContext): Promise<AssignmentMatrix> {
      requireAdmin(session);
      const [tasks, workerList, assignments] = await Promise.all([
        taskDeps.listTasks(session.orgId),
        workers.listWorkers(session.orgId),
        repo.listByOrg(session.orgId),
      ]);
      const byPair = new Map(assignments.map((a) => [`${a.taskId}:${a.workerId}`, a]));

      const cells: MatrixCell[] = [];
      for (const t of tasks) {
        // required_tools uma vez por task (não por célula).
        const required = await taskDeps.getRequiredTools(t.id);
        for (const w of workerList) {
          const a = byPair.get(`${t.id}:${w.id}`) ?? null;
          const connections = await readiness.check(w.id, required);
          const r = evaluateEligibility({
            published: t.published,
            configValid: isConfigValid(schema, t.configSchema, a?.config ?? null),
            connections,
          });
          cells.push({
            taskId: t.id,
            workerId: w.id,
            assignmentId: a?.id ?? null,
            enabled: a?.enabled ?? false,
            readiness: r,
          });
        }
      }

      return {
        tasks: tasks.map((t) => ({
          id: t.id,
          name: t.name,
          type: t.type,
          published: t.published,
        })),
        workers: workerList,
        cells,
      };
    },

    // Atribuições do PRÓPRIO trabalhador (painel "As minhas tarefas").
    // Worker-facing: NÃO requireAdmin. Devolve só as do session.userId e
    // restringe às Tasks da org da sessão (isolamento tenant), reaproveitando
    // a mesma avaliação de prontidão da matriz do admin.
    async listForWorker(session: SessionContext): Promise<WorkerAssignmentView[]> {
      const [assignments, orgTasks] = await Promise.all([
        repo.listByWorker(session.userId),
        taskDeps.listTasks(session.orgId),
      ]);
      const taskById = new Map(orgTasks.map((t) => [t.id, t]));

      const views: WorkerAssignmentView[] = [];
      for (const a of assignments) {
        const t = taskById.get(a.taskId);
        if (!t) continue; // atribuição fora da org da sessão → não a expõe
        const required = await taskDeps.getRequiredTools(a.taskId);
        const connections = await readiness.check(a.workerId, required);
        const r = evaluateEligibility({
          published: t.published,
          configValid: isConfigValid(schema, t.configSchema, a.config),
          connections,
        });
        views.push({
          assignmentId: a.id,
          taskId: t.id,
          taskName: t.name,
          taskType: t.type,
          enabled: a.enabled,
          schedule: a.schedule,
          ready: r.eligible,
          missing: r.connections.missing,
        });
      }
      return views;
    },

    // Prontidão (verde/âmbar/vermelho da matriz), sem alterar estado.
    async readiness(session: SessionContext, id: string): Promise<AssignmentReadiness> {
      requireAdmin(session);
      const a = await load(session, id);
      return computeReadiness(a);
    },

    // Ativar: só se publicada + config válida + conexões suficientes.
    async enable(session: SessionContext, id: string): Promise<TaskAssignment> {
      requireAdmin(session);
      const a = await load(session, id);
      const r = await computeReadiness(a);
      if (!r.eligible) {
        throw new DomainError("ASSIGNMENT_NOT_READY", "Faltam pré-condições", 409, {
          blockers: blockingReasons(r),
          missingConnections: r.connections.missing,
        });
      }
      const updated = await repo.setEnabled(id, {
        enabled: true,
        enabledBy: session.userId,
        enabledAt: now(),
      });
      await safeAudit(audit, {
        actorId: session.userId,
        action: "assignment.enabled",
        entity: "task_assignment",
        entityId: id,
      });
      return updated!;
    },

    async disable(session: SessionContext, id: string): Promise<TaskAssignment> {
      requireAdmin(session);
      await load(session, id);
      const updated = await repo.setEnabled(id, { enabled: false, enabledBy: null, enabledAt: null });
      await safeAudit(audit, {
        actorId: session.userId,
        action: "assignment.disabled",
        entity: "task_assignment",
        entityId: id,
      });
      return updated!;
    },

    // Editar config: revalida contra o schema vigente. Não afeta Runs em curso.
    async editConfig(
      session: SessionContext,
      id: string,
      config: Record<string, unknown> | null,
    ): Promise<TaskAssignment> {
      requireAdmin(session);
      const a = await load(session, id);
      const ctx = await taskDeps.getTaskContext(a.taskId);
      if (!isConfigValid(schema, ctx?.configSchema ?? null, config)) {
        throw new DomainError("CONFIG_INVALID", "config fora do config_schema", 422);
      }
      const updated = await repo.updateConfig(id, config);
      await safeAudit(audit, {
        actorId: session.userId,
        action: "assignment.config_updated",
        entity: "task_assignment",
        entityId: id,
      });
      return updated!;
    },

    // Definir schedule: só type=automation; cron válido. null limpa.
    async setSchedule(
      session: SessionContext,
      id: string,
      cron: string | null,
    ): Promise<TaskAssignment> {
      requireAdmin(session);
      const a = await load(session, id);
      const ctx = await taskDeps.getTaskContext(a.taskId);
      if (ctx?.type !== "automation") {
        throw new DomainError("SCHEDULE_NOT_ALLOWED", "Assistida não aceita schedule", 422);
      }
      if (cron != null && !isValidCron(cron)) {
        throw new DomainError("INVALID_CRON", "cron inválido", 422);
      }
      const updated = await repo.updateSchedule(id, cron);
      await safeAudit(audit, {
        actorId: session.userId,
        action: "assignment.schedule_set",
        entity: "task_assignment",
        entityId: id,
        metadata: { cron },
      });
      return updated!;
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Ports expostos (contexto de sistema, sem sessão)                          */
/* -------------------------------------------------------------------------- */

// M4 (despublicar) e M6 (revogar/expirar) propagam a suspensão para aqui.
export function createAssignmentSuspender(
  repo: AssignmentRepository,
  taskDeps: TaskDepsPort,
  audit: AuditPort,
): AssignmentSuspenderPort {
  return {
    async suspendForTask(taskId: string): Promise<number> {
      const n = await repo.suspendForTask(taskId);
      if (n > 0) {
        await safeAudit(audit, {
          actorId: null,
          action: "assignment.suspended",
          entity: "task",
          entityId: taskId,
          metadata: { reason: "task_unpublished", count: n },
        });
      }
      return n;
    },

    // Suspende as atribuições ativas do worker cujas Tasks exigem esta Tool.
    async suspendForWorkerTool(workerId: string, toolId: string): Promise<number> {
      const enabled = (await repo.listByWorker(workerId)).filter((a) => a.enabled);
      let count = 0;
      for (const a of enabled) {
        const required = await taskDeps.getRequiredTools(a.taskId);
        if (!required.some((r) => r.toolId === toolId)) continue;
        if (await repo.disableIfEnabled(a.id)) {
          count++;
          await safeAudit(audit, {
            actorId: null,
            action: "assignment.suspended",
            entity: "task_assignment",
            entityId: a.id,
            metadata: { reason: "connection_revoked", toolId },
          });
        }
      }
      return count;
    },
  };
}

// M7: leitura mínima para validar antes de criar um Run.
export function createAssignmentReadPort(repo: AssignmentRepository): AssignmentReadPort {
  return {
    async getAssignmentForRun(assignmentId: string): Promise<AssignmentForRun | null> {
      const a = await repo.getById(assignmentId);
      if (!a) return null;
      return {
        id: a.id,
        taskId: a.taskId,
        workerId: a.workerId,
        enabled: a.enabled,
        schedule: a.schedule,
        config: a.config,
      };
    },
  };
}
