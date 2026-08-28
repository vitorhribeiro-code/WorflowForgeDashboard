import { beforeEach, describe, expect, it } from "vitest";
import type { SessionContext } from "@/lib/session";
import type {
  AreaMembershipRepository,
  AreaPair,
  UserAreaPair,
} from "@/modules/assignments/data/area-membership.repository";
import { createAreaMembershipService } from "@/modules/assignments/service/area-membership.service";
import { FakeAudit } from "../fakes/fakes";

/**
 * M5 — Slice 3a: pertença a áreas. task_areas/user_areas por substituição de
 * conjunto, com validação de org (áreas, tarefa, trabalhador) e leitura de
 * disponibilidade para a matriz. Sem DB — repo e lookups fakes.
 */

const admin: SessionContext = { userId: "u-admin", orgId: "o1", role: "super_admin" };
const worker: SessionContext = { userId: "w1", orgId: "o1", role: "worker" };

class FakeMembershipRepo implements AreaMembershipRepository {
  taskMap = new Map<string, Set<string>>();
  userMap = new Map<string, Set<string>>();
  // org de cada task/user, para as leituras por org.
  taskOrg = new Map<string, string>();
  userOrg = new Map<string, string>();

  async getAreaIdsForTask(taskId: string) {
    return [...(this.taskMap.get(taskId) ?? [])];
  }
  async setAreaIdsForTask(taskId: string, areaIds: string[]) {
    this.taskMap.set(taskId, new Set(areaIds));
  }
  async getAreaIdsForUser(userId: string) {
    return [...(this.userMap.get(userId) ?? [])];
  }
  async setAreaIdsForUser(userId: string, areaIds: string[]) {
    this.userMap.set(userId, new Set(areaIds));
  }
  async listTaskAreasByOrg(orgId: string) {
    const out: AreaPair[] = [];
    for (const [taskId, areas] of this.taskMap)
      if (this.taskOrg.get(taskId) === orgId)
        for (const areaId of areas) out.push({ taskId, areaId });
    return out;
  }
  async listUserAreasByOrg(orgId: string) {
    const out: UserAreaPair[] = [];
    for (const [userId, areas] of this.userMap)
      if (this.userOrg.get(userId) === orgId)
        for (const areaId of areas) out.push({ userId, areaId });
    return out;
  }
}

function build() {
  const membership = new FakeMembershipRepo();
  const audit = new FakeAudit();
  // org o1 tem as áreas a1,a2; a task t1 e o worker w1 são de o1; t9/w9 de o2.
  const service = createAreaMembershipService({
    membership,
    areas: { async listIds(orgId) { return orgId === "o1" ? ["a1", "a2"] : ["a9"]; } },
    tasks: { async getOrg(taskId) { return taskId === "t1" ? "o1" : taskId === "t9" ? "o2" : null; } },
    workers: { async getWorkerOrg(id) { return id === "w1" ? "o1" : id === "w9" ? "o2" : null; } },
    audit,
  });
  return { service, membership, audit };
}

describe("areaMembershipService", () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => {
    ctx = build();
  });

  it("worker não pode escrever pertença (FORBIDDEN)", async () => {
    await expect(ctx.service.setTaskAreas(worker, "t1", ["a1"])).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("setTaskAreas grava, audita e é idempotente na substituição", async () => {
    const r1 = await ctx.service.setTaskAreas(admin, "t1", ["a1", "a2", "a1"]);
    expect(new Set(r1)).toEqual(new Set(["a1", "a2"])); // dedup
    expect(await ctx.service.areasForTask(admin, "t1")).toHaveLength(2);
    // substituição (não acumulação): passa a ser só a2.
    await ctx.service.setTaskAreas(admin, "t1", ["a2"]);
    expect(await ctx.service.areasForTask(admin, "t1")).toEqual(["a2"]);
    expect(ctx.audit.actions()).toContain("task.areas_set");
  });

  it("setTaskAreas rejeita área de outra org (AREA_NOT_FOUND)", async () => {
    await expect(ctx.service.setTaskAreas(admin, "t1", ["a1", "a9"])).rejects.toMatchObject({
      code: "AREA_NOT_FOUND",
    });
  });

  it("setTaskAreas rejeita tarefa de outra org (TASK_NOT_FOUND)", async () => {
    await expect(ctx.service.setTaskAreas(admin, "t9", ["a1"])).rejects.toMatchObject({
      code: "TASK_NOT_FOUND",
    });
  });

  it("setWorkerAreas grava e rejeita trabalhador de outra org", async () => {
    await ctx.service.setWorkerAreas(admin, "w1", ["a1"]);
    expect(await ctx.service.areasForWorker(admin, "w1")).toEqual(["a1"]);
    await expect(ctx.service.setWorkerAreas(admin, "w9", ["a1"])).rejects.toMatchObject({
      code: "WORKER_NOT_IN_ORG",
    });
    expect(ctx.audit.actions()).toContain("user.areas_set");
  });

  it("availability devolve os dois lados da interseção, isolado por org", async () => {
    ctx.membership.taskOrg.set("t1", "o1");
    ctx.membership.userOrg.set("w1", "o1");
    await ctx.service.setTaskAreas(admin, "t1", ["a1"]);
    await ctx.service.setWorkerAreas(admin, "w1", ["a1", "a2"]);
    const av = await ctx.service.availability(admin);
    expect(av.taskAreas).toEqual([{ taskId: "t1", areaId: "a1" }]);
    expect(new Set(av.userAreas.map((u) => u.areaId))).toEqual(new Set(["a1", "a2"]));
  });

  it("permitir esvaziar as áreas de uma tarefa (lista vazia)", async () => {
    await ctx.service.setTaskAreas(admin, "t1", ["a1", "a2"]);
    await ctx.service.setTaskAreas(admin, "t1", []);
    expect(await ctx.service.areasForTask(admin, "t1")).toEqual([]);
  });
});
