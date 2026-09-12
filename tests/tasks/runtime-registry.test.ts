import { describe, it, expect, vi } from "vitest";
import { createRuntimeRegistry } from "@/modules/tasks/service/runtime-registry";
import type { RuntimeCatalog, RuntimeCatalogEntry } from "@/modules/tasks/service/ports";

const BUILTIN = ["email.digest", "report.monthly", "assistant.writing", "assistant.generic"];

function fakeCatalog(present: string[]): RuntimeCatalog {
  return {
    has: async (key: string) => present.includes(key),
    async list(): Promise<RuntimeCatalogEntry[]> {
      return present.map((key) => ({
        key,
        label: key,
        taskType: "automation",
        kind: "generic",
      }));
    },
  };
}

describe("createRuntimeRegistry (v50)", () => {
  it("reconhece os built-in sem tocar no catálogo (curto-circuito)", async () => {
    const has = vi.fn(async () => false);
    const catalog: RuntimeCatalog = { has, list: async () => [] };
    const isKnown = createRuntimeRegistry(BUILTIN, catalog);

    expect(await isKnown("email.digest")).toBe(true);
    expect(await isKnown("assistant.generic")).toBe(true);
    // Nenhum built-in foi à BD.
    expect(has).not.toHaveBeenCalled();
  });

  it("reconhece um runtime generated presente no catálogo", async () => {
    const isKnown = createRuntimeRegistry(BUILTIN, fakeCatalog(["invoice.extract"]));
    expect(await isKnown("invoice.extract")).toBe(true);
  });

  it("nega um runtime que não é built-in nem está no catálogo", async () => {
    const isKnown = createRuntimeRegistry(BUILTIN, fakeCatalog([]));
    expect(await isKnown("nao.existe")).toBe(false);
  });

  it("delega no catálogo para chaves não-built-in", async () => {
    const has = vi.fn(async (k: string) => k === "custom.one");
    const isKnown = createRuntimeRegistry(BUILTIN, { has, list: async () => [] });
    expect(await isKnown("custom.one")).toBe(true);
    expect(has).toHaveBeenCalledWith("custom.one");
  });

  it("é resiliente: um catálogo que rejeita não deixa de reconhecer built-in", async () => {
    // O adaptador Drizzle já engole erros e devolve false; aqui garantimos que a
    // fábrica não chama o catálogo para built-in, portanto um catálogo partido
    // nunca afeta os 4 de fábrica.
    const catalog: RuntimeCatalog = {
      has: async () => {
        throw new Error("tabela ainda não migrada");
      },
      list: async () => [],
    };
    const isKnown = createRuntimeRegistry(BUILTIN, catalog);
    expect(await isKnown("report.monthly")).toBe(true);
  });
});
