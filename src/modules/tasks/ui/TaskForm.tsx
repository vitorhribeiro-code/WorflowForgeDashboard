"use client";
import { useEffect, useState } from "react";
import { TASK_TYPES, type JsonSchema, type Task, type TaskType } from "../domain/types";
import { runtimesForType } from "../domain/runtimes";
import type { RuntimeCatalogItem } from "../domain/runtime-catalog";

type Props = {
  initial?: Task;
  // Catálogo de runtimes (built-in + generated). Se ausente, cai no estático
  // (retrocompatível). v52: a página passa o catálogo lido de /api/runtimes.
  runtimeOptions?: RuntimeCatalogItem[];
  onSubmit: (v: {
    name: string;
    description: string | null;
    type: TaskType;
    runtime: string;
    configSchema: JsonSchema | null;
  }) => Promise<void>;
};

// type imutável em edição (muda a semântica de execução). Sem <form>.
export function TaskForm({ initial, runtimeOptions: catalog, onSubmit }: Props) {
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

  // Opções para o tipo atual: catálogo (built-in+generated) se fornecido, senão
  // o estático (fallback). Runtime legado (fora das opções) é preservado como
  // opção para não ser trocado em silêncio ao editar.
  const options: RuntimeCatalogItem[] = catalog
    ? catalog.filter((o) => o.taskType === type)
    : runtimesForType(type).map((r) => ({
        key: r.key,
        label: r.label,
        taskType: r.taskType,
        kind: "builtin" as const,
      }));
  const legacyRuntime = runtime && !options.some((o) => o.key === runtime) ? runtime : null;

  // Mantém o runtime válido: em CRIAÇÃO, ao arrancar ou ao mudar o tipo (ou o
  // catálogo chegar), se o atual não servir escolhe o primeiro. Em edição não mexe.
  useEffect(() => {
    if (editing) return;
    const keys = (catalog ? catalog.filter((o) => o.taskType === type) : runtimesForType(type)).map(
      (o) => o.key,
    );
    setRuntime((cur) => (keys.includes(cur) ? cur : (keys[0] ?? "")));
  }, [type, editing, catalog]);

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
          {options.length === 0 && !legacyRuntime ? (
            <option value="">— sem runtime para este tipo —</option>
          ) : null}
          {legacyRuntime ? (
            <option value={legacyRuntime}>{legacyRuntime} (atual)</option>
          ) : null}
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label} — {o.key}
              {o.kind === "generic" ? " (gerado)" : ""}
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
