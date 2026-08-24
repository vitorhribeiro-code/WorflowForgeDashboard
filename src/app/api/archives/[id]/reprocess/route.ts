import { POST as reprocessPOST } from "@/modules/archives/api/archive-reprocess.route";

// POST /api/archives/:id/reprocess — regenera arquivo preso em error/running (só admin) (M9).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return reprocessPOST(req, { params: await ctx.params });
}
