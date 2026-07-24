// POST /api/maintenance/archives/build -> consolida o período.
// Endpoint de sistema (cron secret). Body: { period, workerId?, orgId? }.
//  - com workerId  -> consolida só esse worker
//  - sem workerId  -> consolida todos os workers (opcionalmente de uma org)
import { getArchiveContainer } from "../container";
import { buildBody } from "../validation/archive.schema";
import { errorResponse, json, parse } from "./http";

export async function POST(req: Request): Promise<Response> {
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return json({ code: "FORBIDDEN", message: "Cron não autorizado" }, 403);
  }
  try {
    const body = parse(buildBody, await req.json());
    const service = getArchiveContainer().service;

    if (body.workerId) {
      const archive = await service.buildArchive({ workerId: body.workerId, period: body.period });
      return json({ archive });
    }
    const results = await service.buildAllForPeriod(body.period, body.orgId);
    return json({ results, total: results.length, failed: results.filter((r) => !r.ok).length });
  } catch (err) {
    return errorResponse(err);
  }
}
