import { setPasswordLinkPOST } from "@/modules/auth/api/routes";

// Rota dinâmica: em Next 15 `params` é uma Promise → desembrulhar antes de passar.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return setPasswordLinkPOST(req, { params: await ctx.params });
}
