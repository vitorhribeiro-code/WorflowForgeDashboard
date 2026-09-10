import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecContext } from "@/modules/runs/service/handlers/handler";
import { createAssistantGenericHandler } from "@/modules/runs/service/handlers/builtin";
import { PermanentError } from "@/modules/runs/service/exec-errors";
import type { LlmCompleteInput, LlmPort } from "@/platform/ai/port";
import type { LlmResolver } from "@/modules/ai/service/resolver";

/**
 * v46 — o assistant.generic resolve o adapter da org e chama `complete` DENTRO
 * do handler (gémeo do assistant.writing, sem modos/tons). Sem rede: um resolver
 * e um LlmPort fake. Prova: a chamada ao modelo com o prompt, o payload como
 * contexto, o fallback a scaffold sem IA, a validação de input, a propagação de
 * erro, e o stream/cancelamento.
 */

const FIXED = new Date("2026-09-10T00:00:00.000Z");
const now = () => FIXED;

// Adapter fake que regista o último input de complete() para inspeção.
function fakeAdapter(over?: Partial<LlmPort>): {
  adapter: LlmPort;
  calls: LlmCompleteInput[];
} {
  const calls: LlmCompleteInput[] = [];
  const adapter: LlmPort = {
    provider: "claude",
    model: "claude-haiku-4-5-20251001",
    complete: async (input) => {
      calls.push(input);
      return { text: "RESPOSTA GERADA" };
    },
    summarizeBatch: async () => [],
    ...over,
  };
  return { adapter, calls };
}

function resolverOf(adapter: LlmPort | null): LlmResolver {
  return { resolve: async () => adapter };
}

function ctx(input: Record<string, unknown>, orgId = "o1"): ExecContext {
  return {
    input,
    config: null,
    orgId,
    signal: new AbortController().signal,
    emit: () => {},
  };
}

describe("assistant.generic", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("chama complete e devolve o texto com ai.used", async () => {
    const { adapter, calls } = fakeAdapter();
    const h = createAssistantGenericHandler({ resolver: resolverOf(adapter), now });
    const out = (await h.execute!(ctx({ prompt: "resume estas notas" }))) as Record<string, any>;

    expect(out.text).toBe("RESPOSTA GERADA");
    expect(out.ai).toEqual({
      used: true,
      provider: "claude",
      model: "claude-haiku-4-5-20251001",
    });
    expect(out.generatedAt).toBe(FIXED.toISOString());
    expect(calls[0]!.prompt).toContain("resume estas notas");
    expect(calls[0]!.system).toContain("assistente genérico");
  });

  it("payload entra no prompt como contexto", async () => {
    const { adapter, calls } = fakeAdapter();
    const h = createAssistantGenericHandler({ resolver: resolverOf(adapter), now });
    await h.execute!(ctx({ prompt: "classifica", payload: { ticket: 42 } }));
    expect(calls[0]!.prompt).toContain("Contexto (dados):");
    expect(calls[0]!.prompt).toContain("\"ticket\": 42");
  });

  it("sem provider (resolver devolve null) → scaffold verde, ai.used=false", async () => {
    const h = createAssistantGenericHandler({ resolver: resolverOf(null), now });
    const out = (await h.execute!(ctx({ prompt: "x" }))) as Record<string, any>;
    expect(out.ai).toEqual({ used: false, reason: "no-provider" });
    expect(out.text).toContain("não está configurada");
  });

  it("sem resolver (plataforma sem ENCRYPTION_KEY) → scaffold com reason no-resolver", async () => {
    const h = createAssistantGenericHandler({ resolver: null, now });
    const out = (await h.execute!(ctx({ prompt: "x" }))) as Record<string, any>;
    expect(out.ai).toEqual({ used: false, reason: "no-resolver" });
  });

  it("prompt vazio → PermanentError", async () => {
    const { adapter } = fakeAdapter();
    const h = createAssistantGenericHandler({ resolver: resolverOf(adapter), now });
    await expect(h.execute!(ctx({ prompt: "   " }))).rejects.toBeInstanceOf(PermanentError);
  });

  it("erro do modelo propaga-se (não mascara com scaffold)", async () => {
    const { adapter } = fakeAdapter({
      complete: async () => {
        throw Object.assign(new Error("Claude respondeu 401."), { status: 401 });
      },
    });
    const h = createAssistantGenericHandler({ resolver: resolverOf(adapter), now });
    await expect(h.execute!(ctx({ prompt: "x" }))).rejects.toThrow("401");
  });

  it("stream emite um result com o texto", async () => {
    const { adapter } = fakeAdapter();
    const h = createAssistantGenericHandler({ resolver: resolverOf(adapter), now });
    const seen: any[] = [];
    for await (const e of h.stream!(ctx({ prompt: "x" }))) seen.push(e);
    const result = seen.find((e) => e.type === "result");
    expect(result?.data.text).toBe("RESPOSTA GERADA");
  });

  it("stream cancelado emite error e termina sem chamar o modelo", async () => {
    const { adapter, calls } = fakeAdapter();
    const controller = new AbortController();
    controller.abort();
    const c: ExecContext = {
      input: { prompt: "x" },
      config: null,
      orgId: "o1",
      signal: controller.signal,
      emit: () => {},
    };
    const h = createAssistantGenericHandler({ resolver: resolverOf(adapter), now });
    const seen: any[] = [];
    for await (const e of h.stream!(c)) seen.push(e);
    expect(seen.some((e) => e.type === "error")).toBe(true);
    expect(seen.some((e) => e.type === "result")).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
