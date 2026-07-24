import { auditService, metricsService } from "../container";
import { normalizePage } from "../domain/pagination";
import { auditQuerySchema, metricsQuerySchema } from "../validation/schemas";
import { json, parse, queryOf, withSession } from "./http";

// GET /api/audit-logs — consulta paginada de auditoria (admin).
export const auditLogsGET = withSession(async (session, req) => {
  const q = parse(auditQuerySchema, queryOf(req));
  const page = normalizePage(q.page, q.pageSize);
  const result = await auditService.list(session, {
    page,
    filter: {
      actorId: q.actorId,
      action: q.action,
      entity: q.entity,
      entityId: q.entityId,
      from: q.from,
      to: q.to,
    },
  });
  return json(result);
});

// GET /api/metrics — métricas operacionais no intervalo (admin).
export const metricsGET = withSession(async (session, req) => {
  const q = parse(metricsQuerySchema, queryOf(req));
  const result = await metricsService.operational(session, {
    range: { from: q.from, to: q.to },
  });
  return json(result);
});
