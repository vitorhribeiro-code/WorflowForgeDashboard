"use client";

import { useState } from "react";
import { light } from "@/modules/assignments/ui/AssignmentCell";
import { useAreas, useMatrix, type AreaLite } from "@/modules/assignments/ui/hooks";
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

// Interseção não-vazia entre dois conjuntos de áreas.
function intersects(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const s = new Set(a);
  return b.some((x) => s.has(x));
}

/* -------------------------------------------------------------------------- */
/*  Interruptor ON/OFF (estilo do anexo — cores pelos tokens dos 5 temas)      */
/* -------------------------------------------------------------------------- */
function Switch({
  checked,
  disabled,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <label className="wf-switch" aria-label={ariaLabel} title={checked ? "A trabalhar" : "Pausada"}>
      <input
        type="checkbox"
        className="wf-switch-input"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="wf-switch-track">
        <span className="wf-switch-text wf-switch-text-on">ON</span>
        <span className="wf-switch-text wf-switch-text-off">OFF</span>
        <span className="wf-switch-knob" />
      </span>
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/*  Seletor de áreas (mínimo — 3b.1). Aplica cada toggle de imediato.          */
/* -------------------------------------------------------------------------- */
function AreaPicker({
  label,
  allAreas,
  selected,
  disabled,
  onApply,
}: {
  label: string;
  allAreas: AreaLite[];
  selected: string[];
  disabled?: boolean;
  onApply: (areaIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const sel = new Set(selected);
  function toggle(id: string) {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onApply([...next]);
  }
  return (
    <div className="area-picker">
      <button
        type="button"
        className="btn-mini ghost area-picker-btn"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {label} · {selected.length}
      </button>
      {open ? (
        <>
          <div className="area-picker-backdrop" onClick={() => setOpen(false)} />
          <div className="area-picker-menu" role="menu">
            {allAreas.length === 0 ? (
              <span className="area-picker-empty">Ainda não há áreas.</span>
            ) : (
              allAreas.map((a) => (
                <label key={a.id} className="area-picker-item">
                  <input type="checkbox" checked={sel.has(a.id)} onChange={() => toggle(a.id)} />
                  <span>{a.name}</span>
                </label>
              ))
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function MatrixSection() {
  const {
    matrix,
    loading,
    error,
    refetch,
    setCell,
    setSchedule,
    setWritingStyle,
    removeCell,
    setWorkerAreas,
    setTaskAreas,
  } = useMatrix();
  const { areas } = useAreas();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  // Confirmação de remoção por célula (guarda a cellKey a remover).
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<void>, closeEdit = false) {
    setBusyKey(key);
    setActionError(null);
    try {
      await fn();
      if (closeEdit) setEditKey(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Não foi possível concluir");
    } finally {
      setBusyKey(null);
      refetch();
    }
  }

  async function onSetWritingStyle(cell: MatrixCell, enabled: boolean) {
    if (!cell.assignmentId) return;
    await run(`${cell.taskId}:${cell.workerId}`, () => setWritingStyle(cell.assignmentId!, enabled));
  }

  async function onToggle(cell: MatrixCell, enabled: boolean) {
    // Bloqueio de ativação (pré-requisitos): a célula fica criada/desativada; o
    // refetch mostra o porquê no próprio semáforo.
    await run(`${cell.taskId}:${cell.workerId}`, () => setCell(cell, enabled));
  }

  async function onRemove(cell: MatrixCell) {
    if (!cell.assignmentId) return;
    setConfirmRemove(null);
    await run(`${cell.taskId}:${cell.workerId}`, () => removeCell(cell.assignmentId!));
  }

  async function onSaveSchedule(cell: MatrixCell, cron: string) {
    if (!cell.assignmentId) return;
    await run(`${cell.taskId}:${cell.workerId}`, () => setSchedule(cell.assignmentId!, cron), true);
  }
  async function onClearSchedule(cell: MatrixCell) {
    if (!cell.assignmentId) return;
    await run(`${cell.taskId}:${cell.workerId}`, () => setSchedule(cell.assignmentId!, null), true);
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
  const areaName = new Map((areas ?? []).map((a) => [a.id, a.name]));
  const allAreas = areas ?? [];
  const tasks = matrix?.tasks ?? [];
  const workers = matrix?.workers ?? [];
  const noTasks = tasks.length === 0;
  const noWorkers = workers.length === 0;

  return (
    <section className="console-section">
      <h1>Atribuições</h1>
      <p className="muted">
        Mapa de utilizadores: cada linha é um trabalhador, cada coluna uma tarefa. Liga{" "}
        <strong>ON</strong> para pôr a tarefa a trabalhar (o trabalhador passa a vê-la);{" "}
        <strong>OFF</strong> pausa sem a esconder; <strong>Remover</strong> retira-a. As células fora
        das áreas em comum entre trabalhador e tarefa ficam esbatidas. O ponto mostra a prontidão das
        ligações: verde = pronto, âmbar = faltam permissões, vermelho = sem ligação.
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
          <table className="matrix-table matrix-users">
            <thead>
              <tr>
                <th className="matrix-corner">
                  <span className="matrix-corner-label">Trabalhador \ Tarefa</span>
                </th>
                {tasks.map((t) => {
                  const isAuto = t.type === "automation";
                  return (
                    <th key={t.id} className="matrix-taskhead">
                      <div className="matrix-headbox">
                        <span className="matrix-task-name" title={t.name}>
                          {t.name}
                        </span>
                        <span className="matrix-task-meta">
                          {isAuto ? "automática" : "assistida"}
                          {t.published ? "" : " · rascunho"}
                        </span>
                        <AreaPicker
                          label="Áreas"
                          allAreas={allAreas}
                          selected={t.areaIds}
                          onApply={(ids) =>
                            run(`task-areas:${t.id}`, () => setTaskAreas(t.id, ids))
                          }
                        />
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w.id}>
                  <th scope="row" className="matrix-worker">
                    <div className="matrix-headbox">
                      <span className="matrix-worker-name" title={w.email}>
                        {w.email}
                      </span>
                      <span className="matrix-worker-areas">
                        {w.areaIds.length === 0
                          ? "sem áreas"
                          : w.areaIds.map((id) => areaName.get(id) ?? "—").join(" · ")}
                      </span>
                      <AreaPicker
                        label="Áreas"
                        allAreas={allAreas}
                        selected={w.areaIds}
                        onApply={(ids) => run(`worker-areas:${w.id}`, () => setWorkerAreas(w.id, ids))}
                      />
                    </div>
                  </th>
                  {tasks.map((t) => {
                    const key = `${t.id}:${w.id}`;
                    const cell = cellByKey.get(key);
                    if (!cell) return <td key={t.id} className="matrix-cell" />;

                    const available = intersects(w.areaIds, t.areaIds);
                    if (!available) {
                      return (
                        <td key={t.id} className="matrix-cell matrix-cell-blocked" aria-disabled>
                          <span className="matrix-cell-dash" title="Sem área em comum">
                            —
                          </span>
                        </td>
                      );
                    }

                    const status = light(cell.readiness);
                    const blocked = !cell.readiness.eligible;
                    const busy = busyKey === key;
                    const isAuto = t.type === "automation";
                    const isWriting = t.runtime === "assistant.writing";
                    return (
                      <td
                        key={t.id}
                        className={`matrix-cell status-${status} ${cell.enabled ? "matrix-cell-on" : ""}`}
                      >
                        <div className="matrix-cell-head">
                          <Switch
                            checked={cell.enabled}
                            disabled={busy}
                            onChange={(v) => onToggle(cell, v)}
                            ariaLabel={`${cell.enabled ? "Desligar" : "Ligar"} ${t.name} para ${w.email}`}
                          />
                          <span className="readiness-dot" aria-label={status} title={status} />
                          {cell.assignmentId ? (
                            confirmRemove === key ? (
                              <span className="matrix-remove-confirm">
                                <button
                                  type="button"
                                  className="btn-mini danger"
                                  disabled={busy}
                                  onClick={() => onRemove(cell)}
                                >
                                  Confirmar
                                </button>
                                <button
                                  type="button"
                                  className="btn-mini ghost"
                                  disabled={busy}
                                  onClick={() => setConfirmRemove(null)}
                                >
                                  Não
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="btn-mini ghost matrix-remove"
                                disabled={busy}
                                title="Remover a atribuição (o trabalhador deixa de a ver)"
                                onClick={() => setConfirmRemove(key)}
                              >
                                Remover
                              </button>
                            )
                          ) : null}
                        </div>

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
                          <label
                            className="matrix-style"
                            title="Usar o .md de estilo deste trabalhador nas gerações de escrita"
                          >
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
