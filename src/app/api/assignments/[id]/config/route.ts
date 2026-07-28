import { configPUT } from "@/modules/assignments/api/routes";

// PUT /api/assignments/:id/config — edita a config (admin; revalida contra o schema).
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return configPUT(req, { params: await ctx.params });
}
