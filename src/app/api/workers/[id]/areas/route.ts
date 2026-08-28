import { workerAreasGET, workerAreasPUT } from "@/modules/assignments/api/routes";

// Rota dinâmica: em Next 15 `params` é uma Promise → desembrulhar.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return workerAreasGET(req, { params: await ctx.params });
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return workerAreasPUT(req, { params: await ctx.params });
}
