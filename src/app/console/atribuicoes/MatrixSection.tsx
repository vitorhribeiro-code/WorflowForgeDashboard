"use client";

import { useState } from "react";
import { light } from "@/modules/assignments/ui/AssignmentCell";
import { useMatrix } from "@/modules/assignments/ui/hooks";
import { RecurrenceBuilder } from "@/modules/assignments/ui/RecurrenceBuilder";
import type { AssignmentReadiness, MatrixCell } from "@/modules/assignments/service/ports";

const REASON_PT: Record<string, string> = {
  no_connection: "sem ligação",
  not_connected: "ligação inativa",
  missing_scopes: "faltam permissões",
};

// Texto do que falta para ativar (mostrado quando a célula não está pronta).
function missingText(r: AssignmentReadiness): string {
  const parts: string[] = [];
  if (!r.published) parts.push("tarefa despublicada");
  if (!r.configValid) parts.push("configuração necessária");
  for (const m of r.connections.missing) {
    const scopes = m.missingScopes?.length ? `: ${m.missingScopes.join(", ")}` : "";
    parts.push(`${REASON_PT[m.reason] ?? m.reason}${scopes}`);
  }
  return parts.join(" · ");
}

export function MatrixSection() {
  const { matrix, loading, error, refetch, setCell, setSchedule, setWritingStyle } = useMatrix();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Edição de agenda: qual célula tem o construtor aberto. O rascunho vive
  // DENTRO do RecurrenceBuilder (montado com key=cellKey), por isso não há
  // estado de agenda partilhado entre células — nada vaza de uma para outra.
  const [editKey, setEditKey] = useState<string | null>(null);

  async function onSetWritingStyle(cell: MatrixCell, enabled: boolean) {
    if (!cell.assignmentId) return;
    const key = `${cell.taskId}:${cell.workerId}`;
    setBusyKey(key);
    setActionError(null);
    try {
      await setWritingStyle(cell.assignmentId, enabled);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Não foi possível concluir");
    } finally {
      setBusyKey(null);
    }
  }

  async function onToggle(cell: MatrixCell, enabled: boolean) {
    const key = `${cell.taskId}:${cell.workerId}`;
    setBusyKey(key);
    setActionError(null);
    try {
      await setCell(cell, enabled);
    } catch (e) {
      // Bloqueio de ativação (pré-requisitos): a célula fica criada/desativada;
      // o refetch mostra o porquê no próprio semáforo.
      setActionError(e instanceof Error ? e.message : "Não foi possível concluir");
    } finally {
      setBusyKey(null);
      refetch();
    }
  }

  // Guarda o cron gerado pelo construtor. O servidor revalida (só automáticas,
  // cron válido) — um erro sobe e mostra-se junto à matriz.
  async function onSaveSchedule(cell: MatrixCell, cron: string) {
    if (!cell.assignmentId) return;
    const key = `${cell.taskId}:${cell.workerId}`;
    setBusyKey(key);
    setActionError(null);
    try {
      await setSchedule(cell.assignmentId, cron);
      setEditKey(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Não foi possível guardar a agenda");
    } finally {
      setBusyKey(null);
      refetch();
    }
  }

  // Limpa a agenda (null). A automática deixa de disparar sozinha; continua
  // executável manualmente.
  async function onClearSchedule(cell: MatrixCell) {
    if (!cell.assignmentId) return;
    const key = `${cell.taskId}:${cell.workerId}`;
    setBusyKey(key);
    setActionError(null);
    try {
      await setSchedule(cell.assignmentId, null);
      setEditKey(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Não foi possível limpar a agenda");
    } finally {
      setBusyKey(null);
      refetch();
    }
  }

  if (loading && !matrix) {
    return (
      <section className="console-section">
        <h1>Atribuições</h1>
        <div className="matrix-skeleton">A carregar…</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="console-section">
        <h1>Atribuições</h1>
        <p className="panel-error">{error}</p>
      </section>
    );
  }

  const cellByKey = new Map((matrix?.cells ?? []).map((c) => [`${c.taskId}:${c.workerId}`, c]));
  const noTasks = (matrix?.tasks.length ?? 0) === 0;
  const noWorkers = (matrix?.workers.length ?? 0) === 0;

  return (
    <section className="console-section">
      <h1>Atribuições</h1>
      <p className="muted">
        Ativa uma tarefa para um trabalhador. O ponto mostra a prontidão das ligações:
        verde = pronto, âmbar = faltam permissões, vermelho = sem ligação. Numa tarefa
        automática já atribuída podes definir uma agenda (cron) para correr sozinha.
      </p>

      {actionError ? <p className="panel-error">{actionError}</p> : null}

      {noTasks || noWorkers ? (
        <div className="panel">
          <p className="muted">
            {noTasks && noWorkers
              ? "Ainda não há tarefas nem trabalhadores. Cria tarefas no Catálogo e convida trabalhadores em Áreas & Utilizadores."
              : noTasks
                ? "Ainda não há tarefas. Cria a primeira no Catálogo."
                : "Ainda não há trabalhadores. Convida o primeiro em Áreas & Utilizadores."}
          </p>
        </div>
      ) : (
        <div className="panel matrix-wrap">
          <table className="matrix-table">
            <thead>
              <tr>
                <th className="matrix-corner">Tarefa</th>
                {matrix!.workers.map((w) => (
                  <th key={w.id} title={w.email}>
                    {w.email}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix!.tasks.map((t) => {
                const isAuto = t.type === "automation";
                const isWriting = t.runtime === "assistant.writing";
                return (
                  <tr key={t.id}>
                    <th scope="row" className="matrix-task">
                      <span className="matrix-task-name">{t.name}</span>
                      <span className="matrix-task-meta">
                        {isAuto ? "automática" : "assistida"}
                        {t.published ? "" : " · rascunho"}
                      </span>
                    </th>
                    {matrix!.workers.map((w) => {
                      const key = `${t.id}:${w.id}`;
                      const cell = cellByKey.get(key);
                      if (!cell) return <td key={w.id} />;
                      const status = light(cell.readiness);
                      const blocked = !cell.readiness.eligible;
                      const busy = busyKey === key;
                      return (
                        <td key={w.id} className={`matrix-cell status-${status}`}>
                          <label className="matrix-toggle">
                            <input
                              type="checkbox"
                              checked={cell.enabled}
                              disabled={busy}
                              onChange={(e) => onToggle(cell, e.target.checked)}
                            />
                            <span className="readiness-dot" aria-label={status} title={status} />
                            <span className="matrix-state">{cell.enabled ? "Ativa" : "Inativa"}</span>
                          </label>

                          {blocked ? (
                            <span className="matrix-missing">{missingText(cell.readiness)}</span>
                          ) : null}

                          {isAuto && cell.assignmentId ? (
                            <div className="matrix-cron">
                              {editKey === key ? (
                                <RecurrenceBuilder
                                  key={key}
                                  initial={cell.schedule}
                                  busy={busy}
                                  onSave={(cron) => onSaveSchedule(cell, cron)}
                                  onCancel={() => setEditKey(null)}
                                />
                              ) : (
                                <div className="matrix-cron-view">
                                  <span className="matrix-cron-label">
                                    {cell.schedule ? `⏱ ${cell.schedule}` : "sem agenda"}
                                  </span>
                                  <button
                                    type="button"
                                    className="btn-mini ghost"
                                    disabled={busy}
                                    onClick={() => setEditKey(key)}
                                  >
                                    {cell.schedule ? "Editar" : "Agendar"}
                                  </button>
                                  {cell.schedule ? (
                                    <button
                                      type="button"
                                      className="btn-mini ghost"
                                      disabled={busy}
                                      onClick={() => onClearSchedule(cell)}
                                    >
                                      Limpar
                                    </button>
                                  ) : null}
                                </div>
                              )}
                            </div>
                          ) : null}

                          {isWriting && cell.assignmentId ? (
                            <label className="matrix-style" title="Usar o .md de estilo deste trabalhador nas gerações de escrita">
                              <input
                                type="checkbox"
                                checked={cell.useWritingStyle}
                                disabled={busy}
                                onChange={(e) => onSetWritingStyle(cell, e.target.checked)}
                              />
                              <span>Usar estilo</span>
                            </label>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
