import { describe, it, expect, vi } from "vitest";
import {
  createGenericRuntimeResolver,
  parseGenericSpec,
  buildGenericRuntimePrompt,
  type GenericRuntimeSource,
} from "@/modules/runs/service/handlers/generic-runtime";
import type { ExecContext } from "@/modules/runs/service/handlers/handler";
import type { LlmResolver } from "@/modules/ai/service/resolver";
import type { LlmPort } from "@/platform/ai/port";

const now = () => new Date("2026-09-12T00:00:00.000Z");

function ctx(input: Record<string, unknown>): ExecContext {
  return {
    input,
    config: null,
    orgId: "org-1",
    signal: new AbortController().signal,
    emit: () => {},
  };
}

function sourceWith(
  entry: { taskType: "automation" | "assistant"; kind: "builtin" | "generic"; spec: unknown } | null,
): GenericRuntimeSource {
  return { get: async () => entry };
}

// Adapter LLM fake (só o que o executor usa: complete + provider/model).
function fakeResolver(text: string): { resolver: LlmResolver; complete: ReturnType<typeof vi.fn> } {
  const complete = vi.fn(async () => ({ text }));
  const adapter = { provider: "prov", model: "mod", complete, summarizeBatch: async () => [] } as unknown as LlmPort;
  const resolver: LlmResolver = { resolve: async () => adapter };
  return { resolver, complete };
}

describe("parseGenericSpec", () => {
  it("aceita spec com instruction e trima", () => {
    expect(parseGenericSpec({ instruction: "  Resume o texto  " })).toEqual({ instruction: "Resume o texto" });
  });
  it("lê system opcional", () => {
    expect(parseGenericSpec({ instruction: "X", system: "Sê breve" })).toEqual({
      instruction: "X",
      system: "Sê breve",
    });
  });
  it("rejeita sem instruction, vazio ou não-objeto", () => {
    expect(parseGenericSpec({})).toBeNull();
    expect(parseGenericSpec({ instruction: "   " })).toBeNull();
    expect(parseGenericSpec(null)).toBeNull();
    expect(parseGenericSpec("x")).toBeNull();
  });
});

describe("buildGenericRuntimePrompt", () => {
  it("inclui a instrução", () => {
    const p = buildGenericRuntimePrompt({ instruction: "Faz X" }, {});
    expect(p).toContain("Faz X");
  });
  it("acrescenta o pedido do input e o contexto, sem duplicar o prompt", () => {
    const p = buildGenericRuntimePrompt({ instruction: "Faz X" }, { prompt: "o meu pedido", foo: 1 });
    expect(p).toContain("Faz X");
    expect(p).toContain("o meu pedido");
    expect(p).toContain("\"foo\": 1");
    // o prompt não deve reaparecer dentro do bloco de contexto (JSON)
    expect(p).not.toContain("\"prompt\":");
  });
});

describe("createGenericRuntimeResolver.resolve", () => {
  it("devolve null para runtime inexistente", async () => {
    const r = createGenericRuntimeResolver({ source: sourceWith(null), resolver: null, now });
    expect(await r.resolve("nao.existe")).toBeNull();
  });

  it("devolve null para runtime built-in (só age em generic)", async () => {
    const r = createGenericRuntimeResolver({
      source: sourceWith({ taskType: "automation", kind: "builtin", spec: null }),
      resolver: null,
      now,
    });
    expect(await r.resolve("email.digest")).toBeNull();
  });

  it("sem resolver de IA → handler que corre em scaffold (run verde)", async () => {
    const r = createGenericRuntimeResolver({
      source: sourceWith({ taskType: "automation", kind: "generic", spec: { instruction: "Resume" } }),
      resolver: null,
      now,
    });
    const handler = await r.resolve("resumo.custom");
    expect(handler).not.toBeNull();
    const out = await handler!.execute!(ctx({}));
    expect(out.ai).toMatchObject({ used: false });
    expect(String(out.text)).toContain("IA não está configurada");
    expect(out.runtime).toBe("resumo.custom");
  });

  it("com resolver → chama o modelo com system do spec e prompt com a instrução", async () => {
    const { resolver, complete } = fakeResolver("resultado do modelo");
    const r = createGenericRuntimeResolver({
      source: sourceWith({
        taskType: "assistant",
        kind: "generic",
        spec: { instruction: "Extrai prazos", system: "Sê rigoroso" },
      }),
      resolver,
      now,
    });
    const handler = await r.resolve("extrai.prazos");
    const out = await handler!.execute!(ctx({ prompt: "deste texto" }));

    expect(out.ai).toMatchObject({ used: true, provider: "prov", model: "mod" });
    expect(out.text).toBe("resultado do modelo");
    const call = complete.mock.calls[0]![0] as { system: string; prompt: string };
    expect(call.system).toBe("Sê rigoroso");
    expect(call.prompt).toContain("Extrai prazos");
    expect(call.prompt).toContain("deste texto");
  });

  it("spec inválido → handler que falha permanente", async () => {
    const r = createGenericRuntimeResolver({
      source: sourceWith({ taskType: "automation", kind: "generic", spec: { nope: true } }),
      resolver: null,
      now,
    });
    const handler = await r.resolve("partido");
    await expect(handler!.execute!(ctx({}))).rejects.toThrow(/sem 'instruction'/);
  });

  it("stream emite um evento result", async () => {
    const { resolver } = fakeResolver("via stream");
    const r = createGenericRuntimeResolver({
      source: sourceWith({ taskType: "assistant", kind: "generic", spec: { instruction: "Faz" } }),
      resolver,
      now,
    });
    const handler = await r.resolve("assist.custom");
    const events: string[] = [];
    let result: Record<string, unknown> | undefined;
    for await (const e of handler!.stream!(ctx({ prompt: "olá" }))) {
      events.push(e.type);
      if (e.type === "result") result = e.data;
    }
    expect(events).toContain("result");
    expect(result?.text).toBe("via stream");
  });
});
