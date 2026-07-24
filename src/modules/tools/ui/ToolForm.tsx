"use client";
import { useState } from "react";
import { TOOL_AUTH_TYPES, type Tool, type ToolAuthType } from "../domain/types";

type Props = {
  initial?: Tool;
  onSubmit: (v: {
    key: string;
    name: string;
    authType: ToolAuthType;
    availableScopes: string[];
  }) => Promise<void>;
};

// Sem <form>: handlers explícitos. key/authType desativados em edição (imutáveis).
export function ToolForm({ initial, onSubmit }: Props) {
  const editing = Boolean(initial);
  const [key, setKey] = useState(initial?.key ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [authType, setAuthType] = useState<ToolAuthType>(initial?.authType ?? "oauth");
  const [scopesText, setScopesText] = useState((initial?.availableScopes ?? []).join("\n"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        key,
        name,
        authType,
        availableScopes: scopesText.split(/\s+/).filter(Boolean),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tool-form">
      <label>
        key
        <input value={key} disabled={editing} onChange={(e) => setKey(e.target.value)} />
      </label>
      <label>
        Nome
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Auth
        <select
          value={authType}
          disabled={editing}
          onChange={(e) => setAuthType(e.target.value as ToolAuthType)}
        >
          {TOOL_AUTH_TYPES.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>
      <label>
        Scopes (um por linha)
        <textarea value={scopesText} onChange={(e) => setScopesText(e.target.value)} />
      </label>
      {error ? <p className="tool-form-error">{error}</p> : null}
      <button type="button" disabled={busy} onClick={submit}>
        {editing ? "Guardar" : "Criar"}
      </button>
    </div>
  );
}
