import { requiredToolsGET, requiredToolsPUT } from "@/modules/tasks/api/routes";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return requiredToolsGET(req, { params: await ctx.params });
}
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return requiredToolsPUT(req, { params: await ctx.params });
}
