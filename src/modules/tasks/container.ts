// Composition root do M4 — único sítio que instancia deps reais e lê wiring.
import { db } from "@/db/client";
import { createDrizzleAudit } from "@/lib/audit.drizzle";
import { DrizzleTaskRepository } from "./data/task.repository";
import { createAjvSchemaValidator } from "./infra/ajv-schema-validator";
import { createDrizzlePublication } from "./infra/publication.drizzle";
import { createTaskCatalogPort, createTaskService } from "./service/task.service";
// M7/v50: o isKnownRuntime passou a ser built-in (RUNTIME_KEYS, code-backed) OU
// catálogo na BD (runtimes generated). RUNTIME_KEYS continua a ser a fonte-de-
// verdade dos 4 de fábrica; o catálogo ACRESCENTA os criados na app.
import { RUNTIME_KEYS } from "./domain/runtimes";
import { createRuntimeRegistry } from "./service/runtime-registry";
import { createDrizzleRuntimeCatalog } from "./data/runtime-catalog.repository";
// M3: port cross-module real (getAvailableScopes + assertScopesAvailable),
// estruturalmente compatível com o ToolCatalogPort do M4. Sem import circular:
// o M3 não depende do M4.
import { toolCatalogPort } from "@/modules/tools";
// v43: geração do cartão via IA. Adapta o LlmResolver do módulo `ai` ao porto
// estreito CardLlmPort. Guarded: sem ENCRYPTION_KEY → null (sem IA, 422 no serviço).
import { getLlmResolver } from "@/modules/ai/container";
import { createCardLlmPort } from "./infra/card-llm";

const repo = new DrizzleTaskRepository(db);
const publication = createDrizzlePublication(db);
const isKnownRuntime = createRuntimeRegistry(RUNTIME_KEYS, createDrizzleRuntimeCatalog(db));

// --- Wiring cross-module ---
const toolCatalog = toolCatalogPort;
const cardLlm = createCardLlmPort(() => {
  try {
    return getLlmResolver();
  } catch {
    return null;
  }
});

export const taskService = createTaskService({
  repo,
  tools: toolCatalog,
  schema: createAjvSchemaValidator(),
  isKnownRuntime,
  publication,
  audit: createDrizzleAudit(db),
  llm: cardLlm,
});

// Port exposto ao M5.
export const taskCatalogPort = createTaskCatalogPort(repo, publication);
