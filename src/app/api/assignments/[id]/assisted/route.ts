import { POST as assistedPOST } from "@/modules/runs/api/assisted.route";

// POST /api/assignments/:id/assisted — inicia um Run assistido (stream SSE).
// O handler do módulo usa a assinatura antiga `{ params: { assignmentId } }`
// (não-Promise): aqui desembrulhamos o `params` do Next 15 e remapeamos
// [id] → assignmentId antes de delegar (handoff §6.2).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return assistedPOST(req, { params: { assignmentId: id } });
}
