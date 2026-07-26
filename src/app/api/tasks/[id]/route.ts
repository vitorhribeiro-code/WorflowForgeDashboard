import { taskGET, taskPATCH } from "@/modules/tasks/api/routes";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return taskGET(req, { params: await ctx.params });
}
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return taskPATCH(req, { params: await ctx.params });
}
