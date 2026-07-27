import { renewPOST } from "@/modules/connections/api/routes";

// POST /api/connections/[toolId]/renew — refresh silencioso ou reauth_required.
export async function POST(req: Request, ctx: { params: Promise<{ toolId: string }> }) {
  return renewPOST(req, { params: await ctx.params });
}
