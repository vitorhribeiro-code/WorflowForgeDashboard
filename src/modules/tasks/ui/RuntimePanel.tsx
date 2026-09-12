"use client";
import { useState } from "react";
import { TASK_TYPES, type TaskType } from "../domain/types";
import type { RuntimeCatalogItem } from "../domain/runtime-catalog";
import type { NewRuntimeInput } from "./runtime-hooks";

type Props = {
  runtimes: RuntimeCatalogItem[] | null;
  onCreate: (input: NewRuntimeInput) => Promise<unknown>;
};

// v52: gerir runtimes na consola. Lista o catálogo e cria runtimes GENERATED
// (apoiados no executor genérico — v51). Os built-in aparecem para referência.
export function RuntimePanel({ runtimes, onCreate }: Props) {
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [type, setType] = useState<TaskType>("assistant");
  const [instruction, setInstruction] = useState("");
  const [system, setSystem] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const builtins = (runtimes ?? []).filter((r) => r.kind === "builtin");
  const generated = (runtimes ?? []).filter((r) => r.kind === "generic");

  async function submit() {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await onCreate({
        key: key.trim().toLowerCase(),
        label: label.trim(),
        taskType: type,
        instruction: instruction.trim(),
        system: system.trim() || undefined,
      });
      setOk(`Runtime "${key.trim().toLowerCase()}" criado. Já aparece no dropdown das tarefas ${type}.`);
      setKey("");
      setLabel("");
      setInstruction("");
      setSystem("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar runtime");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h2>Runtimes (capacidades)</h2>
      <p className="muted">
        Um runtime é o <em>como</em> de uma tarefa. Os built-in têm código próprio; os que criares
        aqui (generated) correm no executor genérico a partir da instrução. Ficam disponíveis para as
        tarefas de qualquer trabalhador.
      </p>

      <div className="split">
        <div>
          <h3>No catálogo</h3>
          <ul className="muted" style={{ lineHeight: 1.6 }}>
            {builtins.map((r) => (
              <li key={r.key}>
                <strong>{r.label}</strong> — {r.key} · {r.taskType} · built-in
              </li>
            ))}
            {generated.length === 0 ? (
              <li>— ainda não há runtimes gerados —</li>
            ) : (
              generated.map((r) => (
                <li key={r.key}>
                  <strong>{r.label}</strong> — {r.key} · {r.taskType} · gerado
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="task-form">
          <h3>Criar runtime generated</h3>
          <label>
            key (namespaced)
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="custom.resumo"
            />
          </label>
          <label>
            Rótulo
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Resumo personalizado"
            />
          </label>
          <label>
            Tipo
            <select value={type} onChange={(e) => setType(e.target.value as TaskType)}>
              {TASK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label>
            Instrução (o que este runtime faz)
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={4}
              placeholder="Resume o texto fornecido em 3 pontos, em português europeu."
            />
          </label>
          <label>
            System (opcional)
            <input
              value={system}
              onChange={(e) => setSystem(e.target.value)}
              placeholder="Sê conciso e rigoroso."
            />
          </label>
          {error ? <p className="task-form-error">{error}</p> : null}
          {ok ? <p className="muted">{ok}</p> : null}
          <button type="button" disabled={busy} onClick={submit}>
            {busy ? "A criar…" : "Criar runtime"}
          </button>
        </div>
      </div>
    </div>
  );
}
