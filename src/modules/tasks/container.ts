// Composition root do M4 — único sítio que instancia deps reais e lê wiring.
import { db } from "@/db/client";
import { createDrizzleAudit } from "@/lib/audit.drizzle";
import { DrizzleTaskRepository } from "./data/task.repository";
import { createAjvSchemaValidator } from "./infra/ajv-schema-validator";
import { createDrizzlePublication } from "./infra/publication.drizzle";
import { createTaskCatalogPort, createTaskService } from "./service/task.service";
import type { ToolCatalogPort } from "./service/ports";

const repo = new DrizzleTaskRepository(db);
const publication = createDrizzlePublication(db);

// --- Wiring cross-module (ligar aos módulos reais no composition root da app) ---

// M3: o toolCatalogPort do M3 é estruturalmente compatível com o do M4.
// Substituir este stub por `import { toolCatalogPort } from "@/modules/tools"`.
const toolCatalog: ToolCatalogPort = {
  async getAvailableScopes() {
    throw new Error("Ligar ToolCatalogPort ao M3 (toolCatalogPort)");
  },
  async assertScopesAvailable() {
    throw new Error("Ligar ToolCatalogPort ao M3 (toolCatalogPort)");
  },
};

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
