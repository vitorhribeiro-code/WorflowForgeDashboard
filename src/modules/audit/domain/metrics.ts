import {
  CONNECTION_STATUSES,
  RUN_STATUSES,
  type ConnectionStatus,
  type DateRange,
  type OperationalMetrics,
  type RawMetrics,
  type RunStatus,
} from "./types";

export const DEFAULT_RANGE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// Resolve o intervalo: usa o que vier, senão os últimos DEFAULT_RANGE_DAYS até "now".
export function resolveRange(
  input: { from?: Date; to?: Date } | undefined,
  now: Date,
): DateRange {
  const to = input?.to ?? now;
  const from = input?.from ?? new Date(to.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);
  return { from, to };
}

// Taxa de sucesso sobre Runs terminados. null quando nada terminou (evita 0/0 = NaN).
export function successRate(success: number, error: number): number | null {
  const finished = success + error;
  if (finished === 0) return null;
  return success / finished;
}

// Preenche zeros para todos os estados e deriva os buckets do painel.
export function assembleMetrics(range: DateRange, raw: RawMetrics): OperationalMetrics {
  const byStatus = Object.fromEntries(
    RUN_STATUSES.map((s) => [s, raw.runsByStatus[s] ?? 0]),
  ) as Record<RunStatus, number>;

  const total = RUN_STATUSES.reduce((acc, s) => acc + byStatus[s], 0);

  const connByStatus = Object.fromEntries(
    CONNECTION_STATUSES.map((s) => [s, raw.connectionsByStatus[s] ?? 0]),
  ) as Record<ConnectionStatus, number>;

  return {
    range,
    runs: {
      total,
      byStatus,
      successRate: successRate(byStatus.success, byStatus.error),
    },
    latency: raw.latency,
    connections: {
      byStatus: connByStatus,
      healthy: connByStatus.connected,
      problem: connByStatus.expired + connByStatus.revoked,
      pending: connByStatus.pending,
    },
  };
}
