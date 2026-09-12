import { runtimeCatalogService } from "../container";
import { createRuntimeSchema } from "../validation/runtime.schema";
import { json, readJson, withSession } from "./http";

// GET /api/runtimes — catálogo (built-in + generated). Qualquer sessão.
export const runtimesGET = withSession(async () => {
  return json(await runtimeCatalogService.list());
});

// POST /api/runtimes — cria runtime generated (admin; guard no serviço).
export const runtimesPOST = withSession(async (session, req) => {
  const input = await readJson(req, createRuntimeSchema);
  const rt = await runtimeCatalogService.create(session, {
    key: input.key,
    label: input.label,
    taskType: input.taskType,
    instruction: input.instruction,
    system: input.system,
  });
  return json(rt, { status: 201 });
});
