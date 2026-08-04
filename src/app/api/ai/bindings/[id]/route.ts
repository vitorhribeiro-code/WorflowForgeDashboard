import { bindingDELETE } from "@/modules/ai/api/routes";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return bindingDELETE(req, { params: await ctx.params });
}
