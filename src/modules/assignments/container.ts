// Composition root do M5 — único sítio que instancia deps reais e lê wiring.
import { db } from "@/db/client";
import { createDrizzleAudit } from "@/lib/audit.drizzle";
import { taskCatalogPort } from "@/modules/tasks";
import { createDrizzleReadiness } from "@/platform/readiness/readiness.drizzle";
import { DrizzleAssignmentRepository } from "./data/assignment.repository";
import { createDrizzleWorkerDirectory } from "./infra/worker-directory.drizzle";
import {
  createAssignmentReadPort,
  createAssignmentService,
  createAssignmentSuspender,
} from "./service/assignment.service";
import type { ReadinessPort, TaskDepsPort } from "./service/ports";
import { createAjvSchemaValidator } from "./infra/ajv-schema-validator";

const repo = new DrizzleAssignmentRepository(db);
const audit = createDrizzleAudit(db);

// --- Wiring cross-module (ports reais; a §4 do handoff avisa: sem stubs que lançam) ---

// M4: getTaskContext + getRequiredTools + listTasks, já prontos no catalogPort.
const taskDeps: TaskDepsPort = taskCatalogPort;

// M6 (seam): prontidão de conexões sobre worker_connections, sem precisar do M6.
const readiness: ReadinessPort = createDrizzleReadiness(db);

export const assignmentService = createAssignmentService({
  repo,
  taskDeps,
  readiness,
  schema: createAjvSchemaValidator(), // reutiliza o validador do M4
  workers: createDrizzleWorkerDirectory(db),
  audit,
  now: () => new Date(),
});

// Ports expostos.
export const assignmentSuspender = createAssignmentSuspender(repo, taskDeps, audit);
export const assignmentReadPort = createAssignmentReadPort(repo);
