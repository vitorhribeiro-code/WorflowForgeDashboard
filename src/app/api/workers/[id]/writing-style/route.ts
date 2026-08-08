import { writingStyleGET, writingStylePUT } from "@/modules/writing-styles/api/routes";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return writingStyleGET(req, { params: await ctx.params });
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return writingStylePUT(req, { params: await ctx.params });
}
