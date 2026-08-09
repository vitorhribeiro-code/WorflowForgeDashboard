import { DomainError } from "@/lib/errors";
import { assignmentService } from "../container";
import {
  createAssignmentSchema,
  editConfigSchema,
  reorderSchema,
  setScheduleSchema,
  setWritingStyleSchema,
  toggleSchema,
} from "../validation/schemas";
import { json, readJson, withSession } from "./http";

function id(ctx: { params: Record<string, string> }): string {
  const v = ctx.params.id;
  if (!v) throw new DomainError("BAD_INPUT", "id em falta", 400);
  return v;
}

// GET /api/assignments — lista simples das atribuições da org (admin).
export const assignmentsGET = withSession(async (session) => {
  return json(await assignmentService.listByOrg(session));
});

// GET /api/assignments/matrix — grelha Task × Trabalhador + prontidão (admin).
export const matrixGET = withSession(async (session) => {
  return json(await assignmentService.matrix(session));
});

// GET /api/assignments/mine — atribuições do próprio trabalhador (worker-facing).
// Sem requireAdmin: o serviço já escopa por session.userId + org da sessão.
export const myAssignmentsGET = withSession(async (session) => {
  return json(await assignmentService.listForWorker(session));
});

// POST /api/assignments — cria (enabled=false).
export const assignmentsPOST = withSession(async (session, req) => {
  const input = await readJson(req, createAssignmentSchema);
  const a = await assignmentService.create(session, {
    taskId: input.taskId,
    workerId: input.workerId,
    config: input.config ?? null,
    schedule: input.schedule ?? null,
    delivery: input.delivery ?? null,
  });
  return json(a, { status: 201 });
});

// GET /api/assignments/[id] — detalhe + prontidão.
export const assignmentGET = withSession(async (session, _req, ctx) => {
  const assignmentId = id(ctx);
  const [assignment, readiness] = await Promise.all([
    assignmentService.get(session, assignmentId),
    assignmentService.readiness(session, assignmentId),
  ]);
  return json({ assignment, readiness });
});

// POST /api/assignments/[id]/toggle — { enabled }.
export const togglePOST = withSession(async (session, req, ctx) => {
  const { enabled } = await readJson(req, toggleSchema);
  const a = enabled
    ? await assignmentService.enable(session, id(ctx))
    : await assignmentService.disable(session, id(ctx));
  return json(a);
});

// PUT /api/assignments/[id]/config — { config }.
export const configPUT = withSession(async (session, req, ctx) => {
  const { config } = await readJson(req, editConfigSchema);
  return json(await assignmentService.editConfig(session, id(ctx), config));
});

// PUT /api/assignments/[id]/use-writing-style — { enabled } (admin).
export const useWritingStylePUT = withSession(async (session, req, ctx) => {
  const { enabled } = await readJson(req, setWritingStyleSchema);
  return json(await assignmentService.setWritingStyleFlag(session, id(ctx), enabled));
});

// PUT /api/assignments/[id]/schedule — { schedule|null }.
export const schedulePUT = withSession(async (session, req, ctx) => {
  const { schedule } = await readJson(req, setScheduleSchema);
  return json(await assignmentService.setSchedule(session, id(ctx), schedule));
});

// PATCH /api/assignments/mine/order — { order: assignmentId[] } (worker-facing).
// Sem requireAdmin: o serviço escopa por session.userId (só reordena o que é dele).
export const reorderMinePATCH = withSession(async (session, req) => {
  const { order } = await readJson(req, reorderSchema);
  await assignmentService.reorderForWorker(session, order);
  return json({ ok: true });
});
