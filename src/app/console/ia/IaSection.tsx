"use client";

import { useState } from "react";
import { KNOWN_CAPABILITIES, KNOWN_PROVIDERS } from "@/modules/ai/domain/types";
import { useAiBindings, useAiProviders } from "@/modules/ai/ui/hooks";

type ProvidersHook = ReturnType<typeof useAiProviders>;

/* --- Providers ------------------------------------------------------------ */
function ProvidersBlock({ hook }: { hook: ProvidersHook }) {
  const { providers, error, create, update, remove } = hook;
  const [provider, setProvider] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Editor de chave por linha (id -> valor em edição).
  const [keyEdit, setKeyEdit] = useState<Record<string, string>>({});

  async function add() {
    if (!provider.trim()) return;
    setBusy(true);
    setFormError(null);
    try {
      await create({
        provider: provider.trim(),
        apiKey: apiKey.trim() || undefined,
        defaultModel: defaultModel.trim() || null,
      });
      setProvider("");
      setApiKey("");
      setDefaultModel("");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  async function saveKey(id: string) {
    const value = (keyEdit[id] ?? "").trim();
    if (!value) return;
    await update(id, { apiKey: value });
    setKeyEdit((s) => {
      const next = { ...s };
      delete next[id];
      return next;
    });
  }

  return (
    <div className="panel">
      <h2>Providers de IA</h2>
      <p className="muted">
        A chave de API é guardada cifrada e nunca é mostrada de volta (write-only). Podes registar
        um provider sem chave e defini-la mais tarde.
      </p>
      <div className="inline-form">
        <input
          list="ai-known-providers"
          value={provider}
          placeholder="provider (claude, mistral…)"
          onChange={(e) => setProvider(e.target.value)}
        />
        <input
          type="password"
          value={apiKey}
          placeholder="chave de API (opcional)"
          autoComplete="off"
          onChange={(e) => setApiKey(e.target.value)}
        />
        <input
          value={defaultModel}
          placeholder="modelo por defeito (opcional)"
          onChange={(e) => setDefaultModel(e.target.value)}
        />
        <button type="button" disabled={busy || !provider.trim()} onClick={add}>
          Registar
        </button>
      </div>
      <datalist id="ai-known-providers">
        {KNOWN_PROVIDERS.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      {formError ? <p className="panel-error">{formError}</p> : null}
      {error ? <p className="panel-error">{error}</p> : null}

      {!providers ? (
        <div className="muted">A carregar…</div>
      ) : providers.length === 0 ? (
        <div className="muted">Sem providers. Regista o primeiro.</div>
      ) : (
        <table className="user-table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Modelo default</th>
              <th>Chave</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {providers.map((p) => (
              <tr key={p.id}>
                <td>{p.provider}</td>
                <td>{p.defaultModel ?? "—"}</td>
                <td>{p.hasKey ? "✓ definida" : "— sem chave"}</td>
                <td>{p.enabled ? "Ativo" : "Desativado"}</td>
                <td className="user-actions">
                  {keyEdit[p.id] !== undefined ? (
                    <>
                      <input
                        type="password"
                        value={keyEdit[p.id]}
                        placeholder="nova chave"
                        autoComplete="off"
                        onChange={(e) => setKeyEdit((s) => ({ ...s, [p.id]: e.target.value }))}
                      />
                      <button type="button" onClick={() => saveKey(p.id)}>
                        Guardar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setKeyEdit((s) => ({ ...s, [p.id]: "" }))}
                    >
                      {p.hasKey ? "Substituir chave" : "Definir chave"}
                    </button>
                  )}
                  <button type="button" onClick={() => update(p.id, { enabled: !p.enabled })}>
                    {p.enabled ? "Desativar" : "Ativar"}
                  </button>
                  <button type="button" onClick={() => remove(p.id)}>
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* --- Bindings ------------------------------------------------------------- */
function BindingsBlock({ providerNames }: { providerNames: string[] }) {
  const { bindings, error, set, remove } = useAiBindings();
  const [capability, setCapability] = useState("");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const providerOptions = Array.from(new Set([...providerNames, ...KNOWN_PROVIDERS]));

  async function save() {
    if (!capability.trim() || !provider.trim()) return;
    setBusy(true);
    setFormError(null);
    try {
      await set({
        capability: capability.trim(),
        provider: provider.trim(),
        model: model.trim() || null,
      });
      setCapability("");
      setProvider("");
      setModel("");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h2>Bindings por capacidade</h2>
      <p className="muted">
        Cada capacidade (ex.: email.summary) aponta a um provider e, opcionalmente, a um modelo.
        Definir a mesma capacidade outra vez atualiza o binding.
      </p>
      <div className="inline-form">
        <input
          list="ai-known-capabilities"
          value={capability}
          placeholder="capability (email.summary…)"
          onChange={(e) => setCapability(e.target.value)}
        />
        <input
          list="ai-provider-names"
          value={provider}
          placeholder="provider"
          onChange={(e) => setProvider(e.target.value)}
        />
        <input
          value={model}
          placeholder="modelo (opcional)"
          onChange={(e) => setModel(e.target.value)}
        />
        <button
          type="button"
          disabled={busy || !capability.trim() || !provider.trim()}
          onClick={save}
        >
          Definir
        </button>
      </div>
      <datalist id="ai-known-capabilities">
        {KNOWN_CAPABILITIES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="ai-provider-names">
        {providerOptions.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      {formError ? <p className="panel-error">{formError}</p> : null}
      {error ? <p className="panel-error">{error}</p> : null}

      {!bindings ? (
        <div className="muted">A carregar…</div>
      ) : bindings.length === 0 ? (
        <div className="muted">Sem bindings. Liga uma capacidade a um provider.</div>
      ) : (
        <table className="user-table">
          <thead>
            <tr>
              <th>Capacidade</th>
              <th>Provider</th>
              <th>Modelo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {bindings.map((b) => {
              const orphan = !providerNames.includes(b.provider);
              return (
                <tr key={b.id}>
                  <td>{b.capability}</td>
                  <td>
                    {b.provider}
                    {orphan ? <span className="muted"> (provider não registado)</span> : null}
                  </td>
                  <td>{b.model ?? "—"}</td>
                  <td className="user-actions">
                    <button type="button" onClick={() => remove(b.id)}>
                      Remover
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function IaSection() {
  // Um único fetch de providers, partilhado: o form/tabela usa o hook e os
  // nomes alimentam o datalist dos bindings (sempre frescos após um registo).
  const providersHook = useAiProviders();
  const providerNames = (providersHook.providers ?? []).map((p) => p.provider);
  return (
    <section className="console-section">
      <h1>IA / Modelos</h1>
      <p className="muted">
        Regista as chaves de API dos providers de IA (cifradas em repouso) e liga cada capacidade a
        um provider/modelo. Só o super-utilizador acede a esta página.
      </p>
      <ProvidersBlock hook={providersHook} />
      <BindingsBlock providerNames={providerNames} />
    </section>
  );
}
