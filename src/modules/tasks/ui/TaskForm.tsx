"use client";
import { useState } from "react";
import { TASK_TYPES, type JsonSchema, type Task, type TaskType } from "../domain/types";

type Props = {
  initial?: Task;
  onSubmit: (v: {
    name: string;
    description: string | null;
    type: TaskType;
    runtime: string;
    configSchema: JsonSchema | null;
  }) => Promise<void>;
};

// type imutável em edição (muda a semântica de execução). Sem <form>.
export function TaskForm({ initial, onSubmit }: Props) {
  const editing = Boolean(initial);
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [type, setType] = useState<TaskType>(initial?.type ?? "automation");
  const [runtime, setRuntime] = useState(initial?.runtime ?? "");
  const [schemaText, setSchemaText] = useState(
    initial?.configSchema ? JSON.stringify(initial.configSchema, null, 2) : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    let configSchema: JsonSchema | null = null;
    if (schemaText.trim()) {
      try {
        configSchema = JSON.parse(schemaText);
      } catch {
        setError("config_schema não é JSON válido");
        setBusy(false);
        return;
      }
    }
    try {
      await onSubmit({ name, description: description || null, type, runtime, configSchema });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="task-form">
      <label>
        Nome
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Descrição
        <input value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label>
        Tipo
        <select
          value={type}
          disabled={editing}
          onChange={(e) => setType(e.target.value as TaskType)}
        >
          {TASK_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label>
        Runtime
        <input value={runtime} onChange={(e) => setRuntime(e.target.value)} />
      </label>
      <label>
        config_schema (JSON Schema)
        <textarea value={schemaText} onChange={(e) => setSchemaText(e.target.value)} rows={8} />
      </label>
      {error ? <p className="task-form-error">{error}</p> : null}
      <button type="button" disabled={busy} onClick={submit}>
        {editing ? "Guardar" : "Criar"}
      </button>
    </div>
  );
}
