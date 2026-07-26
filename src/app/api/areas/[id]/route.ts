import { areaPATCH, areaDELETE } from "@/modules/org/api/routes";

// Next 15: `params` é uma Promise. O handler do módulo lê ctx.params.id de forma
// síncrona, por isso resolvemos aqui e passamos o objeto plano que ele espera.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return areaPATCH(req, { params: await ctx.params });
}
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return areaDELETE(req, { params: await ctx.params });
}
