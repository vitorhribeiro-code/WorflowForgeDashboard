import { publishPOST } from "@/modules/tasks/api/routes";

// publishPOST lê ?unpublish=1 do req.url; só precisamos de resolver params.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return publishPOST(req, { params: await ctx.params });
}
