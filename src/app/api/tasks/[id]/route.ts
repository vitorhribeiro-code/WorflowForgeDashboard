import { taskGET, taskPATCH, taskDELETE } from "@/modules/tasks/api/routes";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return taskGET(req, { params: await ctx.params });
}
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return taskPATCH(req, { params: await ctx.params });
}
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return taskDELETE(req, { params: await ctx.params });
}
