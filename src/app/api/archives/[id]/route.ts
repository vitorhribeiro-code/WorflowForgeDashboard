import { GET as detailGET } from "@/modules/archives/api/archive-detail.route";

// GET /api/archives/:id — detalhe do arquivo (manifesto + estado) (M9).
// Next 15 passa params como Promise; resolvemos e entregamos ao handler do módulo.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return detailGET(req, { params: await ctx.params });
}
