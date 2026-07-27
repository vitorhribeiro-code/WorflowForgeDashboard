import { revokePOST } from "@/modules/connections/api/routes";

// POST /api/connections/[toolId]/revoke — revoga e suspende atribuições dependentes.
export async function POST(req: Request, ctx: { params: Promise<{ toolId: string }> }) {
  return revokePOST(req, { params: await ctx.params });
}
