import type { SessionContext } from "@/lib/session";
import type { MetricsRepository } from "../data/metrics.repository";
import { assembleMetrics, resolveRange } from "../domain/metrics";
import type { OperationalMetrics } from "../domain/types";
import { requireAdmin } from "./guards";

export type MetricsServiceDeps = {
  repo: MetricsRepository;
  now: () => Date; // injetado p/ testabilidade do intervalo por defeito
};

export type MetricsQueryInput = {
  range?: { from?: Date; to?: Date };
};

export type MetricsService = ReturnType<typeof createMetricsService>;

export function createMetricsService({ repo, now }: MetricsServiceDeps) {
  return {
    // Agregados de saúde das automações no intervalo. Admin-only.
    async operational(
      session: SessionContext,
      input: MetricsQueryInput,
    ): Promise<OperationalMetrics> {
      requireAdmin(session);
      const range = resolveRange(input.range, now());
      const raw = await repo.collect(session.orgId, range);
      return assembleMetrics(range, raw);
    },
  };
}
