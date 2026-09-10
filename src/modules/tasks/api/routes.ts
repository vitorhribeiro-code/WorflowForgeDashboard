import { DomainError } from "@/lib/errors";
import { taskService } from "../container";
import type { TaskType } from "../domain/types";
import type { CardStatus, CardTemplate, TaskCard } from "../domain/card";
import {
  cardStatusSchema,
  createTaskSchema,
  generateCardSchema,
  listTasksQuerySchema,
  setCardSchema,
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
  const [task, publishability, published] = await Promise.all([
    taskService.get(session, taskId),
    taskService.publishability(session, taskId),
    taskService.isPublished(session, taskId),
  ]);
  return json({ task, publishability, published });
});

// PATCH /api/tasks/[id] — edita (admin).
export const taskPATCH = withSession(async (session, req, ctx) => {
  const input = await readJson(req, updateTaskSchema);
  return json(await taskService.update(session, id(ctx), input));
});

// DELETE /api/tasks/[id] — apaga (admin). 409 se tiver atribuições; ?force=1
// apaga em cascata (remove atribuições e o respetivo histórico de runs).
export const taskDELETE = withSession(async (session, req, ctx) => {
  const force = new URL(req.url).searchParams.get("force") === "1";
  await taskService.remove(session, id(ctx), { force });
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

// PUT /api/tasks/[id]/card — compõe/edita o cartão (admin). `card: null` limpa.
// A validação determinística (catálogo/envelope/ícones/status) é do domínio:
// `setCard` chama `validateCard` e devolve 422 INVALID_CARD se falhar.
export const cardPUT = withSession(async (session, req, ctx) => {
  const input = await readJson(req, setCardSchema);
  const card = (input.card ?? null) as TaskCard | null;
  return json(await taskService.setCard(session, id(ctx), card));
});

// POST /api/tasks/[id]/card/generate — gera a apresentação do cartão via IA
// (v43 + v44). Corpo opcional { template, instructions }; sem IA → 422
// CARD_AI_UNAVAILABLE. Persiste draft. `instructions` (v44) orienta a
// regeneração pelo editor por prompt; ausente ⇒ geração de raiz.
export const cardGeneratePOST = withSession(async (session, req, ctx) => {
  const input = await readJson(req, generateCardSchema);
  return json(
    await taskService.generateCard(
      session,
      id(ctx),
      input.template as CardTemplate | undefined,
      input.instructions ?? undefined,
    ),
  );
});

// POST /api/tasks/[id]/card/status — marca o estado do cartão (v44). Corpo
// { status?: "draft" | "ready" } (default "ready"). «Validar» (draft→ready)
// torna a apresentação visível ao trabalhador; «Voltar a rascunho» esconde-a.
// ORTOGONAL ao publish da tarefa (ver handoff v42 §2).
export const cardStatusPOST = withSession(async (session, req, ctx) => {
  const input = await readJson(req, cardStatusSchema);
  return json(await taskService.setCardStatus(session, id(ctx), input.status as CardStatus));
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
