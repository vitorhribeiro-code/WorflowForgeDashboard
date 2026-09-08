import { cardPUT } from "@/modules/tasks/api/routes";

// PUT /api/tasks/[id]/card — compõe/edita o cartão da tarefa (admin).
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return cardPUT(req, { params: await ctx.params });
}
