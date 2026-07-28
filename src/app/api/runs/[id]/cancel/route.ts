import { runCancelPOST } from "@/modules/runs/api/routes";

// POST /api/runs/:id/cancel — cancela um Run (queued/running).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return runCancelPOST(req, { params: await ctx.params });
}
