import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { users } from "@/db/schema";
import type { WorkerDirectoryPort } from "../service/ports";

// Adaptador Drizzle sobre `users`. Quando o M2 existir, substituir pelo port dele.
export function createDrizzleWorkerDirectory(db: Db): WorkerDirectoryPort {
  return {
    async getWorkerOrg(workerId: string): Promise<string | null> {
      const [row] = await db
        .select({ orgId: users.organizationId })
        .from(users)
        .where(eq(users.id, workerId))
        .limit(1);
      return row?.orgId ?? null;
    },
    // Colunas da matriz: só workers (o admin não é uma coluna).
    async listWorkers(orgId: string) {
      const rows = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(and(eq(users.organizationId, orgId), eq(users.role, "worker")))
        .orderBy(asc(users.email));
      return rows.map((r) => ({ id: r.id, email: r.email }));
    },
  };
}
