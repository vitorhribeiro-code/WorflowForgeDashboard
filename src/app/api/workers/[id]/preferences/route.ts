import { workerPreferencesGET } from "@/modules/preferences/api/routes";

// GET /api/workers/:id/preferences — fundo do painel escolhido por um
// trabalhador (consola do super-utilizador). O serviço valida role + tenant.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return workerPreferencesGET(req, { params: await ctx.params });
}
