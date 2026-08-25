// POST /api/archives/[id]/reprocess -> regenera arquivo em error/running preso (admin).
// Body OPCIONAL: { force?: boolean } — com force, também reconstrói um já success
// (ex.: folderRef de memória sem objeto no R2). Corpo vazio = force implícito false.
import { getArchiveContainer } from "../container";
import { archiveIdParam, reprocessBody } from "../validation/archive.schema";
import { DomainError } from "../../../lib/errors";
import { json, parse, withSession } from "./http";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  return withSession(req, async (session) => {
    const { id } = parse(archiveIdParam, params);
    const raw = await req.text();
    let payload: unknown = {};
    if (raw.trim()) {
      try {
        payload = JSON.parse(raw);
      } catch {
        throw new DomainError("BAD_INPUT", "Body JSON inválido", 400);
      }
    }
    const { force } = parse(reprocessBody, payload);
    const service = getArchiveContainer().service;
    const archive = await service.reprocess(session, id, { force });
    return json({ archive });
  });
}
