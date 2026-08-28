// Composition root do M5 — único sítio que instancia deps reais e lê wiring.
import { db } from "@/db/client";
import { createDrizzleAudit } from "@/lib/audit.drizzle";
import { taskCatalogPort } from "@/modules/tasks";
import { createDrizzleReadiness } from "@/platform/readiness/readiness.drizzle";
import { DrizzleAssignmentRepository } from "./data/assignment.repository";
import { DrizzleAreaMembershipRepository } from "./data/area-membership.repository";
import { createDrizzleWorkerDirectory } from "./infra/worker-directory.drizzle";
import { createAreaMembershipService } from "./service/area-membership.service";
import { DrizzleAreaRepository } from "@/modules/org/data/area.repository";
import {
  createAssignmentReadPort,
  createAssignmentService,
  createAssignmentSuspender,
} from "./service/assignment.service";
import type {
  ReadinessPort,
  TaskDepsPort,
  WritingStylePresencePort,
} from "./service/ports";
import { createAjvSchemaValidator } from "./infra/ajv-schema-validator";
import { createDrizzleWritingStyleRepository } from "@/modules/writing-styles/data/writing-style.repository";

const repo = new DrizzleAssignmentRepository(db);
const audit = createDrizzleAudit(db);

// --- Wiring cross-module (ports reais; a §4 do handoff avisa: sem stubs que lançam) ---

// M4: getTaskContext + getRequiredTools + listTasks, já prontos no catalogPort.
const taskDeps: TaskDepsPort = taskCatalogPort;

// M6 (seam): prontidão de conexões sobre worker_connections, sem precisar do M6.
const readiness: ReadinessPort = createDrizzleReadiness(db);

// §5.2 (selo): presença do .md de estilo do worker. Só devolve booleano — o
// conteúdo do estilo nunca sai daqui (a injeção real vive no runs/container).
const writingStyleRepo = createDrizzleWritingStyleRepository(db);
const writingStyle: WritingStylePresencePort = {
  async hasStyle(workerId) {
    const row = await writingStyleRepo.getByWorker(workerId);
    return Boolean(row && row.contentMd.trim());
  },
};

export const assignmentService = createAssignmentService({
  repo,
  taskDeps,
  readiness,
  schema: createAjvSchemaValidator(), // reutiliza o validador do M4
  workers: createDrizzleWorkerDirectory(db),
  audit,
  writingStyle,
  now: () => new Date(),
});

// Ports expostos.
export const assignmentSuspender = createAssignmentSuspender(repo, taskDeps, audit);
export const assignmentReadPort = createAssignmentReadPort(repo);

// --- Pertença a áreas (Slice 3a) ---
// areas.listIds via repo do M2; tasks.getOrg via taskCatalogPort (M4);
// workers via a mesma WorkerDirectory do M5.
const areaRepo = new DrizzleAreaRepository(db);
export const areaMembershipService = createAreaMembershipService({
  membership: new DrizzleAreaMembershipRepository(db),
  areas: {
    async listIds(orgId) {
      return (await areaRepo.list(orgId)).map((a) => a.id);
    },
  },
  tasks: {
    async getOrg(taskId) {
      return (await taskCatalogPort.getTaskContext(taskId))?.orgId ?? null;
    },
  },
  workers: createDrizzleWorkerDirectory(db),
  audit,
});
