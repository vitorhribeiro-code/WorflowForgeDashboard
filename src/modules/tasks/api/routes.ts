import { DomainError } from "@/lib/errors";
import { taskService } from "../container";
import type { TaskType } from "../domain/types";
import {
  createTaskSchema,
  listTasksQuerySchema,
  setRequiredToolsSchema,
  updateTaskSchema,
} from "../validation/schemas";
import { json, parse, queryOf, readJson, withSession } from "./http";

function id(ctx: { params: Record<string, string> }): string {
  const v = ctx.params.id;
  if (!v) throw new DomainError("BAD_INPUT", "id em falta", 400);
  return v;
}

// GET /api/tasks — lista (admin), filtrável por area/type.
export const tasksGET = withSession(async (session, req) => {
  const f = parse(listTasksQuerySchema, queryOf(req));
  return json(await taskService.list(session, { areaId: f.areaId, type: f.type as TaskType }));
});

// POST /api/tasks — cria Task (admin).
export const tasksPOST = withSession(async (session, req) => {
  const input = await readJson(req, createTaskSchema);
  const task = await taskService.create(session, {
    name: input.name,
    description: input.description ?? null,
    type: input.type as TaskType,
    runtime: input.runtime,
    areaId: input.areaId ?? null,
    configSchema: input.configSchema ?? null,
  });
  return json(task, { status: 201 });
});

// GET /api/tasks/[id] — detalhe + publicabilidade.
export const taskGET = withSession(async (session, _req, ctx) => {
  const taskId = id(ctx);
  const [task, publishability] = await Promise.all([
    taskService.get(session, taskId),
    taskService.publishability(session, taskId),
  ]);
  return json({ task, publishability });
});

// PATCH /api/tasks/[id] — edita (admin).
export const taskPATCH = withSession(async (session, req, ctx) => {
  const input = await readJson(req, updateTaskSchema);
  return json(await taskService.update(session, id(ctx), input));
});

// DELETE /api/tasks/[id] — apaga (admin). 409 se tiver atribuições.
export const taskDELETE = withSession(async (session, _req, ctx) => {
  await taskService.remove(session, id(ctx));
  return json({ ok: true });
});

// GET/PUT /api/tasks/[id]/required-tools — lista/substitui required_tools.
export const requiredToolsGET = withSession(async (session, _req, ctx) => {
  return json(await taskService.listRequiredTools(session, id(ctx)));
});
export const requiredToolsPUT = withSession(async (session, req, ctx) => {
  const input = await readJson(req, setRequiredToolsSchema);
  const items = input.items.map((i) => ({ toolId: i.toolId, scopes: i.scopes ?? [] }));
  return json(await taskService.setRequiredTools(session, id(ctx), items));
});

// POST /api/tasks/[id]/publish — publica; ?unpublish=1 despublica.
export const publishPOST = withSession(async (session, req, ctx) => {
  const taskId = id(ctx);
  const unpublish = new URL(req.url).searchParams.get("unpublish") === "1";
  if (unpublish) {
    await taskService.unpublish(session, taskId);
    return json({ published: false });
  }
  const result = await taskService.publish(session, taskId);
  return json({ published: true, publishability: result });
});
