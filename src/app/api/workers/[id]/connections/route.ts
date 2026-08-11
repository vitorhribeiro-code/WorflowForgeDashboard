import { workerConnectionsGET } from "@/modules/connections/api/routes";

// GET /api/workers/:id/connections — estado das conexões de um trabalhador
// (consola do super-utilizador). O serviço valida role + tenant; nunca devolve
// tokens (só status/scopes/validade).
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return workerConnectionsGET(req, { params: await ctx.params });
}
