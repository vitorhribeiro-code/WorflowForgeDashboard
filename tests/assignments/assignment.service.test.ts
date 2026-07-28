import { describe, it, expect } from "vitest";
import { createAssignmentService } from "@/modules/assignments/service/assignment.service";
import type { AssignmentRepository, EnablePatch } from "@/modules/assignments/data/assignment.repository";
import type {
  ReadinessPort,
  SchemaValidatorPort,
  TaskDepsPort,
  TaskSummary,
  WorkerDirectoryPort,
} from "@/modules/assignments/service/ports";
import type { NewAssignment, TaskAssignment } from "@/modules/assignments/domain/types";
import type { SessionContext } from "@/lib/session";
import { FakeAudit } from "../fakes/fakes";

/* --- Fakes --------------------------------------------------------------- */

let seq = 0;
function mkAssignment(input: NewAssignment): TaskAssignment {
  return {
    id: `as${++seq}`,
    taskId: input.taskId,
    workerId: input.workerId,
    enabled: false,
    schedule: input.schedule ?? null,
    delivery: input.delivery ?? null,
    config: input.config ?? null,
    enabledBy: null,
    enabledAt: null,
    createdAt: new Date("2026-07-26T00:00:00Z"),
  };
}

class FakeRepo implements AssignmentRepository {
  rows: TaskAssignment[] = [];
  async create(input: NewAssignment) {
    const a = mkAssignment(input);
    this.rows.push(a);
    return a;
  }
  async findByTaskWorker(taskId: string, workerId: string) {
    return this.rows.find((a) => a.taskId === taskId && a.workerId === workerId) ?? null;
  }
  async getByIdInOrg(id: string) {
    return this.rows.find((a) => a.id === id) ?? null;
  }
  async getById(id: string) {
    return this.rows.find((a) => a.id === id) ?? null;
  }
  async listByOrg() {
    return [...this.rows];
  }
  async listByWorker(workerId: string) {
    return this.rows.filter((a) => a.workerId === workerId);
  }
  async listScheduledActive() {
    return this.rows
      .filter((a) => a.enabled && a.schedule)
      .map((a) => ({ assignmentId: a.id, schedule: a.schedule as string }));
  }
  async setEnabled(id: string, patch: EnablePatch) {
    const a = this.rows.find((x) => x.id === id);
    if (!a) return null;
    a.enabled = patch.enabled;
    a.enabledBy = patch.enabledBy;
    a.enabledAt = patch.enabledAt;
    return a;
  }
  async updateConfig(id: string, config: Record<string, unknown> | null) {
    const a = this.rows.find((x) => x.id === id);
    if (a) a.config = config;
    return a ?? null;
  }
  async updateSchedule(id: string, schedule: string | null) {
    const a = this.rows.find((x) => x.id === id);
    if (a) a.schedule = schedule;
    return a ?? null;
  }
  async suspendForTask() {
    return 0;
  }
  async disableIfEnabled() {
    return false;
  }
}

const TASKS: TaskSummary[] = [
  { id: "t1", name: "Resumo diário", type: "automation", published: true, configSchema: null },
  { id: "t2", name: "Rascunho", type: "assistant", published: false, configSchema: null },
];
const REQUIRED: Record<string, { toolId: string; scopes: string[] }[]> = {
  t1: [{ toolId: "tool-google", scopes: ["gmail.read"] }],
  t2: [],
};

const fakeTaskDeps: TaskDepsPort = {
  async getTaskContext(taskId) {
    const t = TASKS.find((x) => x.id === taskId);
    return t
      ? { id: t.id, orgId: "o1", type: t.type, published: t.published, configSchema: t.configSchema }
      : null;
  },
  async getRequiredTools(taskId) {
    return REQUIRED[taskId] ?? [];
  },
  async listTasks() {
    return TASKS;
  },
};

const fakeWorkers: WorkerDirectoryPort = {
  async getWorkerOrg() {
    return "o1";
  },
  async listWorkers() {
    return [{ id: "w1", email: "ana@org.pt" }];
  },
};

// Sempre válido (não testamos ajv aqui).
const fakeSchema: SchemaValidatorPort = {
  validateData: () => ({ valid: true, errors: [] }),
};

// Prontidão controlável por teste.
function readinessFor(ready: boolean): ReadinessPort {
  return {
    async check(_workerId, required) {
      if (required.length === 0 || ready) return { ready: true, missing: [] };
      return {
        ready: false,
        missing: required.map((r) => ({ toolId: r.toolId, reason: "no_connection" as const })),
      };
    },
  };
}

