import { userPATCH } from "@/modules/org/api/routes";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return userPATCH(req, { params: await ctx.params });
}
