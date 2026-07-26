import { organizationGET, organizationPATCH } from "@/modules/org/api/routes";

// Wrapper de 1 parâmetro: o handler do módulo ignora o contexto, e assim a
// assinatura satisfaz o type-checker de rotas do Next 15 (ctx = Promise).
export function GET(req: Request) {
  return organizationGET(req);
}
export function PATCH(req: Request) {
  return organizationPATCH(req);
}
