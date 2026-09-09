import { describe, expect, it } from "vitest";
import type { SessionContext } from "@/lib/session";
import type { TaskRepository } from "@/modules/tasks/data/task.repository";
import type { Task, TaskPatch } from "@/modules/tasks/domain/types";
import type { TaskCard } from "@/modules/tasks/domain/card";
import { createTaskService } from "@/modules/tasks/service/task.service";
import { FakeAudit } from "../fakes/fakes";

const admin: SessionContext = { userId: "u-admin", orgId: "o1", role: "super_admin" };
const worker: SessionContext = { userId: "u-w", orgId: "o1", role: "worker" };

// Cartão VÁLIDO com conteúdo real (blurb não-vazio) — apto a validar.
function filledCard(status: "draft" | "ready" = "draft"): TaskCard {
  return {
    template: "size-s",
    status,
    presentation: {
      blurb: "Resumo diário dos emails, por remetente.",
      blocks: [{ type: "kv", icon: "clock", label: "Cadência", value: "Diária" }],
    },
  };
}

// Esqueleto-semente VÁLIDO mas SEM conteúdo (blurb vazio) — não deve validar.
const seedCard: TaskCard = {
  template: "size-s",
  status: "draft",
  presentation: { blurb: "", blocks: [] },
};

function build(card: TaskCard | null) {
  const task: Task = {
    id: "t1",
    organizationId: "o1",
    areaId: null,
    name: "Resumo diário de emails",
    description: null,
    type: "automation",
    runtime: "email.digest",
    configSchema: null,
    card,
    createdAt: new Date(),
  };
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

describe("taskService.setCardStatus", () => {
  it("valida draft→ready: persiste ready e audita task.card_validated", async () => {
    const { service, patches, audit } = build(filledCard("draft"));
    const updated = await service.setCardStatus(admin, "t1", "ready");

    expect(updated.card).toMatchObject({ status: "ready", template: "size-s" });
    expect(patches).toHaveLength(1);
    expect((patches[0]?.card as TaskCard).status).toBe("ready");

    const ev = audit.entries.find((e) => e.action === "task.card_validated");
    expect(ev?.metadata).toMatchObject({ template: "size-s" });
  });

  it("devolve ready→draft: persiste draft e audita task.card_unvalidated", async () => {
    const { service, patches, audit } = build(filledCard("ready"));
    const updated = await service.setCardStatus(admin, "t1", "draft");

    expect(updated.card).toMatchObject({ status: "draft" });
    expect(patches).toHaveLength(1);
    expect(audit.entries.some((e) => e.action === "task.card_unvalidated")).toBe(true);
  });

  it("cartão vazio (esqueleto) não valida → 422 CARD_EMPTY (não grava)", async () => {
    const { service, patches } = build(seedCard);
    await expect(service.setCardStatus(admin, "t1", "ready")).rejects.toMatchObject({
      code: "CARD_EMPTY",
      status: 422,
    });
    expect(patches).toHaveLength(0);
  });

  it("sem cartão → 422 CARD_MISSING (não grava)", async () => {
    const { service, patches } = build(null);
    await expect(service.setCardStatus(admin, "t1", "ready")).rejects.toMatchObject({
      code: "CARD_MISSING",
      status: 422,
    });
    expect(patches).toHaveLength(0);
  });

  it("no-op idempotente: ready→ready não grava nem audita", async () => {
    const { service, patches, audit } = build(filledCard("ready"));
    const updated = await service.setCardStatus(admin, "t1", "ready");
    expect(updated.card?.status).toBe("ready");
    expect(patches).toHaveLength(0);
    expect(audit.entries.some((e) => e.action.startsWith("task.card_"))).toBe(false);
  });

  it("exige admin (worker é recusado)", async () => {
    const { service } = build(filledCard("draft"));
    await expect(service.setCardStatus(worker, "t1", "ready")).rejects.toBeTruthy();
  });

  it("404 quando a Task não existe na org", async () => {
    const { service } = build(filledCard("draft"));
    await expect(service.setCardStatus(admin, "nope", "ready")).rejects.toMatchObject({
      code: "TASK_NOT_FOUND",
    });
  });
});
