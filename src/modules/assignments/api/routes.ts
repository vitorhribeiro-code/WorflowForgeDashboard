import { DomainError } from "@/lib/errors";
import { assignmentService } from "../container";
import {
  createAssignmentSchema,
  editConfigSchema,
  setScheduleSchema,
  toggleSchema,
} from "../validation/schemas";
import { json, readJson, withSession } from "./http";

function id(ctx: { params: Record<string, string> }): string {
  const v = ctx.params.id;
  if (!v) throw new DomainError("BAD_INPUT", "id em falta", 400);
  return v;
}

// GET /api/assignments — matriz da org (admin).
export const assignmentsGET = withSession(async (session) => {
  return json(await assignmentService.listByOrg(session));
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

// PUT /api/assignments/[id]/schedule — { schedule|null }.
export const schedulePUT = withSession(async (session, req, ctx) => {
  const { schedule } = await readJson(req, setScheduleSchema);
  return json(await assignmentService.setSchedule(session, id(ctx), schedule));
});
