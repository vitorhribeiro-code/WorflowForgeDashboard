/**
 * Acesso a dados do motor. Só este ficheiro conhece SQL/Drizzle; o serviço
 * depende da interface RunsRepository.
 */

import { and, desc, eq } from "drizzle-orm";
import type { RunStatus, RunTrigger, TaskType } from "../domain/run.types";

/* --------------------------------- DTOs ---------------------------------- */

export interface RunRow {
  id: string;
  assignmentId: string;
  status: RunStatus;
  trigger: RunTrigger;
  idempotencyKey: string | null;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  triggeredBy: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

/** Run enriquecido com o nome/runtime da tarefa — para o feed do trabalhador. */
export interface WorkerRunRow extends RunRow {
  taskName: string;
  taskRuntime: string;
}

/** Contexto necessário para executar/validar um Run. */
export interface AssignmentContext {
  assignment: {
    id: string;
    taskId: string;
    workerId: string;
    enabled: boolean;
    config: Record<string, unknown> | null;
  };
  task: {
    id: string;
    orgId: string;
    type: TaskType; // "automation" | "assistant"
    runtime: string;
  };
}

export interface CreateRunInput {
  assignmentId: string;
  trigger: RunTrigger;
  idempotencyKey: string | null;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  triggeredBy: string | null;
}

/* ------------------------------- Interface ------------------------------- */

export interface RunsRepository {
  getRun(runId: string): Promise<RunRow | null>;
  getAssignmentContext(assignmentId: string): Promise<AssignmentContext | null>;
  findByIdempotencyKey(key: string): Promise<RunRow | null>;
  createRun(input: CreateRunInput): Promise<RunRow>;
  markRunning(runId: string, startedAt: Date): Promise<void>;
  markSuccess(
    runId: string,
    output: Record<string, unknown>,
    finishedAt: Date,
  ): Promise<void>;
  markError(
    runId: string,
    error: string,
    output: Record<string, unknown>,
    finishedAt: Date,
  ): Promise<void>;
  listByAssignment(assignmentId: string, limit: number): Promise<RunRow[]>;
  // Feed agregado do trabalhador: últimos Runs de TODAS as suas atribuições,
  // já com o nome/runtime da tarefa (join). Escopado por worker_id.
  listRecentByWorker(workerId: string, limit: number): Promise<WorkerRunRow[]>;
}

/* --------------------------- Implementação Drizzle ----------------------- */

// Ajustar o caminho na integração.
import { runs, taskAssignments, tasks } from "@/db/schema";

function mapRow(row: any): RunRow {
  return {
    id: row.id,
    assignmentId: row.assignmentId,
    status: row.status,
    trigger: row.trigger,
    idempotencyKey: row.idempotencyKey ?? null,
    input: row.input ?? null,
    output: row.output ?? null,
    error: row.error ?? null,
    triggeredBy: row.triggeredBy ?? null,
    startedAt: row.startedAt ?? null,
    finishedAt: row.finishedAt ?? null,
    createdAt: row.createdAt,
  };
}

export function createDrizzleRunsRepository(db: any): RunsRepository {
  return {
    async getRun(runId) {
      const [row] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
      return row ? mapRow(row) : null;
    },

    async getAssignmentContext(assignmentId) {
      const [row] = await db
        .select({ a: taskAssignments, t: tasks })
        .from(taskAssignments)
        .innerJoin(tasks, eq(tasks.id, taskAssignments.taskId))
        .where(eq(taskAssignments.id, assignmentId))
        .limit(1);
      if (!row) return null;
      return {
        assignment: {
          id: row.a.id,
          taskId: row.a.taskId,
          workerId: row.a.workerId,
          enabled: row.a.enabled,
          config: row.a.config ?? null,
        },
        task: {
          id: row.t.id,
          orgId: row.t.organizationId,
          type: row.t.type,
          runtime: row.t.runtime,
        },
      };
    },

    async findByIdempotencyKey(key) {
      const [row] = await db
        .select()
        .from(runs)
        .where(eq(runs.idempotencyKey, key))
        .limit(1);
      return row ? mapRow(row) : null;
    },

    async createRun(input) {
      const [row] = await db.insert(runs).values(input).returning();
      return mapRow(row);
    },

    async markRunning(runId, startedAt) {
      await db
        .update(runs)
        .set({ status: "running", startedAt })
        .where(eq(runs.id, runId));
    },

    async markSuccess(runId, output, finishedAt) {
      await db
        .update(runs)
        .set({ status: "success", output, finishedAt })
        .where(eq(runs.id, runId));
    },

    async markError(runId, error, output, finishedAt) {
      await db
        .update(runs)
        .set({ status: "error", error, output, finishedAt })
        .where(eq(runs.id, runId));
    },

    async listByAssignment(assignmentId, limit) {
      const rows = await db
        .select()
        .from(runs)
        .where(eq(runs.assignmentId, assignmentId))
        .orderBy(desc(runs.createdAt))
        .limit(limit);
      return rows.map(mapRow);
    },

    async listRecentByWorker(workerId, limit) {
      // runs → task_assignments (dono) → tasks (nome/runtime). O filtro por
      // worker_id é o isolamento: um trabalhador só vê os seus próprios Runs.
      const rows = await db
        .select({ r: runs, taskName: tasks.name, taskRuntime: tasks.runtime })
        .from(runs)
        .innerJoin(taskAssignments, eq(taskAssignments.id, runs.assignmentId))
        .innerJoin(tasks, eq(tasks.id, taskAssignments.taskId))
        .where(eq(taskAssignments.workerId, workerId))
        .orderBy(desc(runs.createdAt))
        .limit(limit);
      return rows.map((row: any) => ({
        ...mapRow(row.r),
        taskName: row.taskName,
        taskRuntime: row.taskRuntime,
      }));
    },
  };
}
