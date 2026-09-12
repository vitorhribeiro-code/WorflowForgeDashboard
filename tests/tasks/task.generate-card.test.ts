import { describe, expect, it } from "vitest";
import type { SessionContext } from "@/lib/session";
import type { TaskRepository } from "@/modules/tasks/data/task.repository";
import type { Task, TaskPatch } from "@/modules/tasks/domain/types";
import type { CardCompleteFn } from "@/modules/tasks/domain/card-generation";
import type { CardLlmPort } from "@/modules/tasks/service/ports";
import { createTaskService } from "@/modules/tasks/service/task.service";
import { FakeAudit } from "../fakes/fakes";

const admin: SessionContext = { userId: "u-admin", orgId: "o1", role: "super_admin" };
const worker: SessionContext = { userId: "u-w", orgId: "o1", role: "worker" };

function baseTask(): Task {
  return {
    id: "t1",
    organizationId: "o1",
    areaId: null,
    name: "Resumo diário de emails",
    description: "Agrupa os emails por remetente.",
    type: "automation", // → deriveTemplate = size-s
    runtime: "email.digest",
    configSchema: null,
    card: null,
    createdAt: new Date(),
  };
}

// Resposta válida para size-s e size-m (blurb curto + 1 bloco).
const VALID_JSON =
  '{"blurb":"Resumo diário dos emails, por remetente.","blocks":[{"type":"kv","icon":"clock","label":"Cadência","value":"Diária"}]}';

function fakeLlm(
  complete: CardCompleteFn,
  meta: { provider?: string; model?: string } = {},
): CardLlmPort {
  return {
    async resolve() {
      return { complete, provider: meta.provider ?? "mistral", model: meta.model ?? "mistral-small" };
    },
  };
}

const nullLlm: CardLlmPort = { async resolve() { return null; } };

function build(llm?: CardLlmPort | null) {
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
    isKnownRuntime: async () => true,
    publication: {} as never,
    audit,
    llm,
    // Retry rápido e determinístico nos testes.
    genOptions: { maxAttempts: 2, baseDelayMs: 0 },
  });
  return { service, patches, audit };
}

describe("taskService.generateCard", () => {
  it("gera, persiste um cartão draft e audita task.card_generated", async () => {
    let received: { prompt: string; system?: string } | null = null;
    const complete: CardCompleteFn = async (inp) => {
      received = inp;
      return { text: VALID_JSON };
    };
    const { service, patches, audit } = build(fakeLlm(complete, { model: "mistral-small" }));

    const updated = await service.generateCard(admin, "t1");

    // Persistiu um cartão draft com o template derivado (automation → size-s).
    expect(updated.card).toMatchObject({ template: "size-s", status: "draft" });
    expect(patches).toHaveLength(1);
    expect(patches[0]?.card).toMatchObject({ status: "draft", template: "size-s" });

    // Auditoria com template/provider/model/attempts.
    const ev = audit.entries.find((e) => e.action === "task.card_generated");
    expect(ev?.metadata).toMatchObject({
      template: "size-s",
      provider: "mistral",
      model: "mistral-small",
      attempts: 1,
    });

    // O prompt foi construído (contém o nome da tarefa).
    expect(received).not.toBeNull();
    expect(received!.prompt).toContain("Resumo diário de emails");
  });

  it("respeita o template explícito", async () => {
    const complete: CardCompleteFn = async () => ({ text: VALID_JSON });
    const { service, patches } = build(fakeLlm(complete));
    const updated = await service.generateCard(admin, "t1", "size-m");
    expect(updated.card?.template).toBe("size-m");
    expect(patches[0]?.card).toMatchObject({ template: "size-m" });
  });

  it("passa as instruções ao prompt e marca regenerated na auditoria (v44)", async () => {
    let received: { prompt: string } | null = null;
    const complete: CardCompleteFn = async (inp) => {
      received = inp;
      return { text: VALID_JSON };
    };
    const { service, audit } = build(fakeLlm(complete));

    await service.generateCard(admin, "t1", undefined, "realça a cadência");

    expect(received).not.toBeNull();
    expect(received!.prompt).toContain("INSTRUÇÕES ADICIONAIS");
    expect(received!.prompt).toContain("realça a cadência");

    const ev = audit.entries.find((e) => e.action === "task.card_generated");
    expect(ev?.metadata).toMatchObject({ regenerated: true });
  });

  it("sem instruções: audit marca regenerated=false (geração de raiz)", async () => {
    const complete: CardCompleteFn = async () => ({ text: VALID_JSON });
    const { service, audit } = build(fakeLlm(complete));
    await service.generateCard(admin, "t1");
    const ev = audit.entries.find((e) => e.action === "task.card_generated");
    expect(ev?.metadata).toMatchObject({ regenerated: false });
  });

  it("sem dep de IA → 422 CARD_AI_UNAVAILABLE (não grava)", async () => {
    const { service, patches } = build(undefined);
    await expect(service.generateCard(admin, "t1")).rejects.toMatchObject({
      code: "CARD_AI_UNAVAILABLE",
      status: 422,
    });
    expect(patches).toHaveLength(0);
  });

  it("resolver sem binding (null) → 422 CARD_AI_UNAVAILABLE", async () => {
    const { service, patches } = build(nullLlm);
    await expect(service.generateCard(admin, "t1")).rejects.toMatchObject({
      code: "CARD_AI_UNAVAILABLE",
    });
    expect(patches).toHaveLength(0);
  });

  it("modelo devolve lixo → 422 CARD_GENERATION_FAILED (com erros)", async () => {
    const complete: CardCompleteFn = async () => ({ text: '{"blurb":"x","blocks":[{"type":"bogus"}]}' });
    const { service, patches } = build(fakeLlm(complete));
    await expect(service.generateCard(admin, "t1")).rejects.toMatchObject({
      code: "CARD_GENERATION_FAILED",
      status: 422,
    });
    expect(patches).toHaveLength(0);
  });

  it("erro permanente do modelo → 502 CARD_AI_ERROR", async () => {
    const complete: CardCompleteFn = async () => {
      throw Object.assign(new Error("Mistral respondeu 401."), { transient: false });
    };
    const { service, patches } = build(fakeLlm(complete));
    await expect(service.generateCard(admin, "t1")).rejects.toMatchObject({
      code: "CARD_AI_ERROR",
      status: 502,
    });
    expect(patches).toHaveLength(0);
  });

  it("exige admin (worker é recusado)", async () => {
    const complete: CardCompleteFn = async () => ({ text: VALID_JSON });
    const { service } = build(fakeLlm(complete));
    await expect(service.generateCard(worker, "t1")).rejects.toBeTruthy();
  });

  it("404 quando a Task não existe na org", async () => {
    const complete: CardCompleteFn = async () => ({ text: VALID_JSON });
    const { service } = build(fakeLlm(complete));
    await expect(service.generateCard(admin, "nope")).rejects.toMatchObject({
      code: "TASK_NOT_FOUND",
    });
  });
});
