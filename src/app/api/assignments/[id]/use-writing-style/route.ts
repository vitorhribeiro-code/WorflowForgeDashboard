import { useWritingStylePUT } from "@/modules/assignments/api/routes";

// PUT /api/assignments/:id/use-writing-style — liga/desliga o uso do estilo (admin).
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return useWritingStylePUT(req, { params: await ctx.params });
}
