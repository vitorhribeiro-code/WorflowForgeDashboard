import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecContext, RunEvent } from "@/modules/runs/service/handlers/handler";
import { createReportMonthlyHandler } from "@/modules/runs/service/handlers/builtin";
import { PermanentError } from "@/modules/runs/service/exec-errors";
import type { LlmCompleteInput, LlmPort } from "@/platform/ai/port";
import type { LlmResolver } from "@/modules/ai/service/resolver";

/**
 * v47 — o report.monthly mantém a AGREGAÇÃO determinística (period, sections,
 * summary) e ACRESCENTA uma narrativa composta por IA (capacidade
 * `report.compose`), resolvendo o adapter da org e chamando `complete` DENTRO do
 * handler. Sem rede: um resolver e um LlmPort fake. Prova: a base preservada, a
 * narrativa via modelo (com as métricas no prompt), o fallback a scaffold sem IA
 * (run verde), a validação de period, e a propagação de erro do modelo.
 */

const FIXED = new Date("2026-07-25T00:00:00.000Z");
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
      return { text: "RELATÓRIO GERADO" };
    },
    summarizeBatch: async () => [],
    ...over,
  };
  return { adapter, calls };
}

function resolverOf(adapter: LlmPort | null): LlmResolver {
  return { resolve: async () => adapter };
}

// Contexto de execução falso: recolhe os eventos emitidos.
function ctx(
  input: Record<string, unknown>,
  orgId = "o1",
): { ctx: ExecContext; events: RunEvent[] } {
  const events: RunEvent[] = [];
  return {
    events,
    ctx: {
      input,
      config: null,
      orgId,
      signal: new AbortController().signal,
      emit: (e) => events.push(e),
    },
  };
}

describe("report.monthly", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("com adapter: preserva a agregação e compõe a narrativa via modelo", async () => {
    const { adapter, calls } = fakeAdapter();
    const h = createReportMonthlyHandler({ resolver: resolverOf(adapter), now });
    const { ctx: c, events } = ctx({
      period: "2026-07",
      sections: [
        { title: "Vendas", metrics: { total: 10, novos: 3 } },
        { title: "Suporte", metrics: { tickets: 5 } },
      ],
    });
    const out = (await h.execute!(c)) as Record<string, any>;

    // Base determinística intacta.
    expect(out.period).toBe("2026-07");
    expect(out.summary).toEqual({ sections: 2, metrics: 3 });
    expect(out.sections[0].title).toBe("Vendas");
    expect(out.generatedAt).toBe(FIXED.toISOString());
    // Narrativa + meta de IA.
    expect(out.narrative).toBe("RELATÓRIO GERADO");
    expect(out.ai).toEqual({ used: true, provider: "mistral", model: "mistral-small-latest" });
    // O prompt transporta os factos (títulos + métricas) — sem inventar.
    const prompt = calls[0]!.prompt;
    expect(prompt).toContain("Vendas");
    expect(prompt).toContain("total: 10");
    expect(prompt).toContain("tickets: 5");
    expect(prompt).toContain("2026-07");
    expect(events.some((e) => e.type === "progress")).toBe(true);
  });

  it("sem provider (resolver devolve null) → scaffold verde, ai.used=false", async () => {
    const h = createReportMonthlyHandler({ resolver: resolverOf(null), now });
    const { ctx: c } = ctx({
      period: "2026-07",
      sections: [{ title: "Vendas", metrics: { total: 10 } }],
    });
    const out = (await h.execute!(c)) as Record<string, any>;
    // Agregação continua a sair, mesmo sem IA.
    expect(out.summary).toEqual({ sections: 1, metrics: 1 });
    expect(out.ai).toEqual({ used: false, reason: "no-provider" });
    expect(out.narrative).toContain("não está configurada");
    expect(out.narrative).toContain("2026-07");
  });

  it("sem resolver (plataforma sem ENCRYPTION_KEY) → scaffold com reason no-resolver", async () => {
    const h = createReportMonthlyHandler({ resolver: null, now });
    const { ctx: c } = ctx({ period: "2026-07" });
    const out = (await h.execute!(c)) as Record<string, any>;
    expect(out.ai).toEqual({ used: false, reason: "no-resolver" });
  });

  it("period fora de YYYY-MM lança PermanentError", async () => {
    const h = createReportMonthlyHandler({ resolver: resolverOf(fakeAdapter().adapter), now });
    const { ctx: c } = ctx({ period: "julho" });
    await expect(h.execute!(c)).rejects.toBeInstanceOf(PermanentError);
  });

  it("sem period usa o mês corrente (do now injetado)", async () => {
    const h = createReportMonthlyHandler({ resolver: resolverOf(null), now });
    const { ctx: c } = ctx({});
    const out = (await h.execute!(c)) as Record<string, any>;
    expect(out.period).toBe("2026-07"); // FIXED = 2026-07-25 (UTC)
  });

  it("sem secções produz resumo vazio (e ainda pede narrativa)", async () => {
    const { adapter, calls } = fakeAdapter();
    const h = createReportMonthlyHandler({ resolver: resolverOf(adapter), now });
    const { ctx: c } = ctx({ period: "2026-01" });
    const out = (await h.execute!(c)) as Record<string, any>;
    expect(out.summary).toEqual({ sections: 0, metrics: 0 });
    expect(out.narrative).toBe("RELATÓRIO GERADO");
    expect(calls[0]!.prompt).toContain("sem secções");
  });

  it("erro do modelo propaga-se (não mascara com scaffold)", async () => {
    const { adapter } = fakeAdapter({
      complete: async () => {
        throw Object.assign(new Error("Mistral respondeu 401."), { status: 401 });
      },
    });
    const h = createReportMonthlyHandler({ resolver: resolverOf(adapter), now });
    const { ctx: c } = ctx({ period: "2026-07" });
    await expect(h.execute!(c)).rejects.toThrow("401");
  });
});
