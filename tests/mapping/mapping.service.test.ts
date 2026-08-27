import { describe, expect, it } from "vitest";
import type { SessionContext } from "@/lib/session";
import { createMappingService } from "@/modules/mapping/service/mapping.service";
import type { TaskAuthoringPort, ToolResolverPort } from "@/modules/mapping/service/ports";
import type { MappingDocument, TaskCandidate } from "@/modules/mapping/domain/types";
import { classifyCollisions, normalizeTaskName } from "@/modules/mapping/domain/collision";
import { FakeAudit } from "../fakes/fakes";

/**
 * M11 — serviço de mapeamento. Prova a porta de entrada do produto: um
 * documento vira candidatos (parse) e um candidato vira Task no catálogo
 * (convert, delegando no M4 e resolvendo tools no M3). Sem DB: portas fakes.
 */

const admin: SessionContext = { userId: "u-admin", orgId: "o1", role: "super_admin" };

type Existing = { id: string; name: string; runtime: string };

function build(opts?: { keys?: Record<string, string>; existing?: Existing[] }) {
  const created: Array<{ input: Record<string, unknown>; id: string }> = [];
  const requiredSet: Array<{ taskId: string; items: Array<{ toolId: string; scopes: string[] }> }> = [];
  let seq = 0;

  const authoring: TaskAuthoringPort = {
    async create(_session, input) {
      const id = `task-${++seq}`;
      created.push({ input: input as unknown as Record<string, unknown>, id });
      return { id };
    },
    async setRequiredTools(_session, taskId, items) {
      requiredSet.push({ taskId, items });
    },
    async findByRuntime(_session, runtime) {
      return (opts?.existing ?? []).filter((e) => e.runtime === runtime);
    },
  };

  const keys = opts?.keys ?? {};
  const tools: ToolResolverPort = {
    async resolveKey(key) {
      return keys[key] ?? null;
    },
  };

  const service = createMappingService({ authoring, tools, audit: new FakeAudit() });
  return { service, created, requiredSet };
}

const doc: MappingDocument = {
  source: "mapa-trabalhador-tipo",
  opportunities: [
    {
      title: "Resumo de emails",
      description: "Digest diário",
      runtimeHint: "email.digest",
      tools: [{ key: "google", scopes: ["gmail.readonly"] }],
    },
    { title: "Coisa por definir" }, // sem runtimeHint → não convertível
  ],
};

