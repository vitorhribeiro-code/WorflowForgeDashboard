import { metricsGET } from "@/modules/audit/api/routes";

// GET /api/metrics — métricas operacionais no intervalo (só admin) (M10).
export function GET(req: Request) {
  return metricsGET(req);
}
