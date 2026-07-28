import { assignmentRunsGET } from "@/modules/runs/api/routes";

// GET /api/assignments/:id/runs — histórico de Runs da atribuição.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return assignmentRunsGET(req, { params: { assignmentId: id } });
}
