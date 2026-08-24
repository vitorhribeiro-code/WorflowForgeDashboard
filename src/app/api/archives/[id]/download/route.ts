import { GET_download } from "@/modules/archives/api/archive-detail.route";

// GET /api/archives/:id/download — link do pacote do arquivo (só quando success) (M9).
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return GET_download(req, { params: await ctx.params });
}
