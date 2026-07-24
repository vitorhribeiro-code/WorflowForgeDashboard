// Composition root do M10 — ÚNICO sítio que instancia deps reais.
import { db } from "@/db/client";
import { DrizzleAuditQueryRepository } from "./data/audit-query.repository";
import { DrizzleMetricsRepository } from "./data/metrics.repository";
import { createAuditService } from "./service/audit.service";
import { createMetricsService } from "./service/metrics.service";

export const auditService = createAuditService({
  repo: new DrizzleAuditQueryRepository(db),
});

export const metricsService = createMetricsService({
  repo: new DrizzleMetricsRepository(db),
  now: () => new Date(),
});
