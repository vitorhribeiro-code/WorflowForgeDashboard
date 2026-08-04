import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InputAcquisitionContext, InputProvider } from "@/modules/runs/service/ports";
import type { LlmPort, LlmSummarizeItem } from "@/platform/ai/port";
import type { LlmResolver } from "@/modules/ai/service/resolver";
import { createEmailEnrichmentProvider } from "@/platform/ai/email-enrichment";

/**
 * §5.2 fase 3 — decorator de enriquecimento. Sem rede: um resolver e um LlmPort
 * fake. Prova: 1 chamada em batch, resumo por email, fallback garantido, e
 * pass-through para runtimes sem IA.
 */

function innerReturning(input: Record<string, unknown>): InputProvider {
  return { resolve: async () => input };
}

function ctx(over: Partial<InputAcquisitionContext> = {}): InputAcquisitionContext {
  return {
    runtime: "email.digest",
    orgId: "o1",
    workerId: "w1",
    config: null,
    base: {},
    ...over,
  };
}

// LlmPort fake cujo summarizeBatch devolve "resumo <id>" para cada item.
function fakeAdapter(over?: Partial<LlmPort>): LlmPort {
  return {
    provider: "mistral",
    model: "mistral-small",
    complete: async () => ({ text: "" }),
    summarizeBatch: async (items: LlmSummarizeItem[]) =>
      items.map((i) => ({ id: i.id, summary: `resumo ${i.id}` })),
    ...over,
  };
}

function resolverOf(adapter: LlmPort | null): LlmResolver {
  return { resolve: async () => adapter };
}

const EMAILS = [
  { from: "a@x.pt", subject: "Fatura", snippet: "detalhe da fatura" },
  { from: "b@x.pt", subject: "Reunião", snippet: "agenda de segunda" },
];

describe("enriquecimento de emails por IA", () => {
  // O provider loga em warn/info nos caminhos de fallback/sucesso; silencia-se
  // para manter o output dos testes limpo (o comportamento não muda).
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dá um resumo por email numa só chamada em batch e marca aiSummary.used", async () => {
    const adapter = fakeAdapter();
    const spy = vi.spyOn(adapter, "summarizeBatch");
    const provider = createEmailEnrichmentProvider({
      resolver: resolverOf(adapter),
      inner: innerReturning({ emails: EMAILS, period: "2026-08" }),
    });

    const out = await provider.resolve(ctx());
    const emails = out.emails as Array<Record<string, unknown>>;
    expect(emails.map((e) => e.resumo)).toEqual(["resumo 0", "resumo 1"]);
    expect(spy).toHaveBeenCalledTimes(1); // batch = 1 chamada/corrida
    expect(out.aiSummary).toMatchObject({
      used: true,
      provider: "mistral",
      model: "mistral-small",
      count: 2,
    });
    expect(out.period).toBe("2026-08"); // resto do input preservado
  });

  it("sem provider (resolver null) → fallback ao snippet/assunto, used=false", async () => {
    const provider = createEmailEnrichmentProvider({
      resolver: resolverOf(null),
      inner: innerReturning({ emails: EMAILS }),
    });
    const out = await provider.resolve(ctx());
    const emails = out.emails as Array<Record<string, unknown>>;
    // fallback = snippet quando existe.
    expect(emails[0]!.resumo).toBe("detalhe da fatura");
    expect(emails[1]!.resumo).toBe("agenda de segunda");
    expect(out.aiSummary).toMatchObject({ used: false, reason: "no-provider" });
  });

  it("fallback ao assunto quando não há snippet", async () => {
    const provider = createEmailEnrichmentProvider({
      resolver: resolverOf(null),
      inner: innerReturning({ emails: [{ from: "a@x.pt", subject: "Só assunto" }] }),
    });
    const out = await provider.resolve(ctx());
    const emails = out.emails as Array<Record<string, unknown>>;
    expect(emails[0]!.resumo).toBe("Só assunto");
  });

  it("falha do modelo não parte o run → fallback, used=false", async () => {
    const adapter = fakeAdapter({
      summarizeBatch: async () => {
        throw new Error("modelo indisponível");
      },
    });
    const provider = createEmailEnrichmentProvider({
      resolver: resolverOf(adapter),
      inner: innerReturning({ emails: EMAILS }),
    });
    const out = await provider.resolve(ctx());
    const emails = out.emails as Array<Record<string, unknown>>;
    expect(emails[0]!.resumo).toBe("detalhe da fatura"); // fallback
    expect(out.aiSummary).toMatchObject({ used: false, reason: "error" });
  });

  it("runtime sem capacidade de IA → pass-through inalterado", async () => {
    const adapter = fakeAdapter();
    const spy = vi.spyOn(adapter, "summarizeBatch");
    const base = { emails: EMAILS };
    const provider = createEmailEnrichmentProvider({
      resolver: resolverOf(adapter),
      inner: innerReturning(base),
    });
    const out = await provider.resolve(ctx({ runtime: "report.monthly" }));
    expect(out).toBe(base); // devolve o mesmo objeto, sem tocar
    expect(spy).not.toHaveBeenCalled();
  });

  it("sem emails → pass-through", async () => {
    const provider = createEmailEnrichmentProvider({
      resolver: resolverOf(fakeAdapter()),
      inner: innerReturning({ period: "2026-08" }),
    });
    const out = await provider.resolve(ctx());
    expect(out.aiSummary).toBeUndefined();
  });

  it("respeita o teto maxItems (só os primeiros são resumidos; resto fica no fallback)", async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      from: `${i}@x.pt`,
      subject: `S${i}`,
      snippet: `snip ${i}`,
    }));
    const provider = createEmailEnrichmentProvider({
      resolver: resolverOf(fakeAdapter()),
      inner: innerReturning({ emails: many }),
      maxItems: 2,
    });
    const out = await provider.resolve(ctx());
    const emails = out.emails as Array<Record<string, unknown>>;
    expect(emails[0]!.resumo).toBe("resumo 0"); // IA
    expect(emails[1]!.resumo).toBe("resumo 1"); // IA
    expect(emails[2]!.resumo).toBe("snip 2"); // fallback (fora do teto)
    expect(out.aiSummary).toMatchObject({ used: true, count: 2 });
  });
});
