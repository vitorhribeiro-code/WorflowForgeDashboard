import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { workerConnections } from "@/db/schema";
import type { ReadinessPort } from "@/modules/assignments/service/ports";
import { evaluateReadiness, type ConnectionSnapshot, type RequiredTool } from "./readiness";

// Implementação REAL do ReadinessPort (M5) sobre a BD — sem precisar do código
// do M6. Lê as worker_connections do worker para as tools exigidas e aplica a
// regra pura. Desbloqueia o toggle do M5.
export function createDrizzleReadiness(db: Db): ReadinessPort {
  return {
    async check(workerId: string, required: RequiredTool[]) {
      if (required.length === 0) return { ready: true, missing: [] };

      const toolIds = required.map((r) => r.toolId);
      const rows = await db
        .select({
          toolId: workerConnections.toolId,
          status: workerConnections.status,
          grantedScopes: workerConnections.grantedScopes,
        })
        .from(workerConnections)
        .where(
          and(
            eq(workerConnections.workerId, workerId),
            inArray(workerConnections.toolId, toolIds),
          ),
        );

      const snapshots: ConnectionSnapshot[] = rows.map((r) => ({
        toolId: r.toolId,
        status: r.status,
        grantedScopes: (r.grantedScopes as string[]) ?? [],
      }));

      return evaluateReadiness(required, snapshots);
    },
  };
}
