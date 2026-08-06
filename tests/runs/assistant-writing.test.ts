import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecContext } from "@/modules/runs/service/handlers/handler";
import { createAssistantWritingHandler } from "@/modules/runs/service/handlers/builtin";
import { PermanentError } from "@/modules/runs/service/exec-errors";
import type { LlmCompleteInput, LlmPort } from "@/platform/ai/port";
import type { LlmResolver } from "@/modules/ai/service/resolver";

/**
 * §5.4 (opção a) — o assistant.writing resolve o adapter da org e chama
 * `complete` DENTRO do handler. Sem rede: um resolver e um LlmPort fake.
 * Prova: os dois modos, a construção do system por tom (incl. "meu" com estilo),
 * o fallback a scaffold sem IA, a validação de input, e a propagação de erro.
 */

const FIXED = new Date("2026-08-06T00:00:00.000Z");
const now = () => FIXED;

// Adapter fake que regista o último input de complete() para inspeção.
function fakeAdapter(over?: Partial<LlmPort>): {
  adapter: LlmPort;
  calls: LlmCompleteInput[];
} {
  const calls: LlmCompleteInput[] = [];
  const adapter: LlmPort = {
    provider: "mistral",
    model: "mistral-small-latest",
    complete: async (input) => {
      calls.push(input);
      return { text: "TEXTO GERADO" };
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

describe("assistant.writing", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("modo fim: chama complete e devolve o texto com ai.used", async () => {
    const { adapter, calls } = fakeAdapter();
    const h = createAssistantWritingHandler({ resolver: resolverOf(adapter), now });
    const out = (await h.execute!(
      ctx({ mode: "fim", tone: "informal", brief: "pedir reunião ao cliente" }),
    )) as Record<string, any>;

    expect(out.text).toBe("TEXTO GERADO");
    expect(out.mode).toBe("fim");
    expect(out.tone).toBe("informal");
    expect(out.ai).toEqual({ used: true, provider: "mistral", model: "mistral-small-latest" });
    expect(out.generatedAt).toBe(FIXED.toISOString());
    // O prompt do utilizador transporta o brief.
    expect(calls[0]!.prompt).toContain("pedir reunião ao cliente");
  });

  it("modo resposta: o prompt inclui o texto recebido e a instrução", async () => {
    const { adapter, calls } = fakeAdapter();
    const h = createAssistantWritingHandler({ resolver: resolverOf(adapter), now });
    await h.execute!(
      ctx({
        mode: "resposta",
        tone: "formal",
        sourceText: "Podemos marcar para segunda?",
        instruction: "recusar com simpatia",
      }),
    );
    expect(calls[0]!.prompt).toContain("Podemos marcar para segunda?");
    expect(calls[0]!.prompt).toContain("recusar com simpatia");
  });

  it("tom 'meu' com estilo embute o .md no system", async () => {
    const { adapter, calls } = fakeAdapter();
    const h = createAssistantWritingHandler({ resolver: resolverOf(adapter), now });
    const out = (await h.execute!(
      ctx({
        mode: "fim",
        tone: "meu",
        brief: "escrever um agradecimento",
        style: "VOZ-DO-UTILIZADOR-XYZ",
      }),
    )) as Record<string, any>;
    expect(out.tone).toBe("meu");
    expect(calls[0]!.system).toContain("VOZ-DO-UTILIZADOR-XYZ");
  });

  it("tom 'meu' sem estilo cai para informal (não confia no cliente)", async () => {
    const { adapter, calls } = fakeAdapter();
    const h = createAssistantWritingHandler({ resolver: resolverOf(adapter), now });
    const out = (await h.execute!(
      ctx({ mode: "fim", tone: "meu", brief: "escrever algo" }),
    )) as Record<string, any>;
    expect(out.tone).toBe("informal");
    expect(calls[0]!.system).not.toContain("ESTILO DO UTILIZADOR");
  });

  it("sem provider (resolver devolve null) → scaffold verde, ai.used=false", async () => {
    const h = createAssistantWritingHandler({ resolver: resolverOf(null), now });
    const out = (await h.execute!(
      ctx({ mode: "fim", tone: "informal", brief: "x" }),
    )) as Record<string, any>;
    expect(out.ai).toEqual({ used: false, reason: "no-provider" });
    expect(out.text).toContain("não está configurada");
  });

  it("sem resolver (plataforma sem ENCRYPTION_KEY) → scaffold com reason no-resolver", async () => {
    const h = createAssistantWritingHandler({ resolver: null, now });
    const out = (await h.execute!(
      ctx({ mode: "fim", tone: "informal", brief: "x" }),
    )) as Record<string, any>;
    expect(out.ai).toEqual({ used: false, reason: "no-resolver" });
  });

  it("modo fim sem brief → PermanentError", async () => {
    const { adapter } = fakeAdapter();
    const h = createAssistantWritingHandler({ resolver: resolverOf(adapter), now });
    await expect(
      h.execute!(ctx({ mode: "fim", tone: "informal", brief: "   " })),
    ).rejects.toBeInstanceOf(PermanentError);
  });

  it("modo resposta sem sourceText → PermanentError", async () => {
    const { adapter } = fakeAdapter();
    const h = createAssistantWritingHandler({ resolver: resolverOf(adapter), now });
    await expect(
      h.execute!(ctx({ mode: "resposta", tone: "informal" })),
    ).rejects.toBeInstanceOf(PermanentError);
  });

  it("erro do modelo propaga-se (não mascara com scaffold)", async () => {
    const { adapter } = fakeAdapter({
      complete: async () => {
        throw Object.assign(new Error("Mistral respondeu 401."), { status: 401 });
      },
    });
    const h = createAssistantWritingHandler({ resolver: resolverOf(adapter), now });
    await expect(
      h.execute!(ctx({ mode: "fim", tone: "informal", brief: "x" })),
    ).rejects.toThrow("401");
  });

  it("stream emite um result com o texto", async () => {
    const { adapter } = fakeAdapter();
    const h = createAssistantWritingHandler({ resolver: resolverOf(adapter), now });
    const seen: any[] = [];
    for await (const e of h.stream!(ctx({ mode: "fim", tone: "informal", brief: "x" }))) {
      seen.push(e);
    }
    const result = seen.find((e) => e.type === "result");
    expect(result?.data.text).toBe("TEXTO GERADO");
  });
});
