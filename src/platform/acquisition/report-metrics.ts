/**
 * Aquisição de MÉTRICAS REAIS do próprio sistema para o runtime `report.monthly`
 * (v49). Conta, por trabalhador e período (mês), as execuções por estado e os
 * artefactos por tier — a partir da BD (M7/M8), sem crypto nem rede externa.
 *
 * Separação deliberada:
 *   - `ReportMetricsSource` (porta) + `createDrizzleReportMetricsSource` (adaptador
 *     que toca a BD) — fino, no molde dos outros `*.drizzle`.
 *   - `monthWindow` e `metricsToSections` — PUROS e testáveis sem BD; é aqui que
 *     as contagens viram as `sections`/`metrics` que o handler `report.monthly`
 *     já sabe agregar e verter para a narrativa por IA.
 *
 * Isolamento tenant: as queries filtram por `tasks.organizationId` E
 * `task_assignments.workerId` — o relatório de um trabalhador só conta o que é
 * dele, dentro da sua organização.
 */

import type { Db } from "@/db/client";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { runs, taskAssignments, tasks, runArtifacts } from "@/db/schema";

/** Contagens em bruto de um trabalhador num período. */
export interface ReportMetrics {
  runs: { total: number; success: number; error: number; queued: number; running: number };
  artifacts: { total: number; workDocument: number; intermediate: number };
}

export interface ReportMetricsQuery {
  orgId: string;
  workerId: string;
  period: string; // "YYYY-MM"
}

export interface ReportMetricsSource {
  collect(q: ReportMetricsQuery): Promise<ReportMetrics>;
}

/** Secção no formato que o handler `report.monthly` consome (`{ title, metrics }`). */
export interface ReportSection {
  title: string;
  metrics: Record<string, unknown>;
}

/**
 * Janela [1º do mês, 1º do mês seguinte) em UTC a partir de "YYYY-MM". O limite
 * superior é EXCLUSIVO (usa `<`), por isso a fronteira do mês seguinte não conta.
 */
export function monthWindow(period: string): { start: Date; nextStart: Date } {
  const parts = period.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]); // 1..12
  const start = new Date(Date.UTC(y, m - 1, 1));
  const nextStart = new Date(Date.UTC(y, m, 1)); // m===12 → transborda p/ jan do ano seguinte
  return { start, nextStart };
}

/**
 * Verte as contagens em bruto para as secções do relatório. PURO. A taxa de
 * sucesso é sobre execuções TERMINADAS (sucesso+erro), não sobre o total (que
 * inclui em curso); sem terminadas → "—" (não inventa 0%/100%).
 */
export function metricsToSections(m: ReportMetrics): ReportSection[] {
  const finished = m.runs.success + m.runs.error;
  const rate = finished > 0 ? `${Math.round((m.runs.success / finished) * 100)}%` : "—";
  return [
    {
      title: "Execuções",
      metrics: {
        total: m.runs.total,
        com_sucesso: m.runs.success,
        com_erro: m.runs.error,
        em_curso: m.runs.queued + m.runs.running,
        taxa_de_sucesso: rate,
      },
    },
    {
      title: "Artefactos",
      metrics: {
        total: m.artifacts.total,
        entregaveis: m.artifacts.workDocument,
        intermedios: m.artifacts.intermediate,
      },
    },
  ];
}

/** Adaptador Drizzle: duas agregações (runs por estado, artefactos por tier). */
export function createDrizzleReportMetricsSource(db: Db): ReportMetricsSource {
  return {
    async collect({ orgId, workerId, period }: ReportMetricsQuery): Promise<ReportMetrics> {
      const { start, nextStart } = monthWindow(period);
      const scope = and(
        eq(taskAssignments.workerId, workerId),
        eq(tasks.organizationId, orgId),
        gte(runs.createdAt, start),
        lt(runs.createdAt, nextStart),
      );

      // Execuções do worker no período, agrupadas por estado.
      const runRows = await db
        .select({ status: runs.status, n: sql<number>`count(*)::int` })
        .from(runs)
        .innerJoin(taskAssignments, eq(runs.assignmentId, taskAssignments.id))
        .innerJoin(tasks, eq(taskAssignments.taskId, tasks.id))
        .where(scope)
        .groupBy(runs.status);

      const runsByStatus: Record<string, number> = { success: 0, error: 0, queued: 0, running: 0 };
      let runsTotal = 0;
      for (const r of runRows) {
        const n = Number(r.n) || 0;
        runsTotal += n;
        if (r.status in runsByStatus) runsByStatus[r.status] = n;
      }

      // Artefactos desses runs, agrupados por tier.
      const artRows = await db
        .select({ tier: runArtifacts.tier, n: sql<number>`count(*)::int` })
        .from(runArtifacts)
        .innerJoin(runs, eq(runArtifacts.runId, runs.id))
        .innerJoin(taskAssignments, eq(runs.assignmentId, taskAssignments.id))
        .innerJoin(tasks, eq(taskAssignments.taskId, tasks.id))
        .where(scope)
        .groupBy(runArtifacts.tier);

      const artByTier: Record<string, number> = { work_document: 0, intermediate: 0 };
      let artTotal = 0;
      for (const r of artRows) {
        const n = Number(r.n) || 0;
        artTotal += n;
        if (r.tier in artByTier) artByTier[r.tier] = n;
      }

      return {
        runs: {
          total: runsTotal,
          success: runsByStatus.success!,
          error: runsByStatus.error!,
          queued: runsByStatus.queued!,
          running: runsByStatus.running!,
        },
        artifacts: {
          total: artTotal,
          workDocument: artByTier.work_document!,
          intermediate: artByTier.intermediate!,
        },
      };
    },
  };
}
