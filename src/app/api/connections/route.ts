import { connectionsGET, connectionsPOST } from "@/modules/connections/api/routes";

// GET  /api/connections — "As minhas conexões" (estado por ferramenta exigida).
export function GET(req: Request) {
  return connectionsGET(req);
}
// POST /api/connections — inicia OAuth; devolve o URL de consentimento.
export function POST(req: Request) {
  return connectionsPOST(req);
}
