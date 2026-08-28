import { beforeEach, describe, expect, it } from "vitest";
import { DomainError } from "@/lib/errors";
import type { SessionContext } from "@/lib/session";
import type { AreaAssignmentRepository } from "@/modules/assignments/data/area-assignment.repository";
import {
  createAreaAssignmentService,
  type AssignmentOpsPort,
  type AssignmentQueryPort,
  type MembershipReadPort,
} from "@/modules/assignments/service/area-assignment.service";
import { FakeAudit } from "../fakes/fakes";

/**
 * M5 — Slice 3a.2: atribuição por área (Modelo P). setAreaAssignment espalha a
 * intenção aos trabalhadores da área; reconcile («Atualizar») re-espalha as
 * ON atuais e limpa órfãs por disponibilidade. Só super_admin. Fakes in-memory.
 */

const admin: SessionContext = { userId: "a1", orgId: "o1", role: "super_admin" };
const worker: SessionContext = { userId: "w1", orgId: "o1", role: "worker" };

// --- Fakes -------------------------------------------------------------------

class FakeAreaRepo implements AreaAssignmentRepository {
  rows = new Map<string, boolean>(); // `${area}|${task}` -> enabled
  private k(a: string, t: string) {
    return `${a}|${t}`;
  }
  async upsert(
    areaId: string,
    taskId: string,
    patch: { enabled: boolean; enabledBy: string | null; enabledAt: Date | null },
  ) {
    this.rows.set(this.k(areaId, taskId), patch.enabled);
  }
  async get(areaId: string, taskId: string) {
    const e = this.rows.get(this.k(areaId, taskId));
    return e === undefined ? null : { enabled: e };
  }
  async remove(areaId: string, taskId: string) {
    return this.rows.delete(this.k(areaId, taskId));
  }
  async listEnabledTaskIds(areaId: string) {
    const out: string[] = [];
    for (const [k, en] of this.rows) {
      const [a, t] = k.split("|");
      if (a === areaId && en) out.push(t!);
    }
    return out;
  }
  async listByArea(areaId: string) {
    const out: { taskId: string; enabled: boolean }[] = [];
    for (const [k, en] of this.rows) {
      const [a, t] = k.split("|");
      if (a === areaId) out.push({ taskId: t!, enabled: en });
    }
    return out;
  }
}

type Assign = { id: string; taskId: string; workerId: string; enabled: boolean };

// Fake do M5: create/enable/disable com prontidão controlável, e o query.
function makeAssignments(opts: { ready: (taskId: string) => boolean; needsConfig?: Set<string> }) {
  const rows: Assign[] = [];
  let seq = 0;
  const ops: AssignmentOpsPort = {
    async create(_s, input) {
      if (opts.needsConfig?.has(input.taskId)) {
        throw new DomainError("CONFIG_INVALID", "config obrigatória", 422);
      }
      if (rows.find((r) => r.taskId === input.taskId && r.workerId === input.workerId)) {
        throw new DomainError("ASSIGNMENT_EXISTS", "existe", 409);
      }
      const a: Assign = { id: `as-${++seq}`, taskId: input.taskId, workerId: input.workerId, enabled: false };
      rows.push(a);
      return { id: a.id };
    },
    async enable(_s, id) {
      const a = rows.find((r) => r.id === id);
      if (!a) throw new DomainError("ASSIGNMENT_NOT_FOUND", "n/a", 404);
      if (!opts.ready(a.taskId)) {
        throw new DomainError("ASSIGNMENT_NOT_READY", "faltam conexões", 409);
      }
      a.enabled = true;
    },
    async disable(_s, id) {
      const a = rows.find((r) => r.id === id);
      if (a) a.enabled = false;
    },
  };
  const query: AssignmentQueryPort = {
    async findByTaskWorker(taskId, workerId) {
      const a = rows.find((r) => r.taskId === taskId && r.workerId === workerId);
      return a ? { id: a.id, enabled: a.enabled } : null;
    },
    async listByWorker(workerId) {
      return rows.filter((r) => r.workerId === workerId).map((r) => ({ id: r.id, taskId: r.taskId, enabled: r.enabled }));
    },
    async remove(id) {
      const i = rows.findIndex((r) => r.id === id);
      if (i < 0) return false;
      rows.splice(i, 1);
      return true;
    },
  };
  return { rows, ops, query };
}

