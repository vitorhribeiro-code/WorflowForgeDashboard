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

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkerAssignmentView } from "@/modules/assignments";
import { describeCron } from "../domain/recurrence";
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

// Rótulo do "tipo" já em linguagem do trabalhador. Para automáticas, o nome
// depende do runtime (o resumo de emails diz "Resumo automático"); as restantes
// ficam com "Automático". Assistidas: "Assistida".
function automationLabel(runtime: string): string {
  return runtime === "email.digest" ? "Resumo automático" : "Automático";
}

// Verbo do botão de disparo manual, também por runtime (nada de "Executar").
function runNowLabel(runtime: string): string {
  return runtime === "email.digest" ? "Fazer resumo agora" : "Executar agora";
}

// Linha de contexto do cartão: para automáticas, "{rótulo} · {agenda legível}"
// (sem cron cru); para assistidas, "Assistida".
function metaLine(task: WorkerAssignmentView): string {
  if (task.taskType !== "automation") return "Assistida";
  const label = automationLabel(task.taskRuntime);
  const human = task.schedule ? describeCron(task.schedule) : null;
  return human ? `${label} · ${human}` : label;
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

// Só mostramos texto de erro para falhas reais (um cancelamento é terminal
// `error` mas com outcome "cancelled" — não é um erro a diagnosticar).
function failureText(run: RunRow): string | null {
  if (run.status !== "error" || run.outcome !== "failed") return null;
  return run.error ?? "Falhou sem detalhe.";
}

function errorClassLabel(c: NonNullable<RunRow["errorClass"]>): string {
  return c === "transient" ? "transitório" : "permanente";
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

/* --- Histórico de uma automática (pop-up) --------------------------------- */

function HistoryModal({
  assignmentId,
  notice,
  onClose,
}: {
  assignmentId: string;
  notice: string | null;
  onClose: () => void;
}) {
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

  // Carrega ao abrir e fecha com Esc.
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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

  return (
    <div className="wt-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="wt-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Histórico de execuções"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="wt-modal-head">
          <span className="wt-modal-title">Histórico</span>
          <div className="wt-modal-head-actions">
            <button type="button" className="task-link" disabled={busy} onClick={() => void load()}>
              Atualizar
            </button>
            <button
              type="button"
              className="wt-modal-close"
              aria-label="Fechar"
              onClick={onClose}
            >
              &#215;
            </button>
          </div>
        </div>

        <div className="wt-modal-body">
          {notice && <p className="task-ok">{notice}</p>}
          {error && <p className="task-error">{error}</p>}
          {runs === null ? (
            <p className="task-hint">{busy ? "A carregar…" : "—"}</p>
          ) : runs.length === 0 ? (
            <p className="task-hint">Ainda sem execuções.</p>
          ) : (
            <div className="wt-modal-runs">
              {runs.map((run) => {
                const pill = runPill(run);
                const failure = failureText(run);
                return (
                  <div key={run.id} className="run-entry">
                    <div className="run-row">
                      <div className="run-row-main">
                        <Pill tone={pill.tone} label={pill.label} />
                        <span className="run-when">{formatWhen(run.createdAt)}</span>
                        {run.attempt > 1 && (
                          <span className="run-attempt">tentativa {run.attempt}</span>
                        )}
                      </div>
                      <div className="run-actions">
                        {canCancel(run) && (
                          <button
                            type="button"
                            className="btn-danger btn-sm"
                            onClick={() => void onCancel(run.id)}
                          >
                            Cancelar
                          </button>
                        )}
                        {canRetry(run) && (
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => void onRetry(run.id)}
                          >
                            Repetir
                          </button>
                        )}
                      </div>
                    </div>
                    {failure && (
                      <p className="run-error" title={failure}>
                        {run.errorClass && (
                          <span className={`run-error-class run-error-${run.errorClass}`}>
                            {errorClassLabel(run.errorClass)}
                          </span>
                        )}
                        {failure}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const pill = readinessPill(task);
  const blocked = !task.enabled || !task.ready;

  const onRunNow = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const run = await runNow(task.assignmentId);
      // O aviso mostra-se dentro do histórico, que abrimos já a seguir.
      setNotice(`Execução enfileirada (${run.status}).`);
      setHistoryOpen(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [task.assignmentId]);

  const openHistory = useCallback(() => {
    setNotice(null); // sem aviso quando é só consulta
    setHistoryOpen(true);
  }, []);

  return (
    <div className="task-card">
      <div className="task-card-head">
        <p className="task-card-title">{task.taskName}</p>
        <Pill tone={pill.tone} label={pill.label} />
      </div>
      <div className="task-meta">
        <span>{metaLine(task)}</span>
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
              {busy ? "A enfileirar…" : runNowLabel(task.taskRuntime)}
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={openHistory}>
              Ver histórico
            </button>
          </div>
          {error && <p className="task-error">{error}</p>}
          {blocked && (
            <p className="task-hint">
              {!task.enabled
                ? "Desativada pelo administrador."
                : "Liga as ferramentas em falta em «As minhas conexões»."}
            </p>
          )}
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

      {historyOpen && (
        <HistoryModal
          assignmentId={task.assignmentId}
          notice={notice}
          onClose={() => setHistoryOpen(false)}
        />
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
