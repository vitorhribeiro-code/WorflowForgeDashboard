import { areaReconcilePOST } from "@/modules/assignments/api/routes";

// Rota dinâmica: em Next 15 `params` é uma Promise → desembrulhar.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return areaReconcilePOST(req, { params: await ctx.params });
}
