// Recolhe runs + artefactos de um worker no período [start, end). Lê tabelas do M7/M8.
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { runArtifacts, runs, taskAssignments } from "@/db/schema";
import type { PeriodData } from "../domain/archive";
import type { PeriodSourcePort } from "../service/ports";

export function createPeriodSourceAdapter(db: PgDatabase<any, any, any>): PeriodSourcePort {
  return {
    async collect(workerId, start, end): Promise<PeriodData> {
      // Runs do worker cujo createdAt cai no período.
      const runRows = await db
        .select({
          runId: runs.id,
          status: runs.status,
          trigger: runs.trigger,
          finishedAt: runs.finishedAt,
        })
        .from(runs)
        .innerJoin(taskAssignments, eq(runs.assignmentId, taskAssignments.id))
        .where(
          and(
            eq(taskAssignments.workerId, workerId),
            gte(runs.createdAt, start),
            lt(runs.createdAt, end),
          ),
        );

      const runIds = runRows.map((r) => r.runId);
      const artRows =
        runIds.length === 0
          ? []
          : await db
              .select({
                id: runArtifacts.id,
                runId: runArtifacts.runId,
                filename: runArtifacts.filename,
                tier: runArtifacts.tier,
                location: runArtifacts.location,
                storageRef: runArtifacts.storageRef,
              })
              .from(runArtifacts)
              .where(inArray(runArtifacts.runId, runIds));

      return {
        runs: runRows.map((r) => ({
          runId: r.runId,
          status: r.status,
          trigger: r.trigger,
          finishedAt: r.finishedAt,
        })),
        artifacts: artRows.map((a) => ({
          id: a.id,
          runId: a.runId,
          filename: a.filename,
          tier: a.tier as "work_document" | "intermediate",
          location: a.location,
          storageRef: a.storageRef,
        })),
      };
    },
  };
}
