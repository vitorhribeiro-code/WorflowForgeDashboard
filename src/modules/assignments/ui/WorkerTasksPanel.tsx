"use client";

/**
 * "As minhas tarefas" — 2.ª zona do Painel do Trabalhador (spec §3).
 *
 * Automáticas: botão "Executar agora" (trigger manual) + histórico de Runs com
 * cancelar/repetir. Assistidas: botão "Iniciar" que abre uma consola de stream
 * em direto (SSE). Cobre os estados transversais (loading/vazio/erro).
 *
 * Design system do projeto (globals.css, CSS-vars) — NÃO Tailwind. Reaproveita
 * o semáforo verde/âmbar/vermelho (.status-pill) das conexões e da matriz.
 */

import { useCallback, useRef, useState } from "react";
import type { WorkerAssignmentView } from "@/modules/assignments";
import {
  cancelRun,
  fetchHistory,
  openAssisted,
  retryRun,
  runNow,
  useWorkerTasks,
  type RunRow,
  type StreamEvent,
} from "./use-worker-tasks";

/* --- Apresentação (labels/tons derivados do estado) ----------------------- */

function typeLabel(type: WorkerAssignmentView["taskType"]): string {
  return type === "automation" ? "Automática" : "Assistida";
}

type Tone = "green" | "amber" | "red" | "grey";

function readinessPill(t: WorkerAssignmentView): { tone: Tone; label: string } {
  if (!t.enabled) return { tone: "grey", label: "Desativada" };
  if (!t.ready) return { tone: "amber", label: "Requer conexões" };
  return { tone: "green", label: "Pronta" };
}

function runPill(run: RunRow): { tone: Tone; label: string } {
  if (run.status === "success") return { tone: "green", label: "Concluído" };
  if (run.status === "queued") return { tone: "amber", label: "Em fila" };
  if (run.status === "running") return { tone: "amber", label: "A correr" };
  // error
  if (run.outcome === "cancelled") return { tone: "grey", label: "Cancelado" };
  return { tone: "red", label: "Falhou" };
}

function canCancel(run: RunRow): boolean {
  return run.status === "queued" || run.status === "running";
}

function canRetry(run: RunRow): boolean {
  return run.status === "error" && run.outcome === "failed" && run.errorClass === "transient";
}

