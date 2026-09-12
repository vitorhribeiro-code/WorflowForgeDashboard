import { describe, it, expect, vi } from "vitest";
import { createReportMetricsInputProvider } from "@/platform/acquisition/report-metrics-input-provider";
import {
  monthWindow,
  metricsToSections,
  type ReportMetrics,
  type ReportMetricsSource,
} from "@/platform/acquisition/report-metrics";
import type { InputAcquisitionContext, InputProvider } from "@/modules/runs/service/ports";

const NOW = () => new Date("2026-07-15T00:00:00Z");

// Pass-through simples: devolve o `base` tal e qual (como o motor sem provider).
const passthrough: InputProvider = { resolve: async (ctx) => ctx.base };

function fakeSource(metrics: ReportMetrics, spy?: (q: unknown) => void): ReportMetricsSource {
  return {
    collect: async (q) => {
      spy?.(q);
      return metrics;
    },
  };
}

const M: ReportMetrics = {
  runs: { total: 10, success: 7, error: 2, queued: 1, running: 0 },
  artifacts: { total: 5, workDocument: 3, intermediate: 2 },
};

function ctx(over: Partial<InputAcquisitionContext>): InputAcquisitionContext {
  return {
    runtime: "report.monthly",
    orgId: "o1",
    workerId: "w1",
    config: null,
    base: {},
    ...over,
  };
}

describe("createReportMetricsInputProvider.resolve", () => {
  it("pass-through para runtimes que não são report.monthly", async () => {
    const spy = vi.fn();
    const p = createReportMetricsInputProvider({ inner: passthrough, metrics: fakeSource(M, spy), now: NOW });
    const base = { emails: [{ from: "a@x.pt" }] };
    const out = await p.resolve(ctx({ runtime: "email.digest", base }));
    expect(out).toBe(base); // inner devolve o base; o provider de métricas não toca
    expect(spy).not.toHaveBeenCalled();
  });

  it("injeta sections reais a partir das métricas do worker (período do input)", async () => {
    const spy = vi.fn();
    const p = createReportMetricsInputProvider({ inner: passthrough, metrics: fakeSource(M, spy), now: NOW });
    const out = await p.resolve(ctx({ orgId: "o9", workerId: "w9", base: { period: "2026-05" } }));
    expect(spy).toHaveBeenCalledWith({ orgId: "o9", workerId: "w9", period: "2026-05" });
    expect(out.period).toBe("2026-05");
    const sections = out.sections as Array<{ title: string; metrics: Record<string, unknown> }>;
    expect(sections.map((s) => s.title)).toEqual(["Execuções", "Artefactos"]);
    expect(sections[0]!.metrics).toMatchObject({
      total: 10,
      com_sucesso: 7,
      com_erro: 2,
      em_curso: 1,
      taxa_de_sucesso: "78%", // 7/(7+2)
    });
    expect(sections[1]!.metrics).toMatchObject({ total: 5, entregaveis: 3, intermedios: 2 });
  });

  it("usa o mês corrente (now) quando não há period no input nem na config", async () => {
    const spy = vi.fn();
    const p = createReportMetricsInputProvider({ inner: passthrough, metrics: fakeSource(M, spy), now: NOW });
    const out = await p.resolve(ctx({ base: {} }));
    expect(spy).toHaveBeenCalledWith({ orgId: "o1", workerId: "w1", period: "2026-07" });
    expect(out.period).toBe("2026-07");
  });

  it("usa o period da config quando o input não o traz", async () => {
    const spy = vi.fn();
    const p = createReportMetricsInputProvider({ inner: passthrough, metrics: fakeSource(M, spy), now: NOW });
    await p.resolve(ctx({ config: { period: "2026-03" }, base: {} }));
    expect(spy).toHaveBeenCalledWith({ orgId: "o1", workerId: "w1", period: "2026-03" });
  });

  it("respeita override manual de sections e NÃO consulta a BD", async () => {
    const spy = vi.fn();
    const p = createReportMetricsInputProvider({ inner: passthrough, metrics: fakeSource(M, spy), now: NOW });
    const base = { period: "2026-07", sections: [{ title: "Custom", metrics: { x: 1 } }] };
    const out = await p.resolve(ctx({ base }));
    expect(out.sections).toBe(base.sections);
    expect(spy).not.toHaveBeenCalled();
  });

  it("período malformado → não consulta a BD (deixa o handler classificar)", async () => {
    const spy = vi.fn();
    const p = createReportMetricsInputProvider({ inner: passthrough, metrics: fakeSource(M, spy), now: NOW });
    const out = await p.resolve(ctx({ base: { period: "julho" } }));
    expect(out.sections).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it("preserva o que o inner (cadeia) acrescenta ao input", async () => {
    const inner: InputProvider = { resolve: async (c) => ({ ...c.base, tag: "from-inner" }) };
    const p = createReportMetricsInputProvider({ inner, metrics: fakeSource(M), now: NOW });
    const out = await p.resolve(ctx({ base: {} }));
    expect(out.tag).toBe("from-inner");
    expect(Array.isArray(out.sections)).toBe(true);
  });
});

describe("monthWindow", () => {
  it("período normal → [1º do mês, 1º do mês seguinte) em UTC", () => {
    const { start, nextStart } = monthWindow("2026-07");
    expect(start.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(nextStart.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("dezembro → transborda para janeiro do ano seguinte", () => {
    const { start, nextStart } = monthWindow("2026-12");
    expect(start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(nextStart.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("metricsToSections", () => {
  it("taxa_de_sucesso = sucesso / (sucesso+erro), arredondada", () => {
    const s = metricsToSections({
      runs: { total: 5, success: 3, error: 1, queued: 1, running: 0 },
      artifacts: { total: 0, workDocument: 0, intermediate: 0 },
    });
    expect(s[0]!.metrics.taxa_de_sucesso).toBe("75%"); // 3/(3+1)
    expect(s[0]!.metrics.em_curso).toBe(1);
  });

  it("sem execuções terminadas → taxa \"—\" (não inventa 0%/100%)", () => {
    const s = metricsToSections({
      runs: { total: 2, success: 0, error: 0, queued: 2, running: 0 },
      artifacts: { total: 0, workDocument: 0, intermediate: 0 },
    });
    expect(s[0]!.metrics.taxa_de_sucesso).toBe("—");
  });
});
