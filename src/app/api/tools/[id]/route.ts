import { toolGET, toolPATCH } from "@/modules/tools/api/routes";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return toolGET(req, { params: await ctx.params });
}
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return toolPATCH(req, { params: await ctx.params });
}