function Pill({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className={`status-pill status-${tone}`}>
      <span className="readiness-dot" aria-hidden />
      {label}
    </span>
  );
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function streamEventText(e: StreamEvent): string {
  switch (e.type) {
    case "progress": {
      const d = e.data ?? {};
      const bits = Object.entries(d).map(([k, v]) => `${k}=${String(v)}`);
      return `progresso ${bits.join(" ")}`.trim();
    }
    case "log":
      return e.data.message;
    case "result":
      return `resultado: ${JSON.stringify(e.data)}`;
    case "error":
      return `erro: ${typeof e.data === "string" ? e.data : e.data.message}`;
    case "done":
      return `terminado (${e.data.run.outcome ?? e.data.run.status})`;
    default:
      return "";
  }
}

/* --- Histórico de uma automática ------------------------------------------ */

function AutomationHistory({ assignmentId }: { assignmentId: string }) {
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setRuns(await fetchHistory(assignmentId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [assignmentId]);

  const onCancel = useCallback(
    async (runId: string) => {
      try {
        await cancelRun(runId);
        await load();
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [load],
  );

  const onRetry = useCallback(
    async (runId: string) => {
      try {
        await retryRun(runId);
        await load();
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [load],
  );

  if (runs === null) {
    return (
      <button type="button" className="btn-secondary task-link" disabled={busy} onClick={() => void load()}>
        {busy ? "A carregar…" : "Ver histórico"}
      </button>
    );
  }

  return (
    <div className="run-list">
      <div className="run-list-head">
        <span>Histórico</span>
        <button type="button" className="task-link" disabled={busy} onClick={() => void load()}>
          Atualizar
        </button>
      </div>
      {error && <p className="task-error">{error}</p>}
      {runs.length === 0 ? (
        <p className="task-hint">Ainda sem execuções.</p>
      ) : (
        runs.map((run) => {
          const pill = runPill(run);
          return (
            <div key={run.id} className="run-row">
              <div className="run-row-main">
                <Pill tone={pill.tone} label={pill.label} />
                <span className="run-when">{formatWhen(run.createdAt)}</span>
                {run.attempt > 1 && <span className="run-attempt">tentativa {run.attempt}</span>}
              </div>
              <div className="run-actions">
                {canCancel(run) && (
                  <button type="button" className="btn-danger btn-sm" onClick={() => void onCancel(run.id)}>
                    Cancelar
                  </button>
                )}
                {canRetry(run) && (
                  <button type="button" className="btn-secondary btn-sm" onClick={() => void onRetry(run.id)}>
                    Repetir
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

/* --- Consola de stream de uma assistida ----------------------------------- */

function AssistedConsole({ assignmentId }: { assignmentId: string }) {
  const [lines, setLines] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(async () => {
    setLines([]);
    setError(null);
    setRunning(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await openAssisted(
        assignmentId,
        (e) => setLines((prev) => [...prev, streamEventText(e)]),
        ctrl.signal,
      );
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [assignmentId]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return (
    <div className="assisted">
      <div className="task-actions">
        {running ? (
          <button type="button" className="btn-danger btn-sm" onClick={stop}>
            Cancelar
          </button>
        ) : (
          <button type="button" className="btn-primary btn-sm" onClick={() => void start()}>
            Iniciar
          </button>
        )}
      </div>
      {error && <p className="task-error">{error}</p>}
      {lines.length > 0 && (
        <div className="stream-console" aria-live="polite">
          {lines.map((l, i) => (
            <div key={i} className="stream-line">
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* --- Cartão de uma atribuição --------------------------------------------- */

function TaskCard({ task }: { task: WorkerAssignmentView }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pill = readinessPill(task);
  const blocked = !task.enabled || !task.ready;

  const onRunNow = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const run = await runNow(task.assignmentId);
      setNotice(`Execução enfileirada (${run.status}).`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [task.assignmentId]);

  return (
    <div className="task-card">
      <div className="task-card-head">
        <p className="task-card-title">{task.taskName}</p>
        <Pill tone={pill.tone} label={pill.label} />
      </div>
      <div className="task-meta">
        <span>{typeLabel(task.taskType)}</span>
        {task.taskType === "automation" && task.schedule && (
          <span className="task-cron">agenda {task.schedule}</span>
        )}
      </div>

      {task.taskType === "automation" ? (
        <>
          <div className="task-actions">
            <button
              type="button"
              className="btn-primary btn-sm"
              disabled={busy || blocked}
              onClick={() => void onRunNow()}
            >
              {busy ? "A enfileirar…" : "Executar agora"}
            </button>
          </div>
          {notice && <p className="task-ok">{notice}</p>}
          {error && <p className="task-error">{error}</p>}
          {blocked && (
            <p className="task-hint">
              {!task.enabled
                ? "Desativada pelo administrador."
                : "Liga as ferramentas em falta em «As minhas conexões»."}
            </p>
          )}
          <AutomationHistory assignmentId={task.assignmentId} />
        </>
      ) : blocked ? (
        <p className="task-hint">
          {!task.enabled
            ? "Desativada pelo administrador."
            : "Liga as ferramentas em falta em «As minhas conexões»."}
        </p>
      ) : (
        <AssistedConsole assignmentId={task.assignmentId} />
      )}
    </div>
  );
}

/* --- Painel ---------------------------------------------------------------- */

export function WorkerTasksPanel() {
  const { status, tasks, error, refresh } = useWorkerTasks();

  if (status === "loading" || status === "idle") {
    return (
      <div className="conn-grid" aria-busy>
        {[0, 1].map((i) => (
          <div key={i} className="conn-skeleton" />
        ))}
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="conn-error">
        <p className="conn-error-title">Não foi possível carregar as tarefas.</p>
        <p className="conn-error-detail">{error}</p>
        <button type="button" className="btn-secondary" onClick={() => void refresh()}>
          Tentar de novo
        </button>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="conn-empty">
        <p className="conn-empty-title">Ainda sem tarefas atribuídas</p>
        <p className="conn-empty-sub">
          Quando o administrador te atribuir e ativar tarefas, aparecem aqui para executares ou
          acompanhares.
        </p>
      </div>
    );
  }

  return (
    <div className="conn-grid">
      {tasks.map((t) => (
        <TaskCard key={t.assignmentId} task={t} />
      ))}
    </div>
  );
}
