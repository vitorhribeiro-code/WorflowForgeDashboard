import type { AuditEvent, AuditPort } from "@/lib/audit";
import type { TaskType } from "@/modules/runs/domain/run.types";
import type {
  AssignmentContext,
  CreateRunInput,
  RunRow,
  RunsRepository,
} from "@/modules/runs/data/runs.repository";
import type {
  ArtifactSink,
  ReadinessChecker,
  ReadinessResult,
  RunQueue,
} from "@/modules/runs/service/ports";

// Contexto de atribuição por defeito, com overrides planos.
export function ctx(
  over: {
    enabled?: boolean;
    type?: TaskType;
    workerId?: string;
    runtime?: string;
    config?: Record<string, unknown> | null;
  } = {},
): AssignmentContext {
  return {
    assignment: {
      id: "asg-1",
      taskId: "task-1",
      workerId: over.workerId ?? "w1",
      enabled: over.enabled ?? true,
      config: over.config ?? null,
    },
    task: {
      id: "task-1",
      orgId: "o1",
      type: over.type ?? "automation",
      runtime: over.runtime ?? "echo",
    },
  };
}

export class FakeRunsRepo implements RunsRepository {
  runs = new Map<string, RunRow>();
  private context: AssignmentContext | null = null;
  private seq = 0;

  seedContext(c: AssignmentContext) {
    this.context = c;
  }
  async getRun(id: string) {
    return this.runs.get(id) ?? null;
  }
  async getAssignmentContext(_assignmentId: string) {
    return this.context;
  }
  async findByIdempotencyKey(key: string) {
    return [...this.runs.values()].find((r) => r.idempotencyKey === key) ?? null;
  }
  async createRun(input: CreateRunInput): Promise<RunRow> {
    const row: RunRow = {
      id: `run-${++this.seq}`,
      assignmentId: input.assignmentId,
      status: "queued",
      trigger: input.trigger,
      idempotencyKey: input.idempotencyKey,
      input: input.input,
      output: input.output,
      error: null,
      triggeredBy: input.triggeredBy,
      startedAt: null,
      finishedAt: null,
      createdAt: new Date("2026-07-22T10:00:00Z"),
    };
    this.runs.set(row.id, row);
    return row;
  }
  async markRunning(id: string, startedAt: Date) {
    const r = this.runs.get(id)!;
    r.status = "running";
    r.startedAt = startedAt;
  }
  async markSuccess(id: string, output: Record<string, unknown>, finishedAt: Date) {
    const r = this.runs.get(id)!;
    r.status = "success";
    r.output = output;
    r.finishedAt = finishedAt;
  }
  async markError(id: string, error: string, output: Record<string, unknown>, finishedAt: Date) {
    const r = this.runs.get(id)!;
    r.status = "error";
    r.error = error;
    r.output = output;
    r.finishedAt = finishedAt;
  }
  async listByAssignment(assignmentId: string, limit: number) {
    return [...this.runs.values()].filter((r) => r.assignmentId === assignmentId).slice(0, limit);
  }
}

export class FakeQueue implements RunQueue {
  enqueued: Array<{ runId: string; delayMs?: number }> = [];
  async enqueue(runId: string, opts?: { delayMs?: number }) {
    this.enqueued.push({ runId, delayMs: opts?.delayMs });
  }
}

export class FakeReadiness implements ReadinessChecker {
  result: ReadinessResult = { ready: true, missing: [] };
  async check() {
    return this.result;
  }
}

export class FakeArtifacts implements ArtifactSink {
  logs: Array<{ runId: string; name: string; body: Record<string, unknown> }> = [];
  async writeLog(x: { runId: string; name: string; body: Record<string, unknown> }) {
    this.logs.push(x);
  }
}

export class FakeAudit implements AuditPort {
  entries: AuditEvent[] = [];
  async record(e: AuditEvent) {
    this.entries.push(e);
  }
  actions() {
    return this.entries.map((e) => e.action);
  }
}
