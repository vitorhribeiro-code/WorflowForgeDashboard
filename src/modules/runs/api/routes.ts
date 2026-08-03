// App-routes do M7 (motor de execução). Handlers finos: validam, chamam o
// serviço e serializam. A autorização (admin na org / worker dono) vive no
// serviço (assertCanActOnRun), não aqui.
import { getRunsService } from "@/modules/runs/container";
import { manualRunSchema } from "@/modules/runs/validation/runs.schema";
import { json, param, readJson, withSession } from "./http";

// POST /api/assignments/[assignmentId]/run — dispara manualmente uma automática.
// enfileira um Run (trigger=manual, sem deduplicação) se a atribuição estiver
// ativa e as conexões prontas; devolve a vista do Run (201).
export const runAssignmentPOST = withSession(async (session, req, ctx) => {
  const assignmentId = param(ctx, "assignmentId");
  const { input } = await readJson(req, manualRunSchema);
  const run = await getRunsService().enqueue({
    session,
    assignmentId,
    trigger: "manual",
    input,
  });
  return json(run, { status: 201 });
});

// GET /api/assignments/[assignmentId]/runs — histórico de Runs da atribuição.
export const assignmentRunsGET = withSession(async (session, _req, ctx) => {
  const assignmentId = param(ctx, "assignmentId");
  const runs = await getRunsService().listRuns(session, assignmentId);
  return json(runs);
});

// GET /api/runs/mine — feed agregado dos últimos Runs do trabalhador (todas as
// suas atribuições), cada um com o nome da tarefa. `?limit=` opcional (1..20,
// default 6); o serviço faz o clamp. Escopado por session.userId.
export const myRunsGET = withSession(async (session, req) => {
  const raw = Number(new URL(req.url).searchParams.get("limit"));
  const limit = Number.isFinite(raw) && raw > 0 ? raw : 6;
  const runs = await getRunsService().listMine(session, limit);
  return json(runs);
});

// GET /api/runs/[id] — detalhe de um Run.
export const runGET = withSession(async (session, _req, ctx) => {
  const runId = param(ctx, "id");
  const run = await getRunsService().getRun(session, runId);
  return json(run);
});

// POST /api/runs/[id]/cancel — cancela um Run em queued/running (worker dono ou admin).
export const runCancelPOST = withSession(async (session, _req, ctx) => {
  const runId = param(ctx, "id");
  return json(await getRunsService().cancel(session, runId));
});

// POST /api/runs/[id]/retry — repete um Run falhado (transitório), devolve o novo Run.
export const runRetryPOST = withSession(async (session, _req, ctx) => {
  const runId = param(ctx, "id");
  return json(await getRunsService().retry(session, runId), { status: 201 });
});
