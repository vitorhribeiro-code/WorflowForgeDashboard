// ========================================================================== //
//  COMPOSITION ROOT DA APLICAÇÃO                                              //
//  Único sítio que instancia deps reais e liga os módulos entre si pelos      //
//  ports. Substitui os `container.ts` de exemplo de cada módulo (que têm      //
//  stubs). Ordem: base → M2 → M1 → M3 → M6* → M4 → M7*/M8*/M9* → M5 → M10 → M11 //
//  (* = seam para módulos do handoff, ligar quando integrados)                //
// ========================================================================== //
import { db } from "@/db/client";
import { createDrizzleAudit } from "@/lib/audit.drizzle";
import type { SessionContext } from "@/lib/session";

/* -- M2 Organização/Áreas/Utilizadores ------------------------------------- */
import { DrizzleOrganizationRepository } from "@/modules/org/data/organization.repository";
import { DrizzleAreaRepository } from "@/modules/org/data/area.repository";
import { DrizzleUserRepository } from "@/modules/org/data/user.repository";
import { createOrganizationService } from "@/modules/org/service/organization.service";
import { createAreaService } from "@/modules/org/service/area.service";
import { createUserService } from "@/modules/org/service/user.service";
import { createUserDirectory } from "@/modules/org/infra/directory";
import { createDrizzleWorkerDirectory } from "@/modules/assignments/infra/worker-directory.drizzle";

/* -- M1 Autenticação ------------------------------------------------------- */
import { createAuthService } from "@/modules/auth/service/auth.service";
import {
  createDrizzleCredentialStore,
  createDrizzleResetTokenStore,
} from "@/modules/auth/infra/stores.drizzle";
import { createConsoleMailer, createTokenIssuer } from "@/modules/auth/infra/token-issuer";
import { createSmtpMailer, smtpTransporterFromEnv } from "@/platform/mail/smtp-mailer";

/* -- M3 Ferramentas -------------------------------------------------------- */
import { DrizzleToolRepository } from "@/modules/tools/data/tool.repository";
import { createToolCatalogPort, createToolService } from "@/modules/tools/service/tool.service";

/* -- M4 Catálogo de Tarefas ------------------------------------------------ */
import { DrizzleTaskRepository } from "@/modules/tasks/data/task.repository";
import { createAjvSchemaValidator } from "@/modules/tasks/infra/ajv-schema-validator";
import { createDrizzlePublication } from "@/modules/tasks/infra/publication.drizzle";
import { createTaskCatalogPort, createTaskService } from "@/modules/tasks/service/task.service";

/* -- M5 Atribuições/Toggle ------------------------------------------------- */
import { DrizzleAssignmentRepository } from "@/modules/assignments/data/assignment.repository";
import { createAjvSchemaValidator as createM5Validator } from "@/modules/assignments/infra/ajv-schema-validator";
import {
  createAssignmentReadPort,
  createAssignmentService,
  createAssignmentSuspender,
} from "@/modules/assignments/service/assignment.service";

/* -- M10 Auditoria/Analytics ----------------------------------------------- */
import { DrizzleAuditQueryRepository } from "@/modules/audit/data/audit-query.repository";
import { DrizzleMetricsRepository } from "@/modules/audit/data/metrics.repository";
import { createAuditService } from "@/modules/audit/service/audit.service";
import { createMetricsService } from "@/modules/audit/service/metrics.service";

/* -- M11 Mapeamento/Onboarding --------------------------------------------- */
import { createMappingService } from "@/modules/mapping/service/mapping.service";

// -------------------------------------------------------------------------- //
//  0. Base                                                                    //
// -------------------------------------------------------------------------- //
const audit = createDrizzleAudit(db);
const now = () => new Date();

function requireEnv(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`${name} em falta`);
  return v;
}
const AUTH_SECRET = requireEnv("AUTH_SECRET", "dev-secret-mudar-em-producao");
const SESSION_TTL = Number(process.env.SESSION_TTL_SECONDS ?? 60 * 60 * 8);
const BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:3000";

// Registo de runtimes com handler — fonte única partilhada por M4 (catálogo) e
// pela UI (dropdown). Ao ligar o registo real do M7, derivar as duas daqui.
import { isKnownRuntime } from "@/modules/tasks/domain/runtimes";

// -------------------------------------------------------------------------- //
//  M2 — não depende de ninguém; produz as directories que M1/M5/M9 consomem   //
// -------------------------------------------------------------------------- //
const userRepo = new DrizzleUserRepository(db);
const userDirectory = createUserDirectory(userRepo); // → M1
const workerDirectory = createDrizzleWorkerDirectory(db); // → M5 (getWorkerOrg + listWorkers)

export const organizationService = createOrganizationService({
  repo: new DrizzleOrganizationRepository(db),
  audit,
});
export const areaService = createAreaService({ repo: new DrizzleAreaRepository(db), audit });
export const userService = createUserService({ repo: userRepo, audit });

// -------------------------------------------------------------------------- //
//  M1 — usa a UserDirectory do M2                                             //
// -------------------------------------------------------------------------- //
// Mailer: SMTP se configurado, senão consola (dev).
const mailer = process.env.SMTP_HOST
  ? createSmtpMailer(smtpTransporterFromEnv(), { from: process.env.MAIL_FROM ?? "no-reply@localhost", baseUrl: BASE_URL })
  : createConsoleMailer(BASE_URL);

export const authService = createAuthService({
  users: userDirectory,
  credentials: createDrizzleCredentialStore(db),
  resets: createDrizzleResetTokenStore(db),
  tokenIssuer: createTokenIssuer(AUTH_SECRET, now, SESSION_TTL),
  mailer,
  audit,
  now,
});

