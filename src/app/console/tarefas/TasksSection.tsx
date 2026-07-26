"use client";

import { useCallback, useEffect, useState } from "react";
import { TaskForm } from "@/modules/tasks/ui/TaskForm";
import { TaskList } from "@/modules/tasks/ui/TaskList";
import { useTasks } from "@/modules/tasks/ui/hooks";
import type { Publishability, PublishBlocker } from "@/modules/tasks/domain/publishability";
import type { RequiredTool, Task } from "@/modules/tasks/domain/types";
import { useTools } from "@/modules/tools/ui/hooks";
import { useAreas } from "@/modules/org/ui/hooks";
import type { Tool } from "@/modules/tools/domain/types";

const BLOCKER_PT: Record<PublishBlocker, string> = {
  invalid_config_schema: "O config_schema não é um JSON Schema válido.",
  unknown_runtime: "O runtime não tem handler resolúvel.",
  unresolved_required_tools: "Há ferramentas exigidas por resolver (inexistentes ou scopes fora do declarado).",
};

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
  return body as T;
}

/* -- Editor de ferramentas exigidas + publicação (só com uma Task selecionada) -- */
function TaskDetail({
  task,
  tools,
  onPublished,
}: {
  task: Task;
  tools: Tool[] | null;
  onPublished: () => void;
}) {
  const { setRequiredTools, publish } = useTasks();
  const [sel, setSel] = useState<Record<string, { required: boolean; scopes: Set<string> }>>({});
  const [pub, setPub] = useState<Publishability | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setMsg(null);
    try {
      const [current, detail] = await Promise.all([
        apiGet<RequiredTool[]>(`/api/tasks/${task.id}/required-tools`),
        apiGet<{ publishability: Publishability }>(`/api/tasks/${task.id}`),
      ]);
      const map: Record<string, { required: boolean; scopes: Set<string> }> = {};
      for (const rt of current) map[rt.toolId] = { required: true, scopes: new Set(rt.scopes) };
      setSel(map);
      setPub(detail.publishability);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro a carregar detalhe");
    }
  }, [task.id]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleTool(toolId: string) {
    setSel((s) => {
      const cur = s[toolId] ?? { required: false, scopes: new Set<string>() };
      return { ...s, [toolId]: { ...cur, required: !cur.required } };
    });
  }
  function toggleScope(toolId: string, scope: string) {
    setSel((s) => {
      const cur = s[toolId] ?? { required: true, scopes: new Set<string>() };
      const scopes = new Set(cur.scopes);
      if (scopes.has(scope)) scopes.delete(scope);
      else scopes.add(scope);
      return { ...s, [toolId]: { required: true, scopes } };
    });
  }

  async function saveTools() {
    setBusy(true);
    setMsg(null);
    try {
      const items: RequiredTool[] = Object.entries(sel)
        .filter(([, v]) => v.required)
        .map(([toolId, v]) => ({ toolId, scopes: [...v.scopes] }));
      await setRequiredTools(task.id, items);
      await load();
      setMsg("Ferramentas exigidas guardadas.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro a guardar");
    } finally {
      setBusy(false);
    }
  }

  async function doPublish(unpublish: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await publish(task.id, unpublish);
      if (!unpublish && r.publishability) setPub(r.publishability);
      setMsg(unpublish ? "Tarefa despublicada." : r.published ? "Tarefa publicada." : "Não foi possível publicar.");
      onPublished();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro na publicação");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel task-detail">
      <h2>Ferramentas exigidas — {task.name}</h2>

      {!tools ? (
        <p className="muted">A carregar ferramentas…</p>
      ) : tools.length === 0 ? (
        <p className="muted">
          Sem ferramentas no catálogo. Regista-as primeiro em Ferramentas para as poderes exigir.
        </p>
      ) : (
        <ul className="req-tools">
          {tools.map((t) => {
            const s = sel[t.id];
            const required = s?.required ?? false;
            return (
              <li key={t.id}>
                <label className="req-tool-head">
                  <input type="checkbox" checked={required} onChange={() => toggleTool(t.id)} />
                  <span>
                    {t.name} <code>{t.key}</code>
                  </span>
                </label>
                {required && t.availableScopes.length > 0 ? (
                  <div className="req-scopes">
                    {t.availableScopes.map((scope) => (
                      <label key={scope}>
                        <input
                          type="checkbox"
                          checked={s?.scopes.has(scope) ?? false}
                          onChange={() => toggleScope(t.id, scope)}
                        />
                        <code>{scope}</code>
                      </label>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div className="task-detail-actions">
        <button type="button" disabled={busy} onClick={saveTools}>
          Guardar ferramentas
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={busy || (pub ? !pub.publishable : false)}
          onClick={() => doPublish(false)}
        >
          Publicar
        </button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => doPublish(true)}>
          Despublicar
        </button>
      </div>

      {pub && !pub.publishable ? (
        <div className="publish-blockers">
          <strong>Falta para publicar:</strong>
          <ul>
            {pub.blockers.map((b) => (
              <li key={b}>{BLOCKER_PT[b]}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {msg ? <p className="panel-note">{msg}</p> : null}
    </div>
  );
}

export function TasksSection() {
  const { tasks, loading, error, createTask, updateTask, refetch } = useTasks();
  const { tools } = useTools();
  const { areas } = useAreas();
  const [editing, setEditing] = useState<Task | null>(null);
  const [areaId, setAreaId] = useState<string>("");

  // Mantém a Task selecionada em sincronia com a lista após refetch.
  const selected = editing ? tasks?.find((t) => t.id === editing.id) ?? editing : null;

  return (
    <section className="console-section">
      <h1>Catálogo de Tarefas</h1>
      <p className="muted">
        Cria a tarefa, anexa as ferramentas exigidas e publica. Uma tarefa só publica com
        config_schema válido, runtime resolúvel e ferramentas resolvidas.
      </p>

      {error ? <p className="panel-error">{error}</p> : null}

      <div className="split">
        <div className="panel">
          <h2>{editing ? `Editar: ${editing.name}` : "Nova tarefa"}</h2>
          <label className="area-select">
            Área (opcional)
            <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
              <option value="">— sem área —</option>
              {(areas ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <TaskForm
            key={editing?.id ?? "new"}
            initial={editing ?? undefined}
            onSubmit={async (v) => {
              if (editing) {
                await updateTask(editing.id, {
                  name: v.name,
                  description: v.description,
                  runtime: v.runtime,
                  configSchema: v.configSchema,
                  areaId: areaId || null,
                });
                refetch();
              } else {
                await createTask({ ...v, areaId: areaId || null });
                setAreaId("");
              }
            }}
          />
          {editing ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setEditing(null);
                setAreaId("");
              }}
            >
              Nova tarefa
            </button>
          ) : null}
        </div>

        <div className="panel">
          <h2>Tarefas</h2>
          <TaskList
            tasks={tasks}
            loading={loading}
            onEdit={(t) => {
              setEditing(t);
              setAreaId(t.areaId ?? "");
            }}
          />
        </div>
      </div>

      {selected ? (
        <TaskDetail task={selected} tools={tools} onPublished={refetch} />
      ) : (
        <p className="muted select-hint">Seleciona ou cria uma tarefa para gerir ferramentas e publicar.</p>
      )}
    </section>
  );
}
