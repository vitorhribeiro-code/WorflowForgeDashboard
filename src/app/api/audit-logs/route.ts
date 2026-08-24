import { auditLogsGET } from "@/modules/audit/api/routes";

// GET /api/audit-logs — consulta paginada de auditoria (só admin) (M10).
export function GET(req: Request) {
  return auditLogsGET(req);
}
