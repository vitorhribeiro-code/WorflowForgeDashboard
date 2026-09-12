import { describe, it, expect, vi } from "vitest";
import { isValidRuntimeKey, mergeRuntimeCatalog } from "@/modules/tasks/domain/runtime-catalog";
import { RUNTIMES } from "@/modules/tasks/domain/runtimes";
import { createRuntimeCatalogService } from "@/modules/tasks/service/runtime-catalog.service";
import type {
  RuntimeCatalogRepo,
  RuntimeCatalogRow,
} from "@/modules/tasks/data/runtime-catalog.repository";
import type { SessionContext } from "@/lib/session";

const admin = { userId: "u1", orgId: "o1", role: "super_admin" } as unknown as SessionContext;
const worker = { userId: "u2", orgId: "o1", role: "worker" } as unknown as SessionContext;

function fakeRepo(init: RuntimeCatalogRow[] = []) {
  const rows = [...init];
  const repo: RuntimeCatalogRepo = {
    has: async (k) => rows.some((r) => r.key === k),
    list: async () => rows.map(({ key, label, taskType, kind }) => ({ key, label, taskType, kind })),
    get: async (k) => rows.find((r) => r.key === k) ?? null,
    create: async (input) => {
      const row: RuntimeCatalogRow = {
        key: input.key,
        label: input.label,
        taskType: input.taskType,
        kind: "generic",
        spec: input.spec,
      };
      rows.push(row);
      return row;
    },
  };
  return { repo, rows };
}

describe("isValidRuntimeKey", () => {
  it("aceita keys namespaced em minúsculas", () => {
    expect(isValidRuntimeKey("custom.resumo")).toBe(true);
    expect(isValidRuntimeKey("email.digest")).toBe(true);
    expect(isValidRuntimeKey("custom-resumo")).toBe(true);
  });
  it("rejeita maiúsculas, curtas, espaços e caracteres inválidos", () => {
    expect(isValidRuntimeKey("Custom.Resumo")).toBe(false);
    expect(isValidRuntimeKey("ab")).toBe(false);
    expect(isValidRuntimeKey("a b")).toBe(false);
    expect(isValidRuntimeKey("custom_resumo")).toBe(false);
  });
});

describe("mergeRuntimeCatalog", () => {
  it("garante os built-in mesmo com catálogo vazio", () => {
    const merged = mergeRuntimeCatalog(RUNTIMES, []);
    expect(merged).toHaveLength(RUNTIMES.length);
    expect(merged.every((m) => m.kind === "builtin")).toBe(true);
  });
  it("acrescenta os generated sem duplicar built-in", () => {
    const merged = mergeRuntimeCatalog(RUNTIMES, [
      { key: "email.digest", label: "x", taskType: "automation", kind: "builtin" },
      { key: "custom.resumo", label: "Resumo", taskType: "assistant", kind: "generic" },
    ]);
    expect(merged).toHaveLength(RUNTIMES.length + 1);
    const custom = merged.find((m) => m.key === "custom.resumo");
    expect(custom).toMatchObject({ kind: "generic", taskType: "assistant" });
    // sem duplicar o built-in email.digest
    expect(merged.filter((m) => m.key === "email.digest")).toHaveLength(1);
  });
});

describe("runtimeCatalogService", () => {
  it("list() funde built-in + generated", async () => {
    const { repo } = fakeRepo([
      { key: "custom.x", label: "X", taskType: "assistant", kind: "generic", spec: { instruction: "faz" } },
    ]);
    const svc = createRuntimeCatalogService({ repo, audit: { record: async () => {} } });
    const list = await svc.list();
    expect(list).toHaveLength(RUNTIMES.length + 1);
    expect(list.some((r) => r.key === "custom.x")).toBe(true);
  });

  it("create() cria um generated e regista auditoria", async () => {
    const { repo, rows } = fakeRepo();
    const record = vi.fn(async () => {});
    const svc = createRuntimeCatalogService({ repo, audit: { record } });
    const rt = await svc.create(admin, {
      key: "custom.resumo",
      label: "Resumo",
      taskType: "assistant",
      instruction: "Resume o texto",
      system: "Sê breve",
    });
    expect(rt.kind).toBe("generic");
    expect(rt.spec).toEqual({ instruction: "Resume o texto", system: "Sê breve" });
    expect(rows).toHaveLength(1);
    expect(record).toHaveBeenCalledOnce();
  });

  it("create() sem system omite o campo no spec", async () => {
    const { repo } = fakeRepo();
    const svc = createRuntimeCatalogService({ repo, audit: { record: async () => {} } });
    const rt = await svc.create(admin, {
      key: "custom.y",
      label: "Y",
      taskType: "automation",
      instruction: "faz algo",
    });
    expect(rt.spec).toEqual({ instruction: "faz algo" });
  });

  it("create() nega não-admin", async () => {
    const { repo } = fakeRepo();
    const svc = createRuntimeCatalogService({ repo, audit: { record: async () => {} } });
    await expect(
      svc.create(worker, { key: "custom.z", label: "Z", taskType: "assistant", instruction: "x" }),
    ).rejects.toThrow(/super_admin/i);
  });

  it("create() rejeita key inválida, reservada e repetida", async () => {
    const { repo } = fakeRepo([
      { key: "custom.dup", label: "d", taskType: "assistant", kind: "generic", spec: {} },
    ]);
    const svc = createRuntimeCatalogService({ repo, audit: { record: async () => {} } });

    await expect(
      svc.create(admin, { key: "BAD KEY", label: "l", taskType: "assistant", instruction: "x" }),
    ).rejects.toThrow(/key inválida/i);

    await expect(
      svc.create(admin, { key: "email.digest", label: "l", taskType: "automation", instruction: "x" }),
    ).rejects.toThrow(/built-in/i);

    await expect(
      svc.create(admin, { key: "custom.dup", label: "l", taskType: "assistant", instruction: "x" }),
    ).rejects.toThrow(/já existe/i);
  });

  it("create() exige instrução não-vazia", async () => {
    const { repo } = fakeRepo();
    const svc = createRuntimeCatalogService({ repo, audit: { record: async () => {} } });
    await expect(
      svc.create(admin, { key: "custom.empty", label: "l", taskType: "assistant", instruction: "   " }),
    ).rejects.toThrow(/instrução/i);
  });
});
