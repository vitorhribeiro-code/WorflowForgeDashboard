import type { Db } from "@/db/client";
import { and, eq, inArray } from "drizzle-orm";
import { taskRequiredTools, workerConnections } from "@/db/schema";
import { evaluateReadiness, type ConnectionReadiness, type ConnectionSnapshot } from "./readiness";

// O M7 consome um ReadinessChecker com assinatura `check(workerId, taskId)`:
// resolve internamente as required_tools da Task e verifica as conexões.
// (Difere do ReadinessPort do M5, que recebe já a lista de required tools.)
export interface ReadinessChecker {
  check(workerId: string, taskId: string): Promise<ConnectionReadiness>;
}

// Implementação sobre a BD: task_required_tools (M4) + worker_connections (M6).
export function createDrizzleReadinessChecker(db: Db): ReadinessChecker {
  return {
    async check(workerId: string, taskId: string) {
      const required = (
        await db
          .select({ toolId: taskRequiredTools.toolId, scopes: taskRequiredTools.scopes })
          .from(taskRequiredTools)
          .where(eq(taskRequiredTools.taskId, taskId))
      ).map((r) => ({ toolId: r.toolId, scopes: (r.scopes as string[]) ?? [] }));

      if (required.length === 0) return { ready: true, missing: [] };

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
            inArray(
              workerConnections.toolId,
              required.map((r) => r.toolId),
            ),
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
