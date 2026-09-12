/**
 * InputProvider (porta do M7) que faz a aquisição de dados a montante do handler
 * `report.monthly` (v49): conta as execuções/artefactos reais do trabalhador no
 * período e injeta-os como `input.sections` — que o handler já sabe agregar e
 * verter para a narrativa por IA (v47). Substitui o antigo "sections vêm da
 * config" por dados reais do próprio sistema.
 *
 * DECORATOR (molde do email-enrichment): delega primeiro no `inner` (a cadeia de
 * aquisição de email, ou um pass-through) e só depois age — e SÓ para o runtime
 * `report.monthly`. Para os restantes é pass-through (devolve o input do inner
 * tal como está), mantendo os handlers puros.
 *
 * Regras:
 *   - Override manual: se o input já traz `sections` (payload de teste/config),
 *     respeita-o e NÃO consulta a BD — útil para validar sem dados reais.
 *   - Período: `input.period` → `config.period` → mês corrente (UTC). Malformado
 *     ⇒ não consulta a BD e deixa o handler classificar (PermanentError), para
 *     manter o tratamento de erro num só sítio.
 *   - Só precisa da BD (sem crypto): pode estar ligado mesmo sem ENCRYPTION_KEY.
 */

import type { InputAcquisitionContext, InputProvider } from "@/modules/runs/service/ports";
import { metricsToSections, type ReportMetricsSource } from "./report-metrics";

const REPORT_MONTHLY = "report.monthly";
const PERIOD_RE = /^\d{4}-\d{2}$/;

export interface ReportMetricsInputProviderDeps {
  inner: InputProvider;
  metrics: ReportMetricsSource;
  now?: () => Date;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function currentPeriod(now: () => Date): string {
  const d = now();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function createReportMetricsInputProvider(
  deps: ReportMetricsInputProviderDeps,
): InputProvider {
  const now = deps.now ?? (() => new Date());

  return {
    async resolve(ctx: InputAcquisitionContext): Promise<Record<string, unknown>> {
      const input = await deps.inner.resolve(ctx);
      if (ctx.runtime !== REPORT_MONTHLY) return input; // pass-through

      const period =
        asString(input.period) ?? asString(ctx.config?.period) ?? currentPeriod(now);

      // Override manual: sections já fornecidas → respeita, não toca a BD.
      if (Array.isArray(input.sections)) {
        return asString(input.period) ? input : { ...input, period };
      }

      // Período malformado → deixa o handler classificar (PermanentError).
      if (!PERIOD_RE.test(period)) return input;

      const metrics = await deps.metrics.collect({
        orgId: ctx.orgId,
        workerId: ctx.workerId,
        period,
      });
      return { ...input, period, sections: metricsToSections(metrics) };
    },
  };
}
