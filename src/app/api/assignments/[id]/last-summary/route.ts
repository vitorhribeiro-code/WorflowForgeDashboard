import { assignmentLastSummaryGET } from "@/modules/runs/api/routes";

// GET /api/assignments/:id/last-summary — resultado do último resumo produzido.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return assignmentLastSummaryGET(req, { params: { assignmentId: id } });
}
