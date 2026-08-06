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
import type { RunRow, RunsRepository, WorkerRunRow } from "../data/runs.repository";
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

/** Item do feed "Execuções recentes" do trabalhador: vista do Run + a tarefa. */
export interface WorkerRunFeedItem extends RunView {
  taskName: string;
  taskRuntime: string;
}

/* --- Gravar resumo no ficheiro da semana (§5.2, Fatia B) ------------------ */

// Semana ISO-8601 (segunda→domingo; a semana 1 contém a 1.ª quinta-feira).
function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // segunda=0 … domingo=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // quinta-feira desta semana
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((d.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    );
  return { year: d.getUTCFullYear(), week };
}

// "Nome <email>" → "Nome"; senão o próprio valor.
function senderName(from: string): string {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/);
  return (m && m[1] ? m[1] : from).trim();
}

// Constrói o bloco a acrescentar ao ficheiro da semana a partir do resultado do
// último resumo. A semana e o marcador de idempotência vêm do `generatedAt` do
// resumo — assim gravar o MESMO resumo 2x não duplica.
function buildWeeklySummaryBlock(result: Record<string, unknown>, fallbackAt: Date) {
  const gen = typeof result.generatedAt === "string" ? result.generatedAt : fallbackAt.toISOString();
  const genDate = new Date(gen);
  const { year, week } = isoWeek(Number.isNaN(genDate.getTime()) ? fallbackAt : genDate);
  const weekLabel = `${year}-W${String(week).padStart(2, "0")}`;
  const filename = `resumos-semana-${weekLabel}.md`;
  const header = `# Resumos de emails — semana ${weekLabel}`;

  const when = (Number.isNaN(genDate.getTime()) ? fallbackAt : genDate).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const period = typeof result.period === "string" ? result.period : null;
  const emails = Array.isArray(result.emails) ? (result.emails as Array<Record<string, unknown>>) : [];

  const lines = emails.map((e) => {
    const name = senderName(String(e.from ?? ""));
    const resumo =
      typeof e.resumo === "string" && e.resumo
        ? e.resumo
        : typeof e.subject === "string"
          ? e.subject
          : "";
    return `- ${name} — ${resumo}`;
  });

  // Marcador invisível (comentário HTML) para idempotência por resumo.
  const marker = `<!-- wff:${gen} -->`;
  const head = period ? `## ${when} · ${period}` : `## ${when}`;
  const block = [head, marker, ...(lines.length ? lines : ["- (sem emails)"])].join("\n");

  return { filename, header, block, marker, week: weekLabel, count: emails.length };
}

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
            orgId: task.orgId,
            workerId: assignment.workerId,
            config: assignment.config,
            base: row.input ?? {},
          })
        : row.input ?? {};

      // Auditoria do enriquecimento por IA (§5.2 fase 3). Rasto do provider/
      // modelo usados — a escolha é a alavanca de residência de dados (RGPD).
      const aiMeta =
        input.aiSummary && typeof input.aiSummary === "object"
          ? (input.aiSummary as Record<string, unknown>)
          : null;
      if (aiMeta) {
        await audit.record({
          actorId: null,
          action: aiMeta.used === true ? "ai.email_enriched" : "ai.email_enrich_skipped",
          entity: "run",
          entityId: runId,
          metadata: aiMeta,
        });
      }
      const result = await handler.execute({
        input,
        config: assignment.config,
        orgId: task.orgId,
        signal: controller.signal,
        emit: (e) => events.push(e),
      });

      // Entregável final (work_document) → cloud do worker, quando o handler o
      // declara. Fica DENTRO do try: uma falha de cloud (CLOUD_*/rede) classifica
      // o run (permanente/transitório) — o entregável é o objetivo da tarefa.
      if (handler.deliverable) {
        const draft = handler.deliverable(result);
        if (draft) {
          const doc = await artifacts.writeDocument({
            runId,
            filename: draft.filename,
            mimeType: draft.mimeType,
            bytes: draft.bytes,
            idempotencyKey: draft.idempotencyKey,
          });
          events.push({ type: "log", data: { message: `entregável: ${draft.filename}` } });
          (result as Record<string, unknown>)._deliverable = {
            artifactId: doc.id,
            storageRef: doc.storageRef,
            filename: draft.filename,
          };
        }
      }

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
        orgId: task.orgId,
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

  /**
   * Resultado estruturado do último Run BEM-SUCEDIDO de uma atribuição (para a
   * vista «Ver último resumo»). Escopado ao trabalhador dono (ou super_admin).
   * Devolve `runs.output.result` tal-e-qual, ou null se ainda não houve sucesso.
   */
  async function getLastSummary(
    session: SessionContext,
    assignmentId: string,
  ): Promise<Record<string, unknown> | null> {
    const { assignment } = await loadContext(assignmentId);
    assertCanActOnRun(session, assignment.workerId);
    const rows = await repo.listByAssignment(assignmentId, 20);
    const last = rows.find(
      (r) => r.status === "success" && (r.output as { result?: unknown } | null)?.result,
    );
    if (!last) return null;
    return ((last.output as { result?: Record<string, unknown> }).result) ?? null;
  }

  /**
   * Grava o último resumo no ficheiro da SEMANA na cloud do trabalhador
   * (append idempotente). Ação do utilizador (não do motor). Devolve o link do
   * ficheiro e se acrescentou (false = esse resumo já lá estava).
   */
  async function saveSummaryToWeekly(
    session: SessionContext,
    assignmentId: string,
  ): Promise<{ appended: boolean; url: string; file: string }> {
    const { assignment, task } = await loadContext(assignmentId);
    assertCanActOnRun(session, assignment.workerId);

    const rows = await repo.listByAssignment(assignmentId, 20);
    const last = rows.find(
      (r) => r.status === "success" && (r.output as { result?: unknown } | null)?.result,
    );
    const result = last ? (last.output as { result?: Record<string, unknown> }).result ?? null : null;
    if (!result) throw conflict("Ainda não há resumo para gravar.", { assignmentId });

    const built = buildWeeklySummaryBlock(result, now());
    const res = await artifacts.appendWeekly({
      workerId: assignment.workerId,
      filename: built.filename,
      idempotencyKey: `weekly-summary:${task.orgId}:${assignment.workerId}:${built.week}`,
      marker: built.marker,
      header: built.header,
      block: built.block,
    });

    try {
      await audit.record({
        actorId: session.userId,
        action: "ai.summary_saved",
        entity: "assignment",
        entityId: assignmentId,
        metadata: { file: built.filename, week: built.week, appended: res.appended, emails: built.count },
      });
    } catch (err) {
      console.error("[audit] falha ao registar ai.summary_saved", err);
    }

    return {
      appended: res.appended,
      url: `https://drive.google.com/file/d/${res.storageRef}/view`,
      file: built.filename,
    };
  }

  /**
   * Feed "Execuções recentes" do trabalhador autenticado: os últimos Runs de
   * TODAS as suas atribuições, cada um com o nome/runtime da tarefa. Escopa
   * SEMPRE por session.userId (é "as minhas" — mesmo um super-utilizador vê as
   * suas, não as da org). O isolamento por worker vive na query do repositório.
   */
  async function listMine(
    session: SessionContext,
    limit = 6,
  ): Promise<WorkerRunFeedItem[]> {
    const capped = Math.max(1, Math.min(20, Math.trunc(limit)));
    const rows: WorkerRunRow[] = await repo.listRecentByWorker(session.userId, capped);
    return rows.map((r) => ({
      ...toView(r),
      taskName: r.taskName,
      taskRuntime: r.taskRuntime,
    }));
  }

  return {
    enqueue,
    processRun,
    runAssisted,
    cancel,
    retry,
    getRun,
    listRuns,
    getLastSummary,
    saveSummaryToWeekly,
    listMine,
    toView, // exposto p/ testes
  };
}

export type RunsService = ReturnType<typeof createRunsService>;
