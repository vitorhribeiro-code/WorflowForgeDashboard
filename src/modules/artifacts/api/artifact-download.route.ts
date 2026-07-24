// GET /api/artifacts/[id]/download -> devolve o link temporário do artefacto.
// Devolvemos JSON com o URL (a app não serve o ficheiro); o cliente segue o link.
import { getArtifactContainer } from "../container";
import { artifactIdParam } from "../validation/artifact.schema";
import { json, parse, withSession } from "./http";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  return withSession(async (session) => {
    const { id } = parse(artifactIdParam, params);
    const service = getArtifactContainer().service;
    const target = await service.getDownload(session, id);
    return json(target);
  });
}
