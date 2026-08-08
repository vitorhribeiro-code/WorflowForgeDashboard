import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { users, writingStyles } from "@/db/schema";

export type WritingStyleRow = {
  workerId: string;
  contentMd: string;
  sourceFilename: string | null;
  updatedAt: Date;
};

export interface WritingStyleRepository {
  // O alvo tem de ser um worker DESTA org (isolamento tenant + escopo por papel).
  workerInOrg(orgId: string, workerId: string): Promise<boolean>;
  getByWorker(workerId: string): Promise<WritingStyleRow | null>;
  upsert(input: {
    workerId: string;
    contentMd: string;
    sourceFilename: string;
    updatedBy: string;
  }): Promise<WritingStyleRow>;
}

export function createDrizzleWritingStyleRepository(db: Db): WritingStyleRepository {
  return {
    async workerInOrg(orgId, workerId) {
      const [row] = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.id, workerId),
            eq(users.organizationId, orgId),
            eq(users.role, "worker"),
          ),
        )
        .limit(1);
      return Boolean(row);
    },

    async getByWorker(workerId) {
      const [row] = await db
        .select({
          workerId: writingStyles.workerId,
          contentMd: writingStyles.contentMd,
          sourceFilename: writingStyles.sourceFilename,
          updatedAt: writingStyles.updatedAt,
        })
        .from(writingStyles)
        .where(eq(writingStyles.workerId, workerId))
        .limit(1);
      return row ?? null;
    },

    async upsert({ workerId, contentMd, sourceFilename, updatedBy }) {
      const [row] = await db
        .insert(writingStyles)
        .values({ workerId, contentMd, sourceFilename, updatedBy })
        .onConflictDoUpdate({
          target: writingStyles.workerId,
          set: { contentMd, sourceFilename, updatedBy, updatedAt: new Date() },
        })
        .returning({
          workerId: writingStyles.workerId,
          contentMd: writingStyles.contentMd,
          sourceFilename: writingStyles.sourceFilename,
          updatedAt: writingStyles.updatedAt,
        });
      return row!;
    },
  };
}
