import { describe, expect, it } from "vitest";
import type { ExecContext, RunEvent } from "@/modules/runs/service/handlers/handler";
import { PermanentError } from "@/modules/runs/service/exec-errors";
import {
  createAssistantGenericHandler,
  createEmailDigestHandler,
  createReportMonthlyHandler,
} from "@/modules/runs/service/handlers/builtin";

const FIXED = new Date("2026-07-25T00:00:00.000Z");
const now = () => FIXED;

/** Contexto de execução falso: recolhe os eventos emitidos. */
function ctx(
  input: Record<string, unknown>,
  config: Record<string, unknown> | null = null,
): { ctx: ExecContext; events: RunEvent[] } {
  const events: RunEvent[] = [];
  return {
    events,
    ctx: {
      input,
      config,
      orgId: "o1",
      signal: new AbortController().signal,
      emit: (e) => events.push(e),
    },
  };
}

describe("email.digest", () => {
  it("agrupa por remetente e ordena por contagem", async () => {
    const h = createEmailDigestHandler(now);
    const { ctx: c, events } = ctx({
      period: "2026-07",
      emails: [
        { from: "ana@x.pt", subject: "A1" },
        { from: "ana@x.pt", subject: "A2" },
        { from: "rui@y.pt", subject: "R1" },
      ],
    });
    const out = (await h.execute!(c)) as any;

    expect(out.total).toBe(3);
    expect(out.period).toBe("2026-07");
    expect(out.generatedAt).toBe(FIXED.toISOString());
    expect(out.senders[0]).toEqual({ sender: "ana@x.pt", count: 2, subjects: ["A1", "A2"] });
    expect(out.senders[1]!.sender).toBe("rui@y.pt");
    expect(events.some((e) => e.type === "log")).toBe(true);
  });

  it("respeita maxSubjectsPerSender do config", async () => {
    const h = createEmailDigestHandler(now);
    const { ctx: c } = ctx(
      { emails: [{ from: "a@x" }, { from: "a@x" }, { from: "a@x" }] },
      { maxSubjectsPerSender: 2 },
    );
    const out = (await h.execute!(c)) as any;
    expect(out.senders[0].count).toBe(3);
    expect(out.senders[0].subjects).toHaveLength(2);
  });

  it("ignora itens sem 'from' e não rebenta", async () => {
    const h = createEmailDigestHandler(now);
    const { ctx: c } = ctx({ emails: [{ subject: "sem from" }, { from: "b@x" }] });
    const out = (await h.execute!(c)) as any;
    expect(out.total).toBe(1);
  });

  it("input inválido lança PermanentError", async () => {
    const h = createEmailDigestHandler(now);
    const { ctx: c } = ctx({ emails: "não é array" });
    await expect(h.execute!(c)).rejects.toBeInstanceOf(PermanentError);
  });
});

describe("report.monthly", () => {
  it("compõe secções e resumo", async () => {
    const h = createReportMonthlyHandler(now);
    const { ctx: c, events } = ctx({
      period: "2026-07",
      sections: [
        { title: "Vendas", metrics: { total: 10, novos: 3 } },
        { title: "Suporte", metrics: { tickets: 5 } },
      ],
    });
    const out = (await h.execute!(c)) as any;
    expect(out.period).toBe("2026-07");
    expect(out.summary).toEqual({ sections: 2, metrics: 3 });
    expect(out.sections[0].title).toBe("Vendas");
    expect(events.some((e) => e.type === "progress")).toBe(true);
  });

  it("period fora de YYYY-MM lança PermanentError", async () => {
    const h = createReportMonthlyHandler(now);
    const { ctx: c } = ctx({ period: "julho" });
    await expect(h.execute!(c)).rejects.toBeInstanceOf(PermanentError);
  });

  it("sem period usa o mês corrente (do now injetado)", async () => {
    const h = createReportMonthlyHandler(now);
    const { ctx: c } = ctx({});
    const out = (await h.execute!(c)) as any;
    expect(out.period).toBe("2026-07"); // FIXED = 2026-07-25 (UTC)
  });

  it("sem secções produz resumo vazio", async () => {
    const h = createReportMonthlyHandler(now);
    const { ctx: c } = ctx({ period: "2026-01" });
    const out = (await h.execute!(c)) as any;
    expect(out.summary).toEqual({ sections: 0, metrics: 0 });
  });
});

describe("assistant.generic", () => {
  it("stream emite progress → log → result", async () => {
    const h = createAssistantGenericHandler(now);
    const { ctx: c } = ctx({ prompt: "olá" });
    const seen: RunEvent[] = [];
    for await (const e of h.stream!(c)) seen.push(e);

    expect(seen.map((e) => e.type)).toEqual(["progress", "log", "progress", "result"]);
    const result = seen.find((e) => e.type === "result") as Extract<RunEvent, { type: "result" }>;
    expect((result.data.response as any).received.prompt).toBe("olá");
  });

  it("execute devolve resposta com generatedAt determinístico", async () => {
    const h = createAssistantGenericHandler(now);
    const { ctx: c } = ctx({ prompt: "x", payload: { a: 1 } });
    const out = (await h.execute!(c)) as any;
    expect(out.generatedAt).toBe(FIXED.toISOString());
    expect(out.response.received.payload).toEqual({ a: 1 });
  });

  it("stream cancelado emite error e termina", async () => {
    const h = createAssistantGenericHandler(now);
    const controller = new AbortController();
    controller.abort();
    const c: ExecContext = {
      input: { prompt: "x" },
      config: null,
      orgId: "o1",
      signal: controller.signal,
      emit: () => {},
    };
    const seen: RunEvent[] = [];
    for await (const e of h.stream!(c)) seen.push(e);
    expect(seen.some((e) => e.type === "error")).toBe(true);
    expect(seen.some((e) => e.type === "result")).toBe(false);
  });
});
