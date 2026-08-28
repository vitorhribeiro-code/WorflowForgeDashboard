import { DomainError } from "@/lib/errors";
import { assignmentService, areaMembershipService } from "../container";
import type { AssignmentMatrix } from "../service/ports";
import {
  createAssignmentSchema,
  editConfigSchema,
  reorderSchema,
  setAreasSchema,
  setScheduleSchema,
  setWritingStyleSchema,
  toggleSchema,
} from "../validation/schemas";
import { json, readJson, withSession } from "./http";

// Agrupa pares (chave, areaId) num Map chave → areaId[].
function groupAreas<T extends string>(
  pairs: Array<{ areaId: string } & Record<T, string>>,
  key: T,
): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const p of pairs) {
    const k = p[key];
    const arr = m.get(k);
    if (arr) arr.push(p.areaId);
    else m.set(k, [p.areaId]);
  }
  return m;
}

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
// A matriz base (sem áreas) vem do M5; aqui juntam-se as áreas (task_areas /
// user_areas) para o cliente esbater as células fora da interseção. A junção
// vive na rota de propósito — não injetamos o membership no assignmentService
// (evita alterar deps nos DOIS composition roots).
export const matrixGET = withSession(async (session) => {
  const [base, avail] = await Promise.all([
    assignmentService.matrix(session),
    areaMembershipService.availability(session),
  ]);
  const taskAreas = groupAreas(avail.taskAreas, "taskId");
  const userAreas = groupAreas(avail.userAreas, "userId");
  const matrix: AssignmentMatrix = {
    tasks: base.tasks.map((t) => ({ ...t, areaIds: taskAreas.get(t.id) ?? [] })),
    workers: base.workers.map((w) => ({ ...w, areaIds: userAreas.get(w.id) ?? [] })),
    cells: base.cells,
  };
  return json(matrix);
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

// DELETE /api/assignments/[id] — remove a atribuição (admin). Diferente do
// toggle OFF: apaga a linha (o trabalhador deixa de ver a tarefa).
export const assignmentDELETE = withSession(async (session, _req, ctx) => {
  await assignmentService.remove(session, id(ctx));
  return json({ ok: true });
});

// PATCH /api/assignments/mine/order — { order: assignmentId[] } (worker-facing).
// Sem requireAdmin: o serviço escopa por session.userId (só reordena o que é dele).
export const reorderMinePATCH = withSession(async (session, req) => {
  const { order } = await readJson(req, reorderSchema);
  await assignmentService.reorderForWorker(session, order);
  return json({ ok: true });
});

/* --- Áreas de um trabalhador / de uma tarefa (seletores mínimos da 3b.1) --- */

// GET /api/workers/[id]/areas — áreas atuais do trabalhador (admin).
export const workerAreasGET = withSession(async (session, _req, ctx) => {
  return json({ areaIds: await areaMembershipService.areasForWorker(session, id(ctx)) });
});

// PUT /api/workers/[id]/areas — { areaIds } (substituição de conjunto, admin).
export const workerAreasPUT = withSession(async (session, req, ctx) => {
  const { areaIds } = await readJson(req, setAreasSchema);
  return json({ areaIds: await areaMembershipService.setWorkerAreas(session, id(ctx), areaIds) });
});

// GET /api/tasks/[id]/areas — áreas em que a tarefa está disponível (admin).
export const taskAreasGET = withSession(async (session, _req, ctx) => {
  return json({ areaIds: await areaMembershipService.areasForTask(session, id(ctx)) });
});

// PUT /api/tasks/[id]/areas — { areaIds } (substituição de conjunto, admin).
export const taskAreasPUT = withSession(async (session, req, ctx) => {
  const { areaIds } = await readJson(req, setAreasSchema);
  return json({ areaIds: await areaMembershipService.setTaskAreas(session, id(ctx), areaIds) });
});