// Membership fake: mapas area→tasks, area→users, e os inversos por entidade.
function makeMembership(cfg: {
  taskAreas: Record<string, string[]>; // task -> areas
  userAreas: Record<string, string[]>; // user -> areas
}): MembershipReadPort {
  return {
    async getAreaIdsForTask(taskId) {
      return cfg.taskAreas[taskId] ?? [];
    },
    async getAreaIdsForUser(userId) {
      return cfg.userAreas[userId] ?? [];
    },
    async listUserIdsByArea(areaId) {
      return Object.entries(cfg.userAreas).filter(([, as]) => as.includes(areaId)).map(([u]) => u);
    },
    async listTaskIdsByArea(areaId) {
      return Object.entries(cfg.taskAreas).filter(([, as]) => as.includes(areaId)).map(([t]) => t);
    },
  };
}

function build(cfg: {
  taskAreas: Record<string, string[]>;
  userAreas: Record<string, string[]>;
  ready?: (taskId: string) => boolean;
  needsConfig?: Set<string>;
}) {
  const areaRepo = new FakeAreaRepo();
  const membership = makeMembership(cfg);
  const asg = makeAssignments({ ready: cfg.ready ?? (() => true), needsConfig: cfg.needsConfig });
  const audit = new FakeAudit();
  const service = createAreaAssignmentService({
    areaRepo,
    membership,
    ops: asg.ops,
    query: asg.query,
    areas: { async listIds(orgId) { return orgId === "o1" ? ["a1", "a2"] : ["a9"]; } },
    tasks: { async getOrg(taskId) { return taskId.startsWith("o2") ? "o2" : "o1"; } },
    audit,
    now: () => new Date(),
  });
  return { service, areaRepo, rows: asg.rows, audit };
}

