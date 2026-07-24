// Superfície pública do M10 para o resto da app.
export { auditService, metricsService } from "./container";
export type { AuditService } from "./service/audit.service";
export type { MetricsService } from "./service/metrics.service";
export type {
  AuditFilter,
  AuditLogRow,
  OperationalMetrics,
  Paginated,
} from "./domain/types";