describe("mappingService.parse", () => {
  it("devolve candidatos com completeness e avisa quando falta runtime", () => {
    const { service } = build();
    const { candidates, warnings } = service.parse(admin, doc);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]!.completeness.convertible).toBe(true);
    expect(candidates[1]!.completeness.convertible).toBe(false);
    expect(candidates[1]!.completeness.missing).toContain("runtime");
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe("mappingService.convert", () => {
  const candidate: TaskCandidate = {
    sourceRef: "mapa#0",
    name: "Resumo de emails",
    description: "Digest diário",
    type: "automation",
    runtime: "email.digest",
    requiredTools: [{ toolKey: "google", scopes: ["gmail.readonly"] }],
    configSchema: null,
  };

  it("cria a Task no M4 e liga as required_tools resolvendo as keys", async () => {
    const { service, created, requiredSet } = build({ keys: { google: "tool-google" } });
    const res = await service.convert(admin, { candidate });

    expect(res).toMatchObject({ status: "created", id: "task-1" });
    expect(created[0]!.input).toMatchObject({
      name: "Resumo de emails",
      runtime: "email.digest",
      type: "automation",
    });
    expect(requiredSet[0]!.items).toEqual([{ toolId: "tool-google", scopes: ["gmail.readonly"] }]);
  });

  it("recusa converter um candidato sem runtime (INSUFFICIENT_DATA)", async () => {
    const { service } = build();
    const bad: TaskCandidate = { ...candidate, runtime: null };
    await expect(service.convert(admin, { candidate: bad })).rejects.toMatchObject({
      code: "INSUFFICIENT_DATA",
    });
  });

  it("recusa quando uma tool key não existe no catálogo (TOOL_NOT_FOUND)", async () => {
    const { service } = build({ keys: {} }); // 'google' não resolve
    await expect(service.convert(admin, { candidate })).rejects.toMatchObject({
      code: "TOOL_NOT_FOUND",
    });
  });
});

describe("mappingService.convert — dedup (slice 2)", () => {
  const candidate: TaskCandidate = {
    sourceRef: "mapa#0",
    name: "Resumo diário de emails",
    description: null,
    type: "automation",
    runtime: "email.digest",
    requiredTools: [{ toolKey: "google", scopes: ["gmail.readonly"] }],
    configSchema: null,
  };

  it("sem colisão (runtime diferente no catálogo) cria normalmente", async () => {
    const { service, created } = build({
      keys: { google: "tool-google" },
      existing: [{ id: "t-x", name: "Outra", runtime: "report.monthly" }],
    });
    const res = await service.convert(admin, { candidate });
    expect(res).toMatchObject({ status: "created" });
    expect(created).toHaveLength(1);
  });

  it("colisão PROVÁVEL (mesmo runtime + nome normalizado igual) pede decisão e não cria", async () => {
    const { service, created } = build({
      keys: { google: "tool-google" },
      existing: [{ id: "t-1", name: "Resumo diario de emails", runtime: "email.digest" }],
    });
    const res = await service.convert(admin, { candidate });
    expect(res.status).toBe("needs_decision");
    if (res.status === "needs_decision") {
      expect(res.existing).toEqual([
        { id: "t-1", name: "Resumo diario de emails", runtime: "email.digest", nameMatches: true },
      ]);
    }
    expect(created).toHaveLength(0);
  });

  it("colisão POSSÍVEL (mesmo runtime, nome diferente) pede decisão com nameMatches=false", async () => {
    const { service } = build({
      existing: [{ id: "t-2", name: "Resumo do meu email", runtime: "email.digest" }],
    });
    const res = await service.convert(admin, { candidate });
    expect(res.status).toBe("needs_decision");
    if (res.status === "needs_decision") {
      expect(res.existing[0]!.nameMatches).toBe(false);
    }
  });

  it("decisão 'create' força a criação apesar da colisão", async () => {
    const { service, created } = build({
      keys: { google: "tool-google" },
      existing: [{ id: "t-1", name: "Resumo diario de emails", runtime: "email.digest" }],
    });
    const res = await service.convert(admin, { candidate, decision: { kind: "create" } });
    expect(res).toMatchObject({ status: "created" });
    expect(created).toHaveLength(1);
  });

  it("decisão 'reuse' válida devolve reused e não cria", async () => {
    const { service, created } = build({
      existing: [{ id: "t-1", name: "Resumo diario de emails", runtime: "email.digest" }],
    });
    const res = await service.convert(admin, {
      candidate,
      decision: { kind: "reuse", taskId: "t-1" },
    });
    expect(res).toEqual({ status: "reused", id: "t-1" });
    expect(created).toHaveLength(0);
  });

  it("decisão 'reuse' com taskId que não bate o runtime → REUSE_TARGET_NOT_FOUND", async () => {
    const { service } = build({
      existing: [{ id: "t-1", name: "Resumo diario de emails", runtime: "email.digest" }],
    });
    await expect(
      service.convert(admin, { candidate, decision: { kind: "reuse", taskId: "nao-existe" } }),
    ).rejects.toMatchObject({ code: "REUSE_TARGET_NOT_FOUND" });
  });
});

describe("collision domain (puro)", () => {
  it("normalizeTaskName remove acentos, minúsculas e colapsa espaços", () => {
    expect(normalizeTaskName("  Resumo   DIÁRIO de Emails ")).toBe("resumo diario de emails");
  });

  it("classifyCollisions marca nameMatches por nome normalizado", () => {
    const matches = classifyCollisions("Resumo diário de emails", [
      { id: "a", name: "Resumo Diario de Emails", runtime: "email.digest" },
      { id: "b", name: "Resumo do meu email", runtime: "email.digest" },
    ]);
    expect(matches.map((m) => m.nameMatches)).toEqual([true, false]);
  });
});
