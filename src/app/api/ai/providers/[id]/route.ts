import { providerDELETE, providerPATCH } from "@/modules/ai/api/routes";

// Next 15: `params` é uma Promise — resolver aqui e passar o objeto plano.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return providerPATCH(req, { params: await ctx.params });
}
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return providerDELETE(req, { params: await ctx.params });
}
