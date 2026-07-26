// Composition root do M4 — único sítio que instancia deps reais e lê wiring.
import { db } from "@/db/client";
import { createDrizzleAudit } from "@/lib/audit.drizzle";
import { DrizzleTaskRepository } from "./data/task.repository";
import { createAjvSchemaValidator } from "./infra/ajv-schema-validator";
import { createDrizzlePublication } from "./infra/publication.drizzle";
import { createTaskCatalogPort, createTaskService } from "./service/task.service";
// M3: port cross-module real (getAvailableScopes + assertScopesAvailable),
// estruturalmente compatível com o ToolCatalogPort do M4. Sem import circular:
// o M3 não depende do M4.
import { toolCatalogPort } from "@/modules/tools";

const repo = new DrizzleTaskRepository(db);
const publication = createDrizzlePublication(db);

// --- Wiring cross-module ---
const toolCatalog = toolCatalogPort;

// M7: registo de runtimes com handler. Substituir pela lista/registo real.
const isKnownRuntime = (runtime: string): boolean =>
  new Set(["email.digest", "report.monthly", "assistant.generic"]).has(runtime);

export const taskService = createTaskService({
  repo,
  tools: toolCatalog,
  schema: createAjvSchemaValidator(),
  isKnownRuntime,
  publication,
  audit: createDrizzleAudit(db),
});

// Port exposto ao M5.
export const taskCatalogPort = createTaskCatalogPort(repo, publication);
