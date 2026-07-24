// Adaptador RunContextPort: resolve worker/org de um run.
// Lê tabelas de outros módulos por JOIN só-leitura (não importa os repos do M7).
// Se preferires acoplamento zero, expõe um RunContextPort no próprio M7 e injeta-o aqui.
import { eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { runs, taskAssignments, users } from "@/db/schema";
import type { RunContext, RunContextPort } from "../service/ports";

export function createRunContextAdapter(db: PgDatabase<any, any, any>): RunContextPort {
  return {
    async getRunContext(runId: string): Promise<RunContext | null> {
      const [row] = await db
        .select({
          runId: runs.id,
          workerId: taskAssignments.workerId,
          orgId: users.organizationId,
        })
        .from(runs)
        .innerJoin(taskAssignments, eq(runs.assignmentId, taskAssignments.id))
        .innerJoin(users, eq(taskAssignments.workerId, users.id))
        .where(eq(runs.id, runId))
        .limit(1);
      return row ?? null;
    },
  };
}
