import { connectionsCallbackGET } from "@/modules/connections/api/callback.route";

// GET /api/connections/callback?state&code[&error] — conclui o OAuth e redireciona.
// Sem sessão: a identidade viaja no `state` assinado. Fora do matcher do middleware
// (que só cobre páginas), por isso o provider consegue redirecionar para cá.
export function GET(req: Request) {
  return connectionsCallbackGET(req);
}