// -------------------------------------------------------------------------- //
//  M3 — catálogo global; produz toolCatalog (→M4) e toolResolver (→M11)       //
// -------------------------------------------------------------------------- //
const toolRepo = new DrizzleToolRepository(db);
export const toolService = createToolService({ repo: toolRepo, audit });
const toolCatalog = createToolCatalogPort(toolRepo); // getAvailableScopes + assertScopesAvailable
const toolResolver = {
  async resolveKey(key: string): Promise<string | null> {
    return (await toolRepo.getByKey(key))?.id ?? null;
  },
};

// -------------------------------------------------------------------------- //
//  M6* — Conexões (handoff). ReadinessPort ligado à BD (worker_connections)   //
//  via platform/readiness — desbloqueia o toggle do M5 sem o código do M6.     //
//  Quando o M6 estiver integrado, pode substituir-se pelo readinessChecker     //
//  dele (que também trata refresh/estado); a regra é a mesma.                  //
// -------------------------------------------------------------------------- //
import { createDrizzleReadiness } from "@/platform/readiness/readiness.drizzle";
const readinessPort = createDrizzleReadiness(db);

// -------------------------------------------------------------------------- //
//  M4 — usa toolCatalog (M3), isKnownRuntime (M7), publication (próprio)       //
// -------------------------------------------------------------------------- //
const taskRepo = new DrizzleTaskRepository(db);
const publication = createDrizzlePublication(db); // migração: tasks.published
export const taskService = createTaskService({
  repo: taskRepo,
  tools: toolCatalog,
  schema: createAjvSchemaValidator(),
  isKnownRuntime,
  publication,
  audit,
});
const taskCatalog = createTaskCatalogPort(taskRepo, publication); // getTaskContext + getRequiredTools → M5

// -------------------------------------------------------------------------- //
//  M5 — usa taskCatalog (M4), readiness (M6), workerDirectory (M2), ajv        //
// -------------------------------------------------------------------------- //
const assignmentRepo = new DrizzleAssignmentRepository(db);
export const assignmentService = createAssignmentService({
  repo: assignmentRepo,
  taskDeps: taskCatalog,
  readiness: readinessPort,
  schema: createM5Validator(),
  workers: workerDirectory,
  audit,
  now,
});
// Ports expostos pelo M5 (consumidos por M4/M6 e M7).
export const assignmentSuspender = createAssignmentSuspender(assignmentRepo, taskCatalog, audit);
export const assignmentReadPort = createAssignmentReadPort(assignmentRepo); // → M7

// -------------------------------------------------------------------------- //
//  Orquestração cross-cutting (evita dependência circular M4↔M5)              //
//  A propagação "despublicar/revogar → suspende" é composta AQUI, não dentro   //
//  do M4/M6, mantendo os módulos desacoplados.                                 //
// -------------------------------------------------------------------------- //
export async function unpublishTaskAndSuspend(session: SessionContext, taskId: string): Promise<void> {
  await taskService.unpublish(session, taskId);
  await assignmentSuspender.suspendForTask(taskId);
}
// Chamar a partir do M6 quando uma conexão é revogada/expira:
export async function onConnectionRevoked(workerId: string, toolId: string): Promise<number> {
  return assignmentSuspender.suspendForWorkerTool(workerId, toolId);
}

// -------------------------------------------------------------------------- //
//  M10 — leitura analítica; sem cross-deps                                    //
// -------------------------------------------------------------------------- //
export const auditService = createAuditService({ repo: new DrizzleAuditQueryRepository(db) });
export const metricsService = createMetricsService({
  repo: new DrizzleMetricsRepository(db),
  now,
});

// -------------------------------------------------------------------------- //
//  M11 — usa o taskService (M4) e o toolResolver (M3)                          //
// -------------------------------------------------------------------------- //
export const mappingService = createMappingService({
  authoring: {
    async create(session, input) {
      const t = await taskService.create(session, input);
      return { id: t.id };
    },
    async setRequiredTools(session, taskId, items) {
      await taskService.setRequiredTools(session, taskId, items);
    },
    // Dedup (slice 2): Tasks da org com este runtime, filtradas em memória.
    async findByRuntime(session, runtime) {
      const tasks = await taskService.list(session, {});
      return tasks
        .filter((t) => t.runtime === runtime)
        .map((t) => ({ id: t.id, name: t.name, runtime: t.runtime }));
    },
  },
  tools: toolResolver,
  audit,
});

// -------------------------------------------------------------------------- //
//  Tier 1 — M6–M9 (integrados)                                                //
//  Estes módulos auto-ligam-se pelos seus container.ts (lazy singletons que   //
//  as rotas consomem via get*Service/get*Container), não por este root:        //
//  - M6: readinessPort (acima); conexões via getConnectionsService()           //
//  - M7: getRunsService() — fila pg-boss + readiness + ArtifactSink→M8         //
//  - M8: getArtifactContainer() — StorageConnectionPort (ponte M6) + S3/memória //
//  - M9: getArchiveContainer() — artifacts=m8.service (markArchived) + S3       //
//  memory→S3 é escolhido por env (platform/storage/s3-client); sem S3 cai em    //
//  memória. Falta só o registo de SDKs de cloud (upload real) — infra Tier-2.   //
// -------------------------------------------------------------------------- //
export const services = {
  authService,
  organizationService,
  areaService,
  userService,
  toolService,
  taskService,
  assignmentService,
  auditService,
  metricsService,
  mappingService,
};
