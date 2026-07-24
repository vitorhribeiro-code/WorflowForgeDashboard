// Diretório de trabalhadores (M2/users). Resolve org e lista workers.
import { and, eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { users } from "@/db/schema";
import type { WorkerDirectoryPort, WorkerRef } from "../service/ports";

export function createWorkerDirectoryAdapter(db: PgDatabase<any, any, any>): WorkerDirectoryPort {
  return {
    async getWorker(workerId): Promise<WorkerRef | null> {
      const [row] = await db
        .select({ workerId: users.id, orgId: users.organizationId })
        .from(users)
        .where(eq(users.id, workerId))
        .limit(1);
      return row ?? null;
    },

    async listWorkerIds(orgId): Promise<string[]> {
      const where = orgId
        ? and(eq(users.role, "worker"), eq(users.organizationId, orgId))
        : eq(users.role, "worker");
      const rows = await db.select({ id: users.id }).from(users).where(where);
      return rows.map((r) => r.id);
    },
  };
}
