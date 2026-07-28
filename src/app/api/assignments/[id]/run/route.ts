import { runAssignmentPOST } from "@/modules/runs/api/routes";

// POST /api/assignments/:id/run — trigger manual de uma automática.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return runAssignmentPOST(req, { params: { assignmentId: id } });
}
