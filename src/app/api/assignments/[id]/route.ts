import { assignmentGET } from "@/modules/assignments/api/routes";

// Rota dinâmica: em Next 15 `params` é uma Promise → desembrulhar.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return assignmentGET(req, { params: await ctx.params });
}
