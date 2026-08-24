// GET /api/archives/[id]          -> detalhe (manifesto + estado)
// GET /api/archives/[id]/download -> link do pacote (só quando success)
import { getArchiveContainer } from "../container";
import { archiveIdParam } from "../validation/archive.schema";
import { json, parse, withSession } from "./http";

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  return withSession(req, async (session) => {
    const { id } = parse(archiveIdParam, params);
    const service = getArchiveContainer().service;
    const archive = await service.getArchiveById(session, id);
    return json({ archive });
  });
}

// Colocar num route.ts próprio em app/api/archives/[id]/download/
export async function GET_download(
  req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  return withSession(req, async (session) => {
    const { id } = parse(archiveIdParam, params);
    const service = getArchiveContainer().service;
    const target = await service.getDownload(session, id);
    return json(target);
  });
}