describe("areaAssignmentService — fan-out", () => {
  it("worker não pode (FORBIDDEN)", async () => {
    const { service } = build({ taskAreas: { t1: ["a1"] }, userAreas: { w1: ["a1"] } });
    await expect(service.setAreaAssignment(worker, "a1", "t1", true)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("ON espalha e ativa aos trabalhadores da área (prontos)", async () => {
    const { service, rows, areaRepo } = build({
      taskAreas: { t1: ["a1"] },
      userAreas: { w1: ["a1"], w2: ["a1"], w3: ["a2"] }, // w3 fora da área
    });
    const s = await service.setAreaAssignment(admin, "a1", "t1", true);
    expect(s).toMatchObject({ workers: 2, applied: 2, pending: 0, failed: 0 });
    expect(await areaRepo.get("a1", "t1")).toEqual({ enabled: true });
    // criou para w1 e w2, ativas; nada para w3.
    expect(rows.filter((r) => r.enabled).map((r) => r.workerId).sort()).toEqual(["w1", "w2"]);
    expect(rows.find((r) => r.workerId === "w3")).toBeUndefined();
  });

  it("ON sem prontidão fica pendente (criada, desativada)", async () => {
    const { service, rows } = build({
      taskAreas: { t1: ["a1"] },
      userAreas: { w1: ["a1"] },
      ready: () => false,
    });
    const s = await service.setAreaAssignment(admin, "a1", "t1", true);
    expect(s).toMatchObject({ applied: 0, pending: 1, failed: 0 });
    expect(rows[0]).toMatchObject({ workerId: "w1", enabled: false }); // existe mas off
  });

  it("ON de tarefa não disponível na área → TASK_NOT_IN_AREA", async () => {
    const { service } = build({ taskAreas: { t1: ["a2"] }, userAreas: { w1: ["a1"] } });
    await expect(service.setAreaAssignment(admin, "a1", "t1", true)).rejects.toMatchObject({
      code: "TASK_NOT_IN_AREA",
    });
  });

  it("OFF desativa mas mantém as linhas (cartão fica visível)", async () => {
    const { service, rows } = build({ taskAreas: { t1: ["a1"] }, userAreas: { w1: ["a1"] } });
    await service.setAreaAssignment(admin, "a1", "t1", true);
    await service.setAreaAssignment(admin, "a1", "t1", false);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.enabled).toBe(false);
  });

  it("Remover apaga a intenção da área e desativa (não apaga linhas)", async () => {
    const { service, rows, areaRepo } = build({ taskAreas: { t1: ["a1"] }, userAreas: { w1: ["a1"] } });
    await service.setAreaAssignment(admin, "a1", "t1", true);
    await service.removeAreaAssignment(admin, "a1", "t1");
    expect(await areaRepo.get("a1", "t1")).toBeNull(); // intenção apagada
    expect(rows).toHaveLength(1); // linha do trabalhador mantida
    expect(rows[0]!.enabled).toBe(false); // desativada
  });
});

describe("areaAssignmentService — reconcile (Atualizar)", () => {
  it("espalha tarefa nova da área aos trabalhadores existentes", async () => {
    const { service, rows, areaRepo } = build({
      taskAreas: { t1: ["a1"], t2: ["a1"] },
      userAreas: { w1: ["a1"] },
    });
    // t1 já ON e espalhada; t2 passa a ON depois (intenção), sem espalhar ainda.
    await service.setAreaAssignment(admin, "a1", "t1", true);
    await areaRepo.upsert("a1", "t2", { enabled: true, enabledBy: "a1", enabledAt: new Date() });
    const s = await service.reconcileArea(admin, "a1");
    expect(s).toMatchObject({ created: 1, enabled: 1, removed: 0 });
    expect(rows.filter((r) => r.enabled).map((r) => r.taskId).sort()).toEqual(["t1", "t2"]);
  });

  it("trabalhador reassociado herda as tarefas-ON atuais da área", async () => {
    const cfg = { taskAreas: { t1: ["a1"] }, userAreas: { w1: ["a1"] } as Record<string, string[]> };
    const { service, rows } = build(cfg);
    await service.setAreaAssignment(admin, "a1", "t1", true); // só w1 tem
    // w2 entra na área a1 agora.
    cfg.userAreas.w2 = ["a1"];
    const s = await service.reconcileArea(admin, "a1");
    expect(rows.find((r) => r.workerId === "w2" && r.taskId === "t1" && r.enabled)).toBeTruthy();
    expect(s.enabled).toBeGreaterThanOrEqual(1);
  });

  it("tarefa retirada da área é limpa (órfã por disponibilidade)", async () => {
    const cfg = {
      taskAreas: { t1: ["a1"] } as Record<string, string[]>,
      userAreas: { w1: ["a1"] },
    };
    const { service, rows } = build(cfg);
    await service.setAreaAssignment(admin, "a1", "t1", true);
    expect(rows).toHaveLength(1);
    // t1 deixa de estar disponível na a1 (removida de task_areas); intenção também sai.
    cfg.taskAreas.t1 = [];
    const s = await service.reconcileArea(admin, "a1");
    expect(s.removed).toBe(1);
    expect(rows).toHaveLength(0); // órfã apagada
  });

  it("preserva atribuição direta de tarefa ainda disponível", async () => {
    const cfg = { taskAreas: { t1: ["a1"], t2: ["a1"] }, userAreas: { w1: ["a1"] } };
    const { service, rows, areaRepo } = build(cfg);
    // t1 ON pela área; t2 é "direta" (existe mas a área não a intenciona).
    await service.setAreaAssignment(admin, "a1", "t1", true);
    rows.push({ id: "direct-1", taskId: "t2", workerId: "w1", enabled: true });
    void areaRepo;
    const s = await service.reconcileArea(admin, "a1");
    // t2 continua disponível (está em task_areas de a1) → NÃO é órfã, mantém-se.
    expect(rows.find((r) => r.id === "direct-1" && r.enabled)).toBeTruthy();
    expect(s.removed).toBe(0);
  });
});
