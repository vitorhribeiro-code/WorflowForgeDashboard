/**
 * Motor de execução (M7) — orquestração pura de negócio, sem HTTP nem framework.
 * Recebe todas as dependências por injeção (createRunsService).
 *
 * Responsabilidades:
 *  - Enfileirar Runs automáticos (com pré-condições e idempotência por janela).
 *  - Processar um Run da fila (dispatch para o handler do runtime).
 *  - Executar Runs assistidos com stream de eventos.
 *  - Cancelar (queued/running) e repetir (retry) com regras de classe de erro.
 *
 * Estados sobre o schema (queued|running|success|error); cancelamento = error
 * + meta.cancelled. Metadata do motor vive em runs.output._engine.
 */

import {
  deriveOutcome,
  readEngine,
  withEngine,
  type RunTrigger,
  type RunView,
} from "../domain/run.types";
import { assertTransition, canCancel } from "../domain/state-machine";
import { backoffMs, buildIdempotencyKey } from "../domain/idempotency";
import type { RunRow, RunsRepository } from "../data/runs.repository";
import type { ArtifactSink, InputProvider, ReadinessChecker, RunQueue } from "./ports";
import type { HandlerRegistry, RunEvent } from "./handlers/handler";
import { classify, messageOf } from "./exec-errors";
import type { AuditPort } from "@/lib/audit";
import type { SessionContext } from "@/lib/session";
import {
  conflict,
  forbidden,
  noHandler,
  notFound,
  notReady,
  retryNotAllowed,
} from "@/lib/errors";

export interface RunsServiceDeps {
  repo: RunsRepository;
  queue: RunQueue;
  readiness: ReadinessChecker;
  handlers: HandlerRegistry;
  artifacts: ArtifactSink;
  audit: AuditPort;
  // Aquisição de input a montante do handler (ex.: Gmail → email.digest).
  // Opcional: sem ele, o input do run passa tal e qual (pass-through).
  inputProvider?: InputProvider;
  maxAttempts?: number; // default 3
  now?: () => Date;
}

export interface EnqueueInput {
  session: SessionContext | null; // null para schedule/webhook (sistema)
  assignmentId: string;
  trigger: RunTrigger;
  windowKey?: string | null;
  input?: Record<string, unknown>;
}

/** Evento externo do stream assistido (inclui "done" com a vista final). */
export type AssistedEvent = RunEvent | { type: "done"; data: { run: RunView } };

