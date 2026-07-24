// Composition root do M5 — único sítio que instancia deps reais e lê wiring.
import { db } from "@/db/client";
import { createDrizzleAudit } from "@/lib/audit.drizzle";
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

// --- Wiring cross-module (ligar aos módulos reais no composition root da app) ---

// M4: adaptador que combina taskCatalogPort.getTaskContext + required_tools.
// Substituir por um adaptador real sobre `@/modules/tasks` (o M4 já tem ambos).
const taskDeps: TaskDepsPort = {
  async getTaskContext() {
    throw new Error("Ligar TaskDepsPort ao M4 (taskCatalogPort + getRequiredTools)");
  },
  async getRequiredTools() {
    throw new Error("Ligar TaskDepsPort ao M4 (getRequiredTools)");
  },
};

// M6: prontidão de conexões. Substituir pela lógica exportada do M6.
const readiness: ReadinessPort = {
  async check() {
    throw new Error("Ligar ReadinessPort ao M6 (ready/missingScopes)");
  },
};

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
