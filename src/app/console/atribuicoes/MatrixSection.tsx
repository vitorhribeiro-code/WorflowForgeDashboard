"use client";

import { useState } from "react";
import { light } from "@/modules/assignments/ui/AssignmentCell";
import { useMatrix } from "@/modules/assignments/ui/hooks";
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
  const { matrix, loading, error, refetch, setCell } = useMatrix();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
        verde = pronto, âmbar = faltam permissões, vermelho = sem ligação.
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
              {matrix!.tasks.map((t) => (
                <tr key={t.id}>
                  <th scope="row" className="matrix-task">
                    <span className="matrix-task-name">{t.name}</span>
                    <span className="matrix-task-meta">
                      {t.type === "automation" ? "automática" : "assistida"}
                      {t.published ? "" : " · rascunho"}
                    </span>
                  </th>
                  {matrix!.workers.map((w) => {
                    const key = `${t.id}:${w.id}`;
                    const cell = cellByKey.get(key);
                    if (!cell) return <td key={w.id} />;
                    const status = light(cell.readiness);
                    const blocked = !cell.readiness.eligible;
                    return (
                      <td key={w.id} className={`matrix-cell status-${status}`}>
                        <label className="matrix-toggle">
                          <input
                            type="checkbox"
                            checked={cell.enabled}
                            disabled={busyKey === key}
                            onChange={(e) => onToggle(cell, e.target.checked)}
                          />
                          <span className="readiness-dot" aria-label={status} title={status} />
                          <span className="matrix-state">{cell.enabled ? "Ativa" : "Inativa"}</span>
                        </label>
                        {blocked ? (
                          <span className="matrix-missing">{missingText(cell.readiness)}</span>
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
