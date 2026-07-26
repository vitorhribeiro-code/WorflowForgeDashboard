import { togglePOST } from "@/modules/assignments/api/routes";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return togglePOST(req, { params: await ctx.params });
}
