import { assignmentSaveSummaryPOST } from "@/modules/runs/api/routes";

// POST /api/assignments/:id/save-summary — grava o último resumo no ficheiro da semana.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return assignmentSaveSummaryPOST(req, { params: { assignmentId: id } });
}
