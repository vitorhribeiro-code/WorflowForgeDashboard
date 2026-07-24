// Lógica pura de prontidão: dado o que a Task exige e as conexões do worker,
// diz se está pronto e o que falta. Testável sem DB. Implementa a regra §6.
export type RequiredTool = { toolId: string; scopes: string[] };

export type ConnectionSnapshot = {
  toolId: string;
  status: "pending" | "connected" | "expired" | "revoked";
  grantedScopes: string[];
};

export type MissingReason = "no_connection" | "not_connected" | "missing_scopes";
export type MissingDep = { toolId: string; reason: MissingReason; missingScopes?: string[] };
export type ConnectionReadiness = { ready: boolean; missing: MissingDep[] };

export function evaluateReadiness(
  required: RequiredTool[],
  connections: ConnectionSnapshot[],
): ConnectionReadiness {
  const byTool = new Map(connections.map((c) => [c.toolId, c]));
  const missing: MissingDep[] = [];

  for (const req of required) {
    const conn = byTool.get(req.toolId);
    if (!conn) {
      missing.push({ toolId: req.toolId, reason: "no_connection" });
      continue;
    }
    if (conn.status !== "connected") {
      missing.push({ toolId: req.toolId, reason: "not_connected" });
      continue;
    }
    const granted = new Set(conn.grantedScopes);
    const lacking = req.scopes.filter((s) => !granted.has(s));
    if (lacking.length > 0) {
      missing.push({ toolId: req.toolId, reason: "missing_scopes", missingScopes: lacking });
    }
  }

  return { ready: missing.length === 0, missing };
}
