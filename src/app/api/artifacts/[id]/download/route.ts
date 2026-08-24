import { GET as artifactDownloadGET } from "@/modules/artifacts/api/artifact-download.route";

// GET /api/artifacts/:id/download — link temporário do artefacto (M8).
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return artifactDownloadGET(req, { params: await ctx.params });
}
