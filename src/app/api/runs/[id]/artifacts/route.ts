import { GET as runArtifactsGET } from "@/modules/artifacts/api/runs-artifacts.route";

// GET /api/runs/:id/artifacts — artefactos do run, por tier/location (M8).
// O segmento dinâmico sob /runs é [id]; o handler do módulo espera runId — adaptamos.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return runArtifactsGET(req, { params: { runId: id } });
}
