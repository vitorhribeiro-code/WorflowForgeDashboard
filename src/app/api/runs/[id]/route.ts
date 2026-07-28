import { runGET } from "@/modules/runs/api/routes";

// GET /api/runs/:id — detalhe de um Run.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return runGET(req, { params: await ctx.params });
}
