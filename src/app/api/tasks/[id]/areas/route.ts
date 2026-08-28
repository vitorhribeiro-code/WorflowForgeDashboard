import { taskAreasGET, taskAreasPUT } from "@/modules/assignments/api/routes";

// Rota dinâmica: em Next 15 `params` é uma Promise → desembrulhar.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return taskAreasGET(req, { params: await ctx.params });
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return taskAreasPUT(req, { params: await ctx.params });
}
