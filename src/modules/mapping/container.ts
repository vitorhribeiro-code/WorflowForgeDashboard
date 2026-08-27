// Composition root do M11 — único sítio que instancia deps reais e lê wiring.
import { db } from "@/db/client";
import { createDrizzleAudit } from "@/lib/audit.drizzle";
// M4 (catálogo de Tarefas) e M3 (catálogo de Ferramentas) — serviços reais.
import { taskService } from "@/modules/tasks";
import { toolService } from "@/modules/tools";
import { createMappingService } from "./service/mapping.service";
import type { TaskAuthoringPort, ToolResolverPort } from "./service/ports";

// --- Wiring cross-module (composition root: liga o M11 aos módulos reais) ---

// M4: criação de Task + required_tools sobre o taskService. O M4 valida a forma
// (config_schema, runtime conhecido, scopes ⊆ Tool) — o M11 só delega.
const authoring: TaskAuthoringPort = {
  async create(session, input) {
    const task = await taskService.create(session, {
      name: input.name,
      description: input.description,
      type: input.type,
      runtime: input.runtime,
      configSchema: input.configSchema,
      areaId: input.areaId,
    });
    return { id: task.id };
  },
  async setRequiredTools(session, taskId, items) {
    await taskService.setRequiredTools(session, taskId, items);
  },
  // Dedup (slice 2): Tasks da org com este runtime. O taskService.list já é
  // escopado por org e exige admin (a mesma sessão do convert). Filtramos o
  // runtime em memória — sem coluna nova, sem migração (BD mantém-se até 100).
  async findByRuntime(session, runtime) {
    const tasks = await taskService.list(session, {});
    return tasks
      .filter((t) => t.runtime === runtime)
      .map((t) => ({ id: t.id, name: t.name, runtime: t.runtime }));
  },
};

// M3: resolve a key da Tool → id. Tool é global (sem org) ⇒ sem sessão.
const tools: ToolResolverPort = {
  resolveKey: (key) => toolService.resolveKey(key),
};

export const mappingService = createMappingService({
  authoring,
  tools,
  audit: createDrizzleAudit(db),
});