const ADMIN: SessionContext = { userId: "a1", orgId: "o1", role: "super_admin" };
const WORKER: SessionContext = { userId: "w1", orgId: "o1", role: "worker" };

function setup(ready: boolean) {
  const repo = new FakeRepo();
  const audit = new FakeAudit();
  const service = createAssignmentService({
    repo,
    taskDeps: fakeTaskDeps,
    readiness: readinessFor(ready),
    schema: fakeSchema,
    workers: fakeWorkers,
    audit,
    now: () => new Date("2026-07-26T00:00:00Z"),
  });
  return { repo, audit, service };
}

/* --- Testes -------------------------------------------------------------- */

describe("matrix", () => {
  it("devolve tarefas × workers com uma célula por par e prontidão", async () => {
    const { service } = setup(true);
    const m = await service.matrix(ADMIN);
    expect(m.tasks).toHaveLength(2);
    expect(m.workers).toHaveLength(1);
    expect(m.cells).toHaveLength(2); // 2 tasks × 1 worker
    const t1cell = m.cells.find((c) => c.taskId === "t1")!;
    expect(t1cell.assignmentId).toBeNull(); // ainda não atribuída
    expect(t1cell.schedule).toBeNull(); // sem atribuição → sem agenda
    expect(t1cell.readiness.eligible).toBe(true); // publicada + conexões OK
  });

  it("marca não-elegível a task despublicada mesmo com conexões OK", async () => {
    const { service } = setup(true);
    const m = await service.matrix(ADMIN);
    const t2cell = m.cells.find((c) => c.taskId === "t2")!;
    expect(t2cell.readiness.published).toBe(false);
    expect(t2cell.readiness.eligible).toBe(false);
  });

  it("recusa a não-admin", async () => {
    const { service } = setup(true);
    await expect(service.matrix(WORKER)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("enable", () => {
  it("bloqueia quando faltam conexões e devolve o que falta", async () => {
    const { service, repo } = setup(false); // conexões em falta
    const a = await service.create(ADMIN, { taskId: "t1", workerId: "w1" });
    await expect(service.enable(ADMIN, a.id)).rejects.toMatchObject({
      code: "ASSIGNMENT_NOT_READY",
      status: 409,
    });
    // Continua desativada.
    expect(repo.rows.find((x) => x.id === a.id)?.enabled).toBe(false);
  });

  it("ativa quando publicada + conexões suficientes", async () => {
    const { service, audit } = setup(true);
    const a = await service.create(ADMIN, { taskId: "t1", workerId: "w1" });
    const updated = await service.enable(ADMIN, a.id);
    expect(updated.enabled).toBe(true);
    expect(updated.enabledBy).toBe("a1");
    expect(audit.actions()).toContain("assignment.enabled");
  });

  it("desativar repõe enabled=false", async () => {
    const { service } = setup(true);
    const a = await service.create(ADMIN, { taskId: "t1", workerId: "w1" });
    await service.enable(ADMIN, a.id);
    const off = await service.disable(ADMIN, a.id);
    expect(off.enabled).toBe(false);
  });
});

describe("listForWorker", () => {
  it("devolve as atribuições do próprio worker com nome/tipo e prontidão", async () => {
    const { service } = setup(true);
    await service.create(ADMIN, { taskId: "t1", workerId: "w1" });
    const mine = await service.listForWorker(WORKER);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      taskId: "t1",
      taskName: "Resumo diário",
      taskType: "automation",
      enabled: false,
      ready: true,
    });
  });

  it("marca ready=false e lista o que falta quando não há conexões", async () => {
    const { service } = setup(false); // conexões em falta para t1
    await service.create(ADMIN, { taskId: "t1", workerId: "w1" });
    const mine = await service.listForWorker(WORKER);
    expect(mine[0]!.ready).toBe(false);
    expect(mine[0]!.missing.length).toBeGreaterThan(0);
  });

  it("não expõe atribuições de outro trabalhador (isolamento)", async () => {
    const { service } = setup(true);
    await service.create(ADMIN, { taskId: "t1", workerId: "w1" });
    const other: SessionContext = { userId: "w2", orgId: "o1", role: "worker" };
    expect(await service.listForWorker(other)).toHaveLength(0);
  });
});
