// GET /api/archives?workerId=&period=  -> lista arquivos.
// App Router: app/api/archives/route.ts, reexporta GET.
import { getArchiveContainer } from "../container";
import { listQuery } from "../validation/archive.schema";
import { json, parse, withSession } from "./http";

export async function GET(req: Request): Promise<Response> {
  return withSession(req, async (session) => {
    const url = new URL(req.url);
    const filter = parse(listQuery, {
      workerId: url.searchParams.get("workerId") ?? undefined,
      period: url.searchParams.get("period") ?? undefined,
    });
    const service = getArchiveContainer().service;
    const archives = await service.listArchives(session, filter);
    return json({ archives });
  });
}
