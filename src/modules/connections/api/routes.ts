import { DomainError } from "@/lib/errors";
import { getConnectionsService } from "../container";
import { startConnectionSchema } from "../validation/connections.schema";
import { json, readJson, withSession } from "./http";

function toolId(ctx: { params: Record<string, string> }): string {
  const v = ctx.params.toolId;
  if (!v) throw new DomainError("BAD_INPUT", "toolId em falta", 400);
  return v;
}

// GET /api/connections — "As minhas conexões" (estado por ferramenta exigida).
export const connectionsGET = withSession(async (session) => {
  return json(await getConnectionsService().listMyConnections(session));
});

// POST /api/connections — inicia OAuth; devolve o URL de consentimento.
export const connectionsPOST = withSession(async (session, req) => {
  const { toolId } = await readJson(req, startConnectionSchema);
  return json(await getConnectionsService().startConnection(session, toolId));
});

// POST /api/connections/[toolId]/renew — refresh silencioso ou reauth_required.
export const renewPOST = withSession(async (session, _req, ctx) => {
  return json(await getConnectionsService().renewConnection(session, toolId(ctx)));
});

// POST /api/connections/[toolId]/revoke — revoga e suspende atribuições dependentes.
export const revokePOST = withSession(async (session, _req, ctx) => {
  return json(await getConnectionsService().revokeConnection(session, toolId(ctx)));
});
