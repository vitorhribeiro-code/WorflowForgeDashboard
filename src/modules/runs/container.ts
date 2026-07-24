// Composition root do M7 (RECONSTRUÍDO). Liga o serviço aos adaptadores de
// plataforma: fila pg-boss, readiness sobre a BD, e o registo de handlers.
// O `artifacts` (ArtifactSink) e os `handlers` são os seams a ligar ao M8 e
// aos runtimes reais.
import { db } from "@/db/client";
import { createDrizzleAudit } from "@/lib/audit.drizzle";
import { PgBoss } from "pg-boss";
import { createPgBossQueue } from "@/platform/queue/run-queue";
import { createDrizzleReadinessChecker } from "@/platform/readiness/readiness-checker.drizzle";
import { loadEnv } from "@/platform/config/env";
import { createDrizzleRunsRepository } from "./data/runs.repository";
import { createRunsService, type RunsService } from "./service/runs.service";
import { createHandlerRegistry, type RunHandler } from "./service/handlers/handler";
import type { ArtifactSink } from "./service/ports";

// Registo de handlers por runtime — preencher com os handlers reais.
const HANDLERS: RunHandler[] = [];

let cached: RunsService | null = null;

export function getRunsService(): RunsService {
  if (cached) return cached;
  const env = loadEnv();

  // ArtifactSink → M8 (container.artifactSink). Placeholder best-effort até ligar.
  const artifacts: ArtifactSink = {
    async writeLog(input) {
      console.info(`[artifacts] log do run ${input.runId} (${input.name}) — ligar ao M8`);
    },
  };

  const boss = new PgBoss({ connectionString: env.DATABASE_URL });

  cached = createRunsService({
    repo: createDrizzleRunsRepository(db),
    queue: createPgBossQueue(boss),
    readiness: createDrizzleReadinessChecker(db),
    handlers: createHandlerRegistry(HANDLERS),
    artifacts,
    audit: createDrizzleAudit(db),
  });
  return cached;
}
