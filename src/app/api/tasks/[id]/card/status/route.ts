import { cardStatusPOST } from "@/modules/tasks/api/routes";

// POST /api/tasks/[id]/card/status — marca o estado do cartão (v44, admin).
// Corpo { status?: "draft" | "ready" } (default "ready"). «Validar» torna a
// apresentação visível ao trabalhador; ORTOGONAL ao publish da tarefa.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return cardStatusPOST(req, { params: await ctx.params });
}
