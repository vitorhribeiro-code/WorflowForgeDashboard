// -------------------------------------------------------------------------- //
//  Tipos puros do M10. Sem IO, sem Drizzle, sem Next. Testáveis isoladamente.  //
// -------------------------------------------------------------------------- //

/* --- Estados espelhados do schema.ts (fonte de verdade) ------------------- */
// Divergência assinalada (handoff §5): a docx falava em run "cancelled" e
// connection "active/error"; o schema NÃO os tem. Usamos os valores do schema.
export type RunStatus = "queued" | "running" | "success" | "error";
export type ConnectionStatus = "pending" | "connected" | "expired" | "revoked";

export const RUN_STATUSES: readonly RunStatus[] = [
  "queued",
  "running",
  "success",
  "error",
] as const;

export const CONNECTION_STATUSES: readonly ConnectionStatus[] = [
  "pending",
  "connected",
  "expired",
  "revoked",
] as const;

/* --- Consulta de auditoria ------------------------------------------------ */
export type AuditLogRow = {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

// Filtros da consulta (todos opcionais). period = [from, to).
export type AuditFilter = {
  actorId?: string;
  action?: string;
  entity?: string;
  entityId?: string;
  from?: Date;
  to?: Date;
};

export type PageRequest = { page: number; pageSize: number };

export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

/* --- Métricas operacionais ------------------------------------------------ */
export type DateRange = { from: Date; to: Date };

// Latência de Runs concluídos (têm started_at e finished_at), em milissegundos.
export type LatencyStats = {
  count: number;
  avgMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
};

// Agregados crus vindos do repositório (uma passagem SQL por concern).
export type RawMetrics = {
  runsByStatus: Partial<Record<RunStatus, number>>;
  latency: LatencyStats;
  connectionsByStatus: Partial<Record<ConnectionStatus, number>>;
};

// Métricas já compostas para o painel do admin.
export type OperationalMetrics = {
  range: DateRange;
  runs: {
    total: number;
    byStatus: Record<RunStatus, number>;
    // success / (success + error). null quando nenhum Run terminou no período.
    successRate: number | null;
  };
  latency: LatencyStats;
  connections: {
    byStatus: Record<ConnectionStatus, number>;
    healthy: number; // connected
    problem: number; // expired + revoked (o "error" da docx não existe no schema)
    pending: number; // requisito criado, ainda sem OAuth
  };
};
