"use client";

import { useState } from "react";
import { Switch } from "@/modules/assignments/ui/Switch";
import {
  useAreasMatrix,
  type FanOutSummary,
  type ReconcileSummary,
} from "@/modules/assignments/ui/hooks";

function fanoutText(s: FanOutSummary): string {
  if (!s.enabled) return `Desligada em ${s.applied} de ${s.workers} trabalhador(es).`;
  const parts = [`${s.applied} ativada(s)`];
  if (s.pending) parts.push(`${s.pending} pendente(s)`);
  if (s.failed) parts.push(`${s.failed} falhada(s)`);
  return `${parts.join(" · ")} em ${s.workers} trabalhador(es).`;
}

function reconcileText(s: ReconcileSummary): string {
  const parts: string[] = [];
  if (s.enabled) parts.push(`${s.enabled} ativada(s)`);
  if (s.created) parts.push(`${s.created} criada(s)`);
  if (s.pending) parts.push(`${s.pending} pendente(s)`);
  if (s.removed) parts.push(`${s.removed} órfã(s) removida(s)`);
  if (s.failed) parts.push(`${s.failed} falhada(s)`);
  const body = parts.length ? parts.join(" · ") : "nada a alterar";
  return `${body} (${s.workers} trabalhador(es)).`;
}

export function AreaMatrixSection() {
  const { matrix, loading, error, refetch, setAreaCell, removeAreaCell, reconcileArea } =
    useAreasMatrix();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<string>) {
    setBusyKey(key);
    setActionError(null);
    try {
      const msg = await fn();
      setNote(msg);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Não foi possível concluir");
    } finally {
      setBusyKey(null);
      refetch();
    }
  }

  if (loading && !matrix) {
    return <div className="matrix-skeleton">A carregar…</div>;
  }
  if (error) {
    return <p className="panel-error">{error}</p>;
  }

  const cellByKey = new Map((matrix?.cells ?? []).map((c) => [`${c.areaId}:${c.taskId}`, c]));
  const areas = matrix?.areas ?? [];
  const tasks = matrix?.tasks ?? [];
  const noAreas = areas.length === 0;
  const noTasks = tasks.length === 0;

  return (
    <>
      <p className="muted">
        Mapa de áreas: cada linha é uma área, cada coluna uma tarefa. <strong>ON</strong> espalha a
        tarefa a todos os trabalhadores da área; <strong>OFF</strong> desativa esse espalhar;{" "}
        <strong>Remover</strong> apaga a intenção da área. <strong>Atualizar</strong> re-espalha as
        tarefas ligadas e limpa órfãs. As células fora das áreas em que a tarefa está disponível ficam
        esbatidas.
      </p>

      {note ? <p className="map-note">{note}</p> : null}
      {actionError ? <p className="panel-error">{actionError}</p> : null}

      {noAreas || noTasks ? (
        <div className="panel">
          <p className="muted">
            {noAreas
              ? "Ainda não há áreas. Cria-as em Áreas & Utilizadores."
              : "Ainda não há tarefas. Cria a primeira no Catálogo."}
          </p>
        </div>
      ) : (
        <div className="panel matrix-wrap">
          <table className="matrix-table matrix-users">
            <thead>
              <tr>
                <th className="matrix-corner">
                  <span className="matrix-corner-label">Área \ Tarefa</span>
                </th>
                {tasks.map((t) => (
                  <th key={t.id} className="matrix-taskhead">
                    <div className="matrix-headbox">
                      <span className="matrix-task-name" title={t.name}>
                        {t.name}
                      </span>
                      <span className="matrix-task-meta">
                        {t.type === "automation" ? "automática" : "assistida"}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {areas.map((a) => {
                const rk = `reconcile:${a.id}`;
                return (
                  <tr key={a.id}>
                    <th scope="row" className="matrix-worker">
                      <div className="matrix-headbox">
                        <span className="matrix-worker-name" title={a.name}>
                          {a.name}
                        </span>
                        <button
                          type="button"
                          className="btn-mini ghost"
                          disabled={busyKey !== null}
                          title="Re-espalhar as tarefas ligadas e limpar órfãs por disponibilidade"
                          onClick={() =>
                            run(rk, async () => reconcileText(await reconcileArea(a.id)))
                          }
                        >
                          Atualizar
                        </button>
                      </div>
                    </th>
                    {tasks.map((t) => {
                      const key = `${a.id}:${t.id}`;
                      const cell = cellByKey.get(key);
                      if (!cell || !cell.available) {
                        return (
                          <td key={t.id} className="matrix-cell matrix-cell-blocked" aria-disabled>
                            <span className="matrix-cell-dash" title="Tarefa não disponível nesta área">
                              —
                            </span>
                          </td>
                        );
                      }
                      const busy = busyKey === key;
                      return (
                        <td key={t.id} className={`matrix-cell ${cell.enabled ? "matrix-cell-on" : ""}`}>
                          <div className="matrix-cell-head">
                            <Switch
                              checked={cell.enabled}
                              disabled={busy}
                              ariaLabel={`${cell.enabled ? "Desligar" : "Ligar"} ${t.name} na área ${a.name}`}
                              onChange={(v) =>
                                run(key, async () => fanoutText(await setAreaCell(a.id, t.id, v)))
                              }
                            />
                            {confirmRemove === key ? (
                              <span className="matrix-remove-confirm">
                                <button
                                  type="button"
                                  className="btn-mini danger"
                                  disabled={busy}
                                  onClick={() => {
                                    setConfirmRemove(null);
                                    run(key, async () => fanoutText(await removeAreaCell(a.id, t.id)));
                                  }}
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
                                title="Apagar a intenção desta área (desativa o espalhar)"
                                onClick={() => setConfirmRemove(key)}
                              >
                                Remover
                              </button>
                            )}
                          </div>
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
    </>
  );
}
