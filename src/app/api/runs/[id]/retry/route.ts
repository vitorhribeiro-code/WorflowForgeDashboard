import { runRetryPOST } from "@/modules/runs/api/routes";

// POST /api/runs/:id/retry — repete um Run falhado (erro transitório).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return runRetryPOST(req, { params: await ctx.params });
}
