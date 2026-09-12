import { describe, it, expect, vi } from "vitest";
import {
  buildMatchPrompt,
  parseMatchResponse,
  createRuntimeMatcher,
  type CatalogRuntime,
  type MatchCandidate,
} from "@/modules/mapping/service/runtime-matcher";
import type { SessionContext } from "@/lib/session";

const admin = { userId: "u1", orgId: "o1", role: "super_admin" } as unknown as SessionContext;
const worker = { userId: "u2", orgId: "o1", role: "worker" } as unknown as SessionContext;

const catalog: CatalogRuntime[] = [
  { key: "email.digest", label: "Resumo de emails", taskType: "automation", kind: "builtin" },
  { key: "assistant.generic", label: "Assistente genérico", taskType: "assistant", kind: "builtin" },
  { key: "custom.resumo", label: "Resumo custom", taskType: "assistant", kind: "generic" },
];

const cands: MatchCandidate[] = [
  { sourceRef: "op-1", name: "Resumir emails", description: "de manhã", type: "automation" },
  { sourceRef: "op-2", name: "Extrair faturas", description: "de PDFs", type: "assistant" },
];

describe("buildMatchPrompt", () => {
  it("inclui as keys do catálogo e os sourceRef dos candidatos", () => {
    const p = buildMatchPrompt(cands, catalog);
    expect(p).toContain("email.digest");
    expect(p).toContain("assistant.generic");
    expect(p).toContain("op-1");
    expect(p).toContain("op-2");
  });
});

describe("parseMatchResponse", () => {
  it("reutiliza um runtime existente do mesmo tipo", () => {
    const text = JSON.stringify([{ sourceRef: "op-1", existingRuntime: "email.digest" }]);
    const p = parseMatchResponse(text, [cands[0]!], catalog)[0]!;
    expect(p).toMatchObject({ kind: "existing", runtimeKey: "email.digest" });
  });

  it("recusa reutilização de tipo errado → none", () => {
    const text = JSON.stringify([{ sourceRef: "op-2", existingRuntime: "email.digest" }]);
    const p = parseMatchResponse(text, [cands[1]!], catalog)[0]!;
    expect(p.kind).toBe("none");
  });

  it("recusa runtime inexistente → none", () => {
    const text = JSON.stringify([{ sourceRef: "op-1", existingRuntime: "nao.existe" }]);
    const p = parseMatchResponse(text, [cands[0]!], catalog)[0]!;
    expect(p.kind).toBe("none");
  });

  it("aceita proposta de runtime novo válida", () => {
    const text = JSON.stringify([
      {
        sourceRef: "op-2",
        newRuntime: { key: "invoice.extract", label: "Extrair faturas", instruction: "Extrai os campos" },
      },
    ]);
    const p = parseMatchResponse(text, [cands[1]!], catalog)[0]!;
    expect(p).toMatchObject({ kind: "new", key: "invoice.extract", taskType: "assistant" });
  });

  it("reuse-first: newRuntime cuja key já existe (mesmo tipo) vira existing", () => {
    const text = JSON.stringify([
      { sourceRef: "op-2", newRuntime: { key: "custom.resumo", label: "x", instruction: "y" } },
    ]);
    const p = parseMatchResponse(text, [cands[1]!], catalog)[0]!;
    expect(p).toMatchObject({ kind: "existing", runtimeKey: "custom.resumo" });
  });

  it("recusa key nova inválida → none", () => {
    const text = JSON.stringify([
      { sourceRef: "op-2", newRuntime: { key: "BAD KEY", label: "x", instruction: "y" } },
    ]);
    const p = parseMatchResponse(text, [cands[1]!], catalog)[0]!;
    expect(p.kind).toBe("none");
  });

  it("candidato sem entrada → none; e aceita JSON com fences", () => {
    const text = "```json\n[{\"sourceRef\":\"op-1\",\"existingRuntime\":\"email.digest\"}]\n```";
    const res = parseMatchResponse(text, cands, catalog);
    expect(res[0]!.kind).toBe("existing");
    expect(res[1]!.kind).toBe("none");
  });
});

describe("createRuntimeMatcher.match", () => {
  const catSource = { list: async () => catalog };

  it("nega não-admin", async () => {
    const m = createRuntimeMatcher({ resolver: null, catalog: catSource });
    await expect(m.match(worker, cands)).rejects.toThrow(/super_admin/i);
  });

  it("sem resolver → tudo none", async () => {
    const m = createRuntimeMatcher({ resolver: null, catalog: catSource });
    const res = await m.match(admin, cands);
    expect(res.every((p) => p.kind === "none")).toBe(true);
  });

  it("com resolver → devolve propostas do parse", async () => {
    const complete = vi.fn(async () => ({
      text: JSON.stringify([
        { sourceRef: "op-1", existingRuntime: "email.digest" },
        { sourceRef: "op-2", newRuntime: { key: "invoice.extract", label: "Faturas", instruction: "extrai" } },
      ]),
    }));
    const resolver = { resolve: async () => ({ complete, provider: "p", model: "m" }) };
    const m = createRuntimeMatcher({ resolver, catalog: catSource });
    const res = await m.match(admin, cands);
    expect(res[0]).toMatchObject({ kind: "existing", runtimeKey: "email.digest" });
    expect(res[1]).toMatchObject({ kind: "new", key: "invoice.extract" });
    expect(complete).toHaveBeenCalledOnce();
  });

  it("candidatos vazios → []", async () => {
    const m = createRuntimeMatcher({ resolver: null, catalog: catSource });
    expect(await m.match(admin, [])).toEqual([]);
  });
});
