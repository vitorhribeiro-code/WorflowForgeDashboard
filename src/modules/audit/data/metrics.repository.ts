import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type {
  ConnectionStatus,
  DateRange,
  RawMetrics,
  RunStatus,
} from "../domain/types";

// Interface de saída. O service depende SÓ disto.
export interface MetricsRepository {
  collect(orgId: string, range: DateRange): Promise<RawMetrics>;
}

// Linhas cruas devolvidas pelas queries de agregação.
type StatusCountRow = { status: string; n: number };
type LatencyRow = {
  n: number;
  avg_ms: number | null;
  p50_ms: number | null;
  p95_ms: number | null;
};

// db.execute (node-postgres) devolve { rows }. Helper defensivo.
function rowsOf<T>(res: unknown): T[] {
  const r = res as { rows?: T[] };
  return Array.isArray(r?.rows) ? r.rows : ((res as T[]) ?? []);
}

// -------------------------------------------------------------------------- //
//  Leitura analítica (read model). Agrega diretamente as tabelas partilhadas  //
//  runs / worker_connections. Não importa repos de M6/M7 — só lê o DB (a      //
//  fronteira SQL é este ficheiro). Sem ports cross-module p/ agregados read.  //
//  Escopo por org: runs via assignment→task→org; conexões via worker→org.     //
// -------------------------------------------------------------------------- //
export class DrizzleMetricsRepository implements MetricsRepository {
  constructor(private readonly db: Db) {}

  async collect(orgId: string, range: DateRange): Promise<RawMetrics> {
    const [runStatus, latency, connStatus] = await Promise.all([
      this.runStatusCounts(orgId, range),
      this.runLatency(orgId, range),
      this.connectionStatusCounts(orgId),
    ]);

    return {
      runsByStatus: toStatusMap<RunStatus>(runStatus),
      latency,
      connectionsByStatus: toStatusMap<ConnectionStatus>(connStatus),
    };
  }

  private async runStatusCounts(orgId: string, range: DateRange) {
    const res = await this.db.execute(sql`
      select r.status as status, count(*)::int as n
      from runs r
      join task_assignments ta on ta.id = r.assignment_id
      join tasks t on t.id = ta.task_id
      where t.organization_id = ${orgId}
        and r.created_at >= ${range.from} and r.created_at < ${range.to}
      group by r.status
    `);
    return rowsOf<StatusCountRow>(res);
  }

  private async runLatency(orgId: string, range: DateRange) {
    const res = await this.db.execute(sql`
      select
        count(*)::int as n,
        avg(extract(epoch from (r.finished_at - r.started_at)) * 1000) as avg_ms,
        percentile_cont(0.5) within group (
          order by extract(epoch from (r.finished_at - r.started_at)) * 1000
        ) as p50_ms,
        percentile_cont(0.95) within group (
          order by extract(epoch from (r.finished_at - r.started_at)) * 1000
        ) as p95_ms
      from runs r
      join task_assignments ta on ta.id = r.assignment_id
      join tasks t on t.id = ta.task_id
      where t.organization_id = ${orgId}
        and r.started_at is not null and r.finished_at is not null
        and r.created_at >= ${range.from} and r.created_at < ${range.to}
    `);
    const row = rowsOf<LatencyRow>(res)[0];
    return {
      count: row?.n ?? 0,
      avgMs: numOrNull(row?.avg_ms),
      p50Ms: numOrNull(row?.p50_ms),
      p95Ms: numOrNull(row?.p95_ms),
    };
  }

  private async connectionStatusCounts(orgId: string) {
    const res = await this.db.execute(sql`
      select wc.status as status, count(*)::int as n
      from worker_connections wc
      join users u on u.id = wc.worker_id
      where u.organization_id = ${orgId}
      group by wc.status
    `);
    return rowsOf<StatusCountRow>(res);
  }
}

function toStatusMap<K extends string>(rows: StatusCountRow[]): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  for (const r of rows) out[r.status as K] = Number(r.n);
  return out;
}

function numOrNull(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}
