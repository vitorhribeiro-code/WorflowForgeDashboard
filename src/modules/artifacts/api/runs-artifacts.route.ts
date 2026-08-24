// GET /api/runs/[runId]/artifacts  -> lista artefactos do run (por tier/location).
// No App Router, colocar em app/api/runs/[runId]/artifacts/route.ts e reexportar GET.
import { getArtifactContainer } from "../container";
import { runIdParam } from "../validation/artifact.schema";
import { json, parse, withSession } from "./http";

export async function GET(
  req: Request,
  { params }: { params: { runId: string } },
): Promise<Response> {
  return withSession(req, async (session) => {
    const { runId } = parse(runIdParam, params);
    const service = getArtifactContainer().service;
    const artifacts = await service.listByRun(session, runId);
    return json({ artifacts });
  });
}
