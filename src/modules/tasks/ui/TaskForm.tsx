"use client";
import { useEffect, useState } from "react";
import { TASK_TYPES, type JsonSchema, type Task, type TaskType } from "../domain/types";
import { runtimesForType } from "../domain/runtimes";

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

  // Opções de runtime para o tipo atual. Runtime legado (fora do catálogo) é
  // preservado como opção para não ser trocado em silêncio ao editar.
  const runtimeOptions = runtimesForType(type);
  const legacyRuntime = runtime && !runtimeOptions.some((o) => o.key === runtime) ? runtime : null;

  // Mantém o runtime válido: em CRIAÇÃO, ao arrancar ou ao mudar o tipo, se o
  // atual não servir escolhe o primeiro disponível. Em edição não mexe.
  useEffect(() => {
    if (editing) return;
    const keys = runtimesForType(type).map((o) => o.key);
    setRuntime((cur) => (keys.includes(cur) ? cur : (runtimesForType(type)[0]?.key ?? "")));
  }, [type, editing]);

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
        <select value={runtime} onChange={(e) => setRuntime(e.target.value)}>
          {runtimeOptions.length === 0 && !legacyRuntime ? (
            <option value="">— sem runtime para este tipo —</option>
          ) : null}
          {legacyRuntime ? (
            <option value={legacyRuntime}>{legacyRuntime} (atual)</option>
          ) : null}
          {runtimeOptions.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label} — {o.key}
            </option>
          ))}
        </select>
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
