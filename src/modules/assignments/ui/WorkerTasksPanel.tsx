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

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import type { WorkerAssignmentView } from "@/modules/assignments";
import { describeCron } from "../domain/recurrence";
import {
  cancelRun,
  fetchHistory,
  fetchLastSummary,
  openAssisted,
  retryRun,
  runNow,
  saveOrder,
  saveSummary,
  useWorkerTasks,
  type LastSummary,
  type RunRow,
  type StreamEvent,
  type SummaryEmail,
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
        aria-label="Histórico de ações"
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
            <p className="task-hint">Ainda sem ações.</p>
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

/* --- Board: reordenação (cliente) + pega + ícones dos stat cards ---------- */

// Move `dragId` para a posição de `targetId` na lista de ordem. Reordenação é
// só no cliente (Fase B); persistir a ordem por trabalhador fica para a Fase C.
function moveTo(order: string[], dragId: string, targetId: string): string[] {
  if (dragId === targetId) return order;
  const next = order.filter((id) => id !== dragId);
  const idx = next.indexOf(targetId);
  if (idx < 0) return order;
  next.splice(idx, 0, dragId);
  return next;
}

const GripIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="9" cy="6" r="1.5" />
    <circle cx="15" cy="6" r="1.5" />
    <circle cx="9" cy="12" r="1.5" />
    <circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="18" r="1.5" />
    <circle cx="15" cy="18" r="1.5" />
  </svg>
);

const IcActive = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M9 11l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="4" y="4" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="1.7" />
  </svg>
);
const IcReady = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8.5 12.2l2.3 2.3 4.7-4.9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IcPlug = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M9 15l6-6M8.5 10.5l-1.8 1.8a3.1 3.1 0 004.4 4.4l1.8-1.8M15.5 13.5l1.8-1.8a3.1 3.1 0 00-4.4-4.4L11.1 9.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

/* --- Último resumo (vista tipo caixa de entrada) -------------------------- */

// "Nome <email>" → "Nome"; senão o próprio valor.
function senderName(from: string): string {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/);
  return (m && m[1] ? m[1] : from).trim();
}

