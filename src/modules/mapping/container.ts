// Composition root do M11 — único sítio que instancia deps reais e lê wiring.
import { db } from "@/db/client";
import { createDrizzleAudit } from "@/lib/audit.drizzle";
import { createMappingService } from "./service/mapping.service";
import type { TaskAuthoringPort, ToolResolverPort } from "./service/ports";

// --- Wiring cross-module (ligar aos módulos reais no composition root da app) ---

// M4: criação de Task + required_tools. Substituir por adaptador sobre o
// taskService do M4 (create + setRequiredTools já existem lá).
const authoring: TaskAuthoringPort = {
  async create() {
    throw new Error("Ligar TaskAuthoringPort ao M4 (taskService.create)");
  },
  async setRequiredTools() {
    throw new Error("Ligar TaskAuthoringPort ao M4 (taskService.setRequiredTools)");
  },
};

// M3: resolução de key → id. Substituir por adaptador sobre o repo/serviço do M3.
const tools: ToolResolverPort = {
  async resolveKey() {
    throw new Error("Ligar ToolResolverPort ao M3 (getByKey)");
  },
};

export const mappingService = createMappingService({
  authoring,
  tools,
  audit: createDrizzleAudit(db),
});
