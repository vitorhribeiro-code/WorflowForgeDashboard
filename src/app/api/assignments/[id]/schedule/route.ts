import { schedulePUT } from "@/modules/assignments/api/routes";

// PUT /api/assignments/:id/schedule — define/limpa o cron (admin; só automáticas).
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return schedulePUT(req, { params: await ctx.params });
}
