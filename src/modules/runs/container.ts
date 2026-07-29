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
import { builtinHandlers } from "./service/handlers/builtin";
import type { ArtifactSink, InputProvider } from "./service/ports";
import { getArtifactContainer } from "@/modules/artifacts/container";
import { getWorkerTokenPort } from "@/modules/connections";
import { createGmailAcquisition } from "@/platform/acquisition/gmail";
import { createGmailInputProvider } from "@/platform/acquisition/gmail-input-provider";

// Registo de handlers por runtime (email.digest, report.monthly, assistant.generic).
const HANDLERS: RunHandler[] = [...builtinHandlers];

let cached: RunsService | null = null;

export function getRunsService(): RunsService {
  if (cached) return cached;
  const env = loadEnv();

  // M7 ↔ M8: o log de um run é persistido como artefacto intermédio (JSON) pelo
  // service do M8. As shapes dos ports diferem (writeLog vs persist), por isso a
  // ponte é este adaptador, não um drop-in do artifactSink.
  const artifacts: ArtifactSink = {
    async writeLog(input) {
      await getArtifactContainer().service.persist({
        runId: input.runId,
        filename: `${input.name}.json`,
        mimeType: "application/json",
        tier: "intermediate",
        bytes: new TextEncoder().encode(JSON.stringify(input.body)),
      });
    },
    // Entregável final → tier work_document (cloud do worker via M6/M8).
    async writeDocument(input) {
      const a = await getArtifactContainer().service.persist({
        runId: input.runId,
        filename: input.filename,
        mimeType: input.mimeType,
        tier: "work_document",
        bytes: input.bytes,
      });
      return { id: a.id, storageRef: a.storageRef };
    },
  };

  const boss = new PgBoss({ connectionString: env.DATABASE_URL });

  // Aquisição a montante (Gmail → email.digest). Só liga se houver
  // ENCRYPTION_KEY (necessária para decifrar o token do M6). Sem ela, o motor
  // fica em pass-through — o comportamento de antes desta fatia.
  let inputProvider: InputProvider | undefined;
  if (env.ENCRYPTION_KEY) {
    const gmail = createGmailAcquisition();
    inputProvider = createGmailInputProvider({
      tokens: getWorkerTokenPort(),
      fetchRecentEmails: (token, opts) => gmail.fetchRecentEmails(token, opts),
    });
  }

  cached = createRunsService({
    repo: createDrizzleRunsRepository(db),
    queue: createPgBossQueue(boss),
    readiness: createDrizzleReadinessChecker(db),
    handlers: createHandlerRegistry(HANDLERS),
    artifacts,
    audit: createDrizzleAudit(db),
    inputProvider,
  });
  return cached;
}
