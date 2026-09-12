// Composition root do M7 (RECONSTRUÍDO). Liga o serviço aos adaptadores de
// plataforma: fila pg-boss, readiness sobre a BD, e o registo de handlers.
// O `artifacts` (ArtifactSink) e os `handlers` são os seams a ligar ao M8 e
// aos runtimes reais.
import { db } from "@/db/client";
import { createDrizzleAudit } from "@/lib/audit.drizzle";
import { PgBoss } from "pg-boss";
import { bossOptions, createPgBossQueue } from "@/platform/queue/run-queue";
import { createDrizzleReadinessChecker } from "@/platform/readiness/readiness-checker.drizzle";
import { loadEnv } from "@/platform/config/env";
import { createDrizzleRunsRepository } from "./data/runs.repository";
import { createRunsService, type RunsService } from "./service/runs.service";
import { createHandlerRegistry, type RunHandler } from "./service/handlers/handler";
import {
  builtinHandlers,
  createAssistantGenericHandler,
  createAssistantWritingHandler,
  createReportMonthlyHandler,
} from "./service/handlers/builtin";
import type { ArtifactSink, InputProvider } from "./service/ports";
import { getArtifactContainer } from "@/modules/artifacts/container";
import { getWorkerTokenPort } from "@/modules/connections";
import { createGmailAcquisition } from "@/platform/acquisition/gmail";
import { createGmailInputProvider } from "@/platform/acquisition/gmail-input-provider";
import { createReportMetricsInputProvider } from "@/platform/acquisition/report-metrics-input-provider";
import { createDrizzleReportMetricsSource } from "@/platform/acquisition/report-metrics";
import { createEmailEnrichmentProvider } from "@/platform/ai/email-enrichment";
import { getLlmResolver } from "@/modules/ai/container";
import type { LlmResolver } from "@/modules/ai/service/resolver";
import { DrizzleAssignmentRepository } from "@/modules/assignments/data/assignment.repository";
import { createDrizzleWritingStyleRepository } from "@/modules/writing-styles/data/writing-style.repository";

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
        idempotencyKey: input.idempotencyKey,
      });
      return { id: a.id, storageRef: a.storageRef };
    },
    // Append a um ficheiro vivo do trabalhador (ex.: resumos da semana).
    async appendWeekly(input) {
      const { workerId, ...rest } = input;
      return getArtifactContainer().service.appendWorkerDocument(workerId, rest);
    },
  };

  // Lado WEB (serverless): o boss só ENFILEIRA. O teto de ligações e os flags
  // supervise/schedule OFF vivem em `bossOptions("web")` (política centralizada
  // e testada — ver run-queue.ts). O listener de `error` evita que um erro do
  // pg-boss vire unhandled rejection (era isto que dava `exit 128` no Vercel).
  const boss = new PgBoss(bossOptions(env.DATABASE_URL, "web"));
  boss.on("error", (e) => console.error("[pg-boss:web]", e));

  // Cadeia de aquisição de EMAIL (Gmail → enriquecimento por IA). Só liga se
  // houver ENCRYPTION_KEY (decifra o token do M6 e as chaves de LLM). Sem ela,
  // fica em pass-through para o email.digest — como antes.
  // Resolver de IA: idem (null → handler cai no scaffold; enrich em pass-through).
  let llmResolver: LlmResolver | null = null;
  let emailChain: InputProvider | undefined;
  if (env.ENCRYPTION_KEY) {
    llmResolver = getLlmResolver();
    const gmail = createGmailAcquisition();
    const gmailProvider = createGmailInputProvider({
      tokens: getWorkerTokenPort(),
      fetchRecentEmails: (token, opts) => gmail.fetchRecentEmails(token, opts),
    });
    // Enriquecimento por IA a montante (§5.2 fase 3): dá a cada email um `resumo`
    // via o resolver da org, com fallback ao snippet/assunto.
    emailChain = createEmailEnrichmentProvider({
      resolver: llmResolver,
      inner: gmailProvider,
    });
  }

  // Métricas REAIS a montante do report.monthly (v49): conta runs/artefactos do
  // worker no período e injeta `sections` reais (deixou de vir da config). Só
  // precisa da BD (sem crypto) → decorator EXTERIOR sempre ligado; pass-through
  // nos outros runtimes, delegando na cadeia de email (ou num pass-through).
  const passthrough: InputProvider = { async resolve(ctx) { return ctx.base; } };
  const inputProvider: InputProvider = createReportMetricsInputProvider({
    inner: emailChain ?? passthrough,
    metrics: createDrizzleReportMetricsSource(db),
  });

  // Registo de handlers por runtime. Os built-in são puros (só email.digest); o
  // report.monthly (v47), o assistant.generic (v46) e o assistant.writing (§5.4
  // opção a) recebem o resolver injetado — a chamada `complete` é dentro do
  // handler, com fallback a scaffold quando não há IA configurada.
  const handlers: RunHandler[] = [
    ...builtinHandlers,
    createReportMonthlyHandler({ resolver: llmResolver }),
    createAssistantGenericHandler({ resolver: llmResolver }),
    createAssistantWritingHandler({ resolver: llmResolver }),
  ];

  // Estilo de escrita a montante das assistidas (§5.2 Fatia 3): quando a
  // atribuição tem "usar estilo" ligado e o worker tem um .md, entra no input.
  const assignmentsRepo = new DrizzleAssignmentRepository(db);
  const writingStyleRepo = createDrizzleWritingStyleRepository(db);
  const writingStyle = {
    async resolveForAssistedRun(assignmentId: string, workerId: string): Promise<string | null> {
      const a = await assignmentsRepo.getById(assignmentId);
      if (!a?.useWritingStyle) return null;
      const row = await writingStyleRepo.getByWorker(workerId);
      return row?.contentMd ?? null;
    },
  };

  cached = createRunsService({
    repo: createDrizzleRunsRepository(db),
    queue: createPgBossQueue(boss),
    readiness: createDrizzleReadinessChecker(db),
    handlers: createHandlerRegistry(handlers),
    artifacts,
    audit: createDrizzleAudit(db),
    inputProvider,
    writingStyle,
  });
  return cached;
}
