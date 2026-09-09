import { cardGeneratePOST } from "@/modules/tasks/api/routes";

// POST /api/tasks/[id]/card/generate — gera a apresentação do cartão via IA (admin).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return cardGeneratePOST(req, { params: await ctx.params });
}
