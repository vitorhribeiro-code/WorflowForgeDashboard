import { describe, expect, it } from "vitest";
import type { SessionContext } from "@/lib/session";
import type { TaskRepository } from "@/modules/tasks/data/task.repository";
import type { Task, TaskPatch } from "@/modules/tasks/domain/types";
import type { TaskCard } from "@/modules/tasks/domain/card";
import { createTaskService } from "@/modules/tasks/service/task.service";
import { FakeAudit } from "../fakes/fakes";

const admin: SessionContext = { userId: "u-admin", orgId: "o1", role: "super_admin" };
const worker: SessionContext = { userId: "u-w", orgId: "o1", role: "worker" };

function baseTask(): Task {
  return {
    id: "t1",
    organizationId: "o1",
    areaId: null,
    name: "Digest",
    description: null,
    type: "automation",
    runtime: "email.digest",
    configSchema: null,
    card: null,
    createdAt: new Date(),
  };
}

function build() {
  const task = baseTask();
  const patches: TaskPatch[] = [];
  const repo = {
    async getById(id: string, orgId: string) {
      return id === task.id && orgId === "o1" ? task : null;
    },
    async update(id: string, orgId: string, patch: TaskPatch) {
      if (id !== task.id || orgId !== "o1") return null;
      patches.push(patch);
      return { ...task, ...patch } as Task;
    },
  } as unknown as TaskRepository;

  const audit = new FakeAudit();
  const service = createTaskService({
    repo,
    tools: {} as never,
    schema: {} as never,
    isKnownRuntime: () => true,
    publication: {} as never,
    audit,
  });
  return { service, patches, audit };
}

const goodCard: TaskCard = {
  template: "size-s",
  presentation: {
    blurb: "Chega às 8h",
    blocks: [{ type: "kv", icon: "clock", label: "Cadência", value: "Diária" }],
  },
};

describe("taskService.setCard", () => {
  it("grava um cartão válido e audita com o template", async () => {
    const { service, patches, audit } = build();
    const updated = await service.setCard(admin, "t1", goodCard);
    expect(updated.card).toEqual(goodCard);
    expect(patches).toEqual([{ card: goodCard }]);
    const ev = audit.entries.find((e) => e.action === "task.card_set");
    expect(ev?.metadata).toMatchObject({ cleared: false, template: "size-s" });
  });

  it("aceita null para limpar o cartão (volta ao derivado)", async () => {
    const { service, patches, audit } = build();
    await service.setCard(admin, "t1", null);
    expect(patches).toEqual([{ card: null }]);
    const ev = audit.entries.find((e) => e.action === "task.card_set");
    expect(ev?.metadata).toMatchObject({ cleared: true });
  });

  it("rejeita cartão inválido (INVALID_CARD) sem gravar", async () => {
    const { service, patches } = build();
    const bad = {
      template: "size-l",
      presentation: {
        blurb: "ok",
        // size-l só admite 2 blocos
        blocks: [
          { type: "emphasis", text: "a" },
          { type: "emphasis", text: "b" },
          { type: "emphasis", text: "c" },
        ],
      },
    } as unknown as TaskCard;
    await expect(service.setCard(admin, "t1", bad)).rejects.toMatchObject({
      code: "INVALID_CARD",
    });
    expect(patches).toHaveLength(0);
  });

  it("exige admin (worker é recusado)", async () => {
    const { service } = build();
    await expect(service.setCard(worker, "t1", goodCard)).rejects.toBeTruthy();
  });

  it("404 quando a Task não existe na org", async () => {
    const { service } = build();
    await expect(service.setCard(admin, "outra", goodCard)).rejects.toMatchObject({
      code: "TASK_NOT_FOUND",
    });
  });
});