export function createRunsService(deps: RunsServiceDeps) {
  const { repo, queue, readiness, handlers, artifacts, audit } = deps;
  const maxAttempts = deps.maxAttempts ?? 3;
  const now = deps.now ?? (() => new Date());

  /* ------------------------------- helpers -------------------------------- */

  function toView(row: RunRow): RunView {
    const meta = readEngine(row.output);
    return {
      id: row.id,
      assignmentId: row.assignmentId,
      status: row.status,
      trigger: row.trigger,
      outcome: deriveOutcome(row.status, meta),
      attempt: meta.attempt,
      retryOf: meta.retryOf,
      errorClass: meta.errorClass,
      error: row.error,
      hasResult: Boolean((row.output as any)?.result),
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      createdAt: row.createdAt,
    };
  }

  async function loadContext(assignmentId: string) {
    const ctx = await repo.getAssignmentContext(assignmentId);
    if (!ctx) throw notFound("Atribuição inexistente.", { assignmentId });
    return ctx;
  }

  function assertCanActOnRun(session: SessionContext | null, ownerWorkerId: string) {
    if (!session) return; // sistema (fila/scheduler)
    if (session.role === "super_admin") return; // admin na org
    if (session.userId !== ownerWorkerId) {
      throw forbidden("Só podes agir sobre os teus próprios Runs.");
    }
  }

  async function assertReady(workerId: string, taskId: string) {
    const r = await readiness.check(workerId, taskId);
    if (!r.ready) {
      throw notReady("Conexões insuficientes para executar.", { missing: r.missing });
    }
  }

  /* -------------------------------- enqueue ------------------------------- */

  async function enqueue(cmd: EnqueueInput): Promise<RunView> {
    const { assignment, task } = await loadContext(cmd.assignmentId);
    assertCanActOnRun(cmd.session, assignment.workerId);

    if (task.type !== "automation") {
      throw conflict("Tarefa assistida não se enfileira; usa runAssisted.", {
        type: task.type,
      });
    }
    if (!assignment.enabled) {
      throw conflict("Atribuição desativada.", { assignmentId: assignment.id });
    }
    await assertReady(assignment.workerId, task.id);

    // Idempotência por janela: mesma chave → devolve o Run existente.
    const idem = buildIdempotencyKey({
      assignmentId: assignment.id,
      trigger: cmd.trigger,
      windowKey: cmd.windowKey,
    });
    if (idem) {
      const existing = await repo.findByIdempotencyKey(idem);
      if (existing) return toView(existing);
    }

    const row = await repo.createRun({
      assignmentId: assignment.id,
      trigger: cmd.trigger,
      idempotencyKey: idem,
      input: cmd.input ?? {},
      output: withEngine(null, { attempt: 1 }),
      triggeredBy: cmd.session?.userId ?? null,
    });

    await queue.enqueue(row.id);
    await audit.record({
      actorId: cmd.session?.userId ?? null,
      action: "run.queued",
      entity: "run",
      entityId: row.id,
      metadata: { assignmentId: assignment.id, trigger: cmd.trigger },
    });
    return toView(row);
  }

  /* ---------------------------- processar (fila) -------------------------- */

  /** Chamado pelo worker da fila. Idempotente: só corre se ainda `queued`. */
  async function processRun(runId: string): Promise<RunView> {
    const row = await repo.getRun(runId);
    if (!row) throw notFound("Run inexistente.", { runId });
    if (row.status !== "queued") return toView(row); // já reclamado/terminal

    const { assignment, task } = await loadContext(row.assignmentId);
    const meta = readEngine(row.output);

    const handler = handlers.get(task.runtime);
    if (!handler?.execute) {
      const output = withEngine(row.output, { errorClass: "permanent" });
      await repo.markError(runId, `Sem handler para runtime "${task.runtime}".`, output, now());
      await audit.record({
        actorId: null,
        action: "run.failed",
        entity: "run",
        entityId: runId,
        metadata: { errorClass: "permanent", reason: "no_handler" },
      });
      return toView((await repo.getRun(runId))!);
    }

    assertTransition(row.status, "running");
    await repo.markRunning(runId, now());
    await audit.record({
      actorId: null,
      action: "run.started",
      entity: "run",
      entityId: runId,
      metadata: { trigger: row.trigger, attempt: meta.attempt },
    });

    const controller = new AbortController();
    const events: RunEvent[] = [];
    try {
      // Aquisição a montante (ex.: Gmail → emails). Sem provider = pass-through.
      // Falhas aqui são classificadas como as do handler (transitório/permanente).
      const input = deps.inputProvider
        ? await deps.inputProvider.resolve({
            runtime: task.runtime,
            workerId: assignment.workerId,
            config: assignment.config,
            base: row.input ?? {},
          })
        : row.input ?? {};
      const result = await handler.execute({
        input,
        config: assignment.config,
        signal: controller.signal,
        emit: (e) => events.push(e),
      });
      const output = withEngine({ result }, { ...meta });
      await repo.markSuccess(runId, output, now());
      await artifacts.writeLog({
        runId,
        name: "run.log",
        body: { status: "success", events },
      });
      await audit.record({
        actorId: null,
        action: "run.succeeded",
        entity: "run",
        entityId: runId,
        metadata: { attempt: meta.attempt },
      });
    } catch (err) {
      const errorClass = classify(err);
      const output = withEngine(row.output, { ...meta, errorClass });
      await repo.markError(runId, messageOf(err), output, now());
      await artifacts.writeLog({
        runId,
        name: "run.log",
        body: { status: "error", errorClass, message: messageOf(err), events },
      });
      await audit.record({
        actorId: null,
        action: "run.failed",
        entity: "run",
        entityId: runId,
        metadata: { attempt: meta.attempt, errorClass },
      });
    }
    return toView((await repo.getRun(runId))!);
  }

  /* ------------------------------- assistido ------------------------------ */

  /**
   * Executa um Run assistido, devolvendo um async iterable de eventos para SSE.
   * Requer trabalhador presente (sessão worker), sem schedule.
   */
  async function* runAssisted(
    session: SessionContext,
    assignmentId: string,
    input: Record<string, unknown>,
    externalSignal?: AbortSignal,
  ): AsyncGenerator<AssistedEvent> {
    const { assignment, task } = await loadContext(assignmentId);
    assertCanActOnRun(session, assignment.workerId);
    if (task.type !== "assistant") {
      throw conflict("Tarefa não é assistida.", { type: task.type });
    }
    if (!assignment.enabled) throw conflict("Atribuição desativada.");
    await assertReady(assignment.workerId, task.id);

    const handler = handlers.get(task.runtime);
    if (!handler?.stream) throw noHandler("Runtime sem stream.", { runtime: task.runtime });

    const row = await repo.createRun({
      assignmentId,
      trigger: "manual",
      idempotencyKey: null,
      input,
      output: withEngine(null, { attempt: 1 }),
      triggeredBy: session.userId,
    });
    await repo.markRunning(row.id, now());
    await audit.record({
      actorId: session.userId,
      action: "assisted_session.opened",
      entity: "run",
      entityId: row.id,
    });

    const controller = new AbortController();
    externalSignal?.addEventListener("abort", () => controller.abort());

    let result: Record<string, unknown> | undefined;
    try {
      for await (const event of handler.stream({
        input,
        config: assignment.config,
        signal: controller.signal,
        emit: () => {},
      })) {
        if (event.type === "result") result = event.data;
        yield event;
        if (controller.signal.aborted) break;
      }

      if (controller.signal.aborted) {
        const output = withEngine(row.output, { cancelled: true });
        await repo.markError(row.id, "cancelled", output, now());
      } else {
        const output = withEngine({ result: result ?? {} }, { attempt: 1 });
        await repo.markSuccess(row.id, output, now());
      }
    } catch (err) {
      const errorClass = classify(err);
      const output = withEngine(row.output, { errorClass });
      await repo.markError(row.id, messageOf(err), output, now());
      yield { type: "error", data: { message: messageOf(err) } };
    } finally {
      await audit.record({
        actorId: session.userId,
        action: "assisted_session.closed",
        entity: "run",
        entityId: row.id,
      });
    }

    const finalRow = await repo.getRun(row.id);
    yield { type: "done", data: { run: toView(finalRow!) } };
  }

  /* -------------------------------- cancelar ------------------------------ */

  async function cancel(
    session: SessionContext,
    runId: string,
  ): Promise<RunView> {
    const row = await repo.getRun(runId);
    if (!row) throw notFound("Run inexistente.", { runId });
    const { assignment } = await loadContext(row.assignmentId);
    assertCanActOnRun(session, assignment.workerId);

    if (!canCancel(row.status)) {
      throw conflict("Run já terminou; não pode ser cancelado.", {
        status: row.status,
      });
    }
    assertTransition(row.status, "error");
    const meta = readEngine(row.output);
    const output = withEngine(row.output, { ...meta, cancelled: true });
    await repo.markError(runId, "cancelled", output, now());
    await artifacts.writeLog({
      runId,
      name: "cancel.log",
      body: { cancelledBy: session.userId, at: now().toISOString() },
    });
    await audit.record({
      actorId: session.userId,
      action: "run.cancelled",
      entity: "run",
      entityId: runId,
    });
    return toView((await repo.getRun(runId))!);
  }

  /* --------------------------------- retry -------------------------------- */

  async function retry(
    session: SessionContext,
    runId: string,
  ): Promise<RunView> {
    const row = await repo.getRun(runId);
    if (!row) throw notFound("Run inexistente.", { runId });
    const { assignment } = await loadContext(row.assignmentId);
    assertCanActOnRun(session, assignment.workerId);

    if (row.status !== "error") {
      throw retryNotAllowed("Só Runs falhados podem ser repetidos.", {
        status: row.status,
      });
    }
    const meta = readEngine(row.output);
    if (meta.cancelled) {
      throw retryNotAllowed("Runs cancelados não se repetem.");
    }
    if (meta.errorClass !== "transient") {
      throw retryNotAllowed("Erro permanente exige intervenção, não retry.", {
        errorClass: meta.errorClass,
      });
    }
    if (meta.attempt >= maxAttempts) {
      throw retryNotAllowed("Limite de tentativas excedido.", {
        attempt: meta.attempt,
        maxAttempts,
      });
    }

    const attempt = meta.attempt + 1;
    const newRow = await repo.createRun({
      assignmentId: row.assignmentId,
      trigger: row.trigger,
      idempotencyKey: null, // retry é sempre um Run novo
      input: row.input,
      output: withEngine(null, { attempt, retryOf: row.id }),
      triggeredBy: session.userId,
    });
    await queue.enqueue(newRow.id, { delayMs: backoffMs(attempt) });
    await audit.record({
      actorId: session.userId,
      action: "run.retried",
      entity: "run",
      entityId: newRow.id,
      metadata: { retryOf: row.id, attempt },
    });
    return toView(newRow);
  }

  /* --------------------------------- leitura ------------------------------ */

  async function getRun(session: SessionContext, runId: string): Promise<RunView> {
    const row = await repo.getRun(runId);
    if (!row) throw notFound("Run inexistente.", { runId });
    const { assignment } = await loadContext(row.assignmentId);
    assertCanActOnRun(session, assignment.workerId);
    return toView(row);
  }

  async function listRuns(
    session: SessionContext,
    assignmentId: string,
    limit = 20,
  ): Promise<RunView[]> {
    const { assignment } = await loadContext(assignmentId);
    assertCanActOnRun(session, assignment.workerId);
    const rows = await repo.listByAssignment(assignmentId, limit);
    return rows.map(toView);
  }

  return {
    enqueue,
    processRun,
    runAssisted,
    cancel,
    retry,
    getRun,
    listRuns,
    toView, // exposto p/ testes
  };
}

export type RunsService = ReturnType<typeof createRunsService>;
