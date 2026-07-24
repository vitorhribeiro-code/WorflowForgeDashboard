// POST /api/archives/[id]/reprocess -> regenera arquivo em error/running preso (admin).
import { getArchiveContainer } from "../container";
import { archiveIdParam } from "../validation/archive.schema";
import { json, parse, withSession } from "./http";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  return withSession(async (session) => {
    const { id } = parse(archiveIdParam, params);
    const service = getArchiveContainer().service;
    const archive = await service.reprocess(session, id);
    return json({ archive });
  });
}