function senderInitials(name: string): string {
  const parts = name.replace(/[<>@].*$/, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

// Tom do avatar, determinístico pelo remetente (native à paleta wf).
function avatarTone(seed: string): string {
  const tones = ["sum-av--g", "sum-av--a", "sum-av--r", "sum-av--g2", "sum-av--n"];
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return tones[h % tones.length]!;
}

function SummaryRow({ email }: { email: SummaryEmail }) {
  const name = senderName(email.from);
  return (
    <div className="sum-row">
      <span className={`sum-av ${avatarTone(email.from)}`} aria-hidden>
        {senderInitials(name)}
      </span>
      <div className="sum-main">
        <div className="sum-line">
          <span className="sum-sender">{name}</span>
          <span className="sum-when">{formatWhen(email.receivedAt)}</span>
        </div>
        <div className="sum-subject">{email.subject}</div>
        <div className="sum-resumo">{email.resumo ?? "—"}</div>
      </div>
    </div>
  );
}

function LastSummaryModal({
  assignmentId,
  onClose,
}: {
  assignmentId: string;
  onClose: () => void;
}) {
  const [summary, setSummary] = useState<LastSummary | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; url: string } | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setSummary(await fetchLastSummary(assignmentId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [assignmentId]);

  const onSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaveMsg(null);
    try {
      const r = await saveSummary(assignmentId);
      setSaveMsg({
        text: r.appended ? `Gravado em ${r.file}.` : `Já estava gravado em ${r.file}.`,
        url: r.url,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [assignmentId]);

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

  const ai = summary?.ai;
  const aiLabel =
    ai && ai.used ? [ai.provider, ai.model].filter(Boolean).join(" · ") : null;

  return (
    <div className="wt-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="wt-modal sum-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Último resumo de emails"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="wt-modal-head">
          <span className="wt-modal-title">Último resumo</span>
          <div className="wt-modal-head-actions">
            {summary ? (
              <button
                type="button"
                className="task-link"
                disabled={saving}
                onClick={() => void onSave()}
                title="Acrescentar este resumo ao ficheiro da semana (Google Drive)"
              >
                {saving ? "A gravar…" : "Gravar no semanal"}
              </button>
            ) : null}
            <button type="button" className="task-link" disabled={busy} onClick={() => void load()}>
              Atualizar
            </button>
            <button type="button" className="wt-modal-close" aria-label="Fechar" onClick={onClose}>
              &#215;
            </button>
          </div>
        </div>

        <div className="wt-modal-body">
          {error && <p className="task-error">{error}</p>}
          {saveMsg && (
            <p className="task-ok">
              {saveMsg.text}{" "}
              <a href={saveMsg.url} target="_blank" rel="noreferrer" className="task-link">
                Abrir no Drive
              </a>
            </p>
          )}
          {summary === undefined ? (
            <p className="task-hint">{busy ? "A carregar…" : "—"}</p>
          ) : summary === null ? (
            <p className="task-hint">
              Ainda não há resumos. Usa «Fazer resumo agora» para criar o primeiro.
            </p>
          ) : (
            <>
              <div className="sum-meta">
                {[
                  summary.period,
                  `${summary.total} ${summary.total === 1 ? "email" : "emails"}`,
                  summary.generatedAt ? `atualizado ${formatWhen(summary.generatedAt)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              {summary.emails.length === 0 ? (
                <p className="task-hint">Sem emails no período.</p>
              ) : (
                <div className="sum-list">
                  {summary.emails.map((e, i) => (
                    <SummaryRow key={`${e.from}-${i}`} email={e} />
                  ))}
                </div>
              )}
              {aiLabel && (
                <p className="sum-foot">Sumários por IA — {aiLabel}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* --- Cartão de uma atribuição --------------------------------------------- */

function TaskCard({
  task,
  dragging,
  onHandleDragStart,
  onCardDragEnter,
  onDragEnd,
}: {
  task: WorkerAssignmentView;
  dragging: boolean;
  onHandleDragStart: (e: DragEvent<HTMLSpanElement>) => void;
  onCardDragEnter: () => void;
  onDragEnd: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const isDigest = task.taskRuntime === "email.digest";
  const pill = readinessPill(task);
  const blocked = !task.enabled || !task.ready;

  const onRunNow = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const run = await runNow(task.assignmentId);
      // O aviso mostra-se dentro do histórico, que abrimos já a seguir.
      setNotice(`Ação enfileirada (${run.status}).`);
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
    <div
      className={`task-card${dragging ? " wf-dragging" : ""}`}
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={onCardDragEnter}
      onDragEnd={onDragEnd}
    >
      <div className="task-card-head">
        <span
          className="wf-move"
          draggable
          onDragStart={onHandleDragStart}
          title="Arrastar para mover"
          aria-label="Mover tarefa"
        >
          {GripIcon}
        </span>
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
            {isDigest && (
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => setSummaryOpen(true)}
              >
                Ver último resumo
              </button>
            )}
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

      {summaryOpen && (
        <LastSummaryModal
          assignmentId={task.assignmentId}
          onClose={() => setSummaryOpen(false)}
        />
      )}
    </div>
  );
}

/* --- Painel ---------------------------------------------------------------- */

export function WorkerTasksPanel() {
  const { status, tasks, error, refresh } = useWorkerTasks();

  // Ordem dos cartões (só no cliente, Fase B). Reconcilia com as tarefas:
  // mantém a ordem já escolhida e acrescenta novas no fim.
  const [order, setOrder] = useState<string[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);

  useEffect(() => {
    setOrder((prev) => {
      const ids = tasks.map((t) => t.assignmentId);
      const kept = prev.filter((id) => ids.includes(id));
      const added = ids.filter((id) => !kept.includes(id));
      return [...kept, ...added];
    });
  }, [tasks]);

  const onHandleDragStart = useCallback(
    (id: string) => (e: DragEvent<HTMLSpanElement>) => {
      dragIdRef.current = id;
      setDraggingId(id);
      e.dataTransfer.effectAllowed = "move";
      try {
        e.dataTransfer.setData("text/plain", id);
      } catch {
        /* Firefox exige setData; ignora se falhar */
      }
      const card = e.currentTarget.closest(".task-card");
      if (card) {
        try {
          e.dataTransfer.setDragImage(card, 24, 24);
        } catch {
          /* setDragImage pode não estar disponível */
        }
      }
    },
    [],
  );

  const onCardDragEnter = useCallback(
    (overId: string) => () => {
      const dragId = dragIdRef.current;
      if (!dragId || dragId === overId) return;
      setOrder((o) => moveTo(o, dragId, overId));
    },
    [],
  );

  const onDragEnd = useCallback(() => {
    dragIdRef.current = null;
    setDraggingId(null);
    // Persiste a ordem atual (otimista: o board já está reordenado no estado).
    setOrder((o) => {
      void saveOrder(o).catch(() => {
        /* falha a gravar não desfaz a ordem visual; próxima carga reconcilia */
      });
      return o;
    });
  }, []);

  if (status === "loading" || status === "idle") {
    return (
      <div className="wf-board" aria-busy>
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

  const byId = new Map(tasks.map((t) => [t.assignmentId, t] as const));
  const ordered = order
    .map((id) => byId.get(id))
    .filter((t): t is WorkerAssignmentView => Boolean(t));

  const active = tasks.filter((t) => t.enabled).length;
  const ready = tasks.filter((t) => t.enabled && t.ready).length;
  const attention = tasks.filter((t) => t.enabled && !t.ready).length;

  return (
    <>
      <div className="wf-stats">
        <div className="wf-stat wf-hero">
          <span className="wf-stat-ic">{IcActive}</span>
          <span className="wf-stat-main">
            <span className="wf-stat-label">Tarefas ativas</span>
            <span className="wf-stat-num">{active}</span>
          </span>
        </div>
        <div className="wf-stat">
          <span className="wf-stat-ic">{IcReady}</span>
          <span className="wf-stat-main">
            <span className="wf-stat-label">Prontas</span>
            <span className="wf-stat-num">{ready}</span>
          </span>
        </div>
        <div className="wf-stat">
          <span className="wf-stat-ic">{IcPlug}</span>
          <span className="wf-stat-main">
            <span className="wf-stat-label">A precisar de ligação</span>
            <span className="wf-stat-num">{attention}</span>
          </span>
          {attention > 0 && (
            <span className="wf-stat-right">
              <span className="wf-stat-chip">ver conexões</span>
            </span>
          )}
        </div>
      </div>

      <div className="wf-board">
        {ordered.map((t) => (
          <TaskCard
            key={t.assignmentId}
            task={t}
            dragging={draggingId === t.assignmentId}
            onHandleDragStart={onHandleDragStart(t.assignmentId)}
            onCardDragEnter={onCardDragEnter(t.assignmentId)}
            onDragEnd={onDragEnd}
          />
        ))}
      </div>
    </>
  );
}
