"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { MAX_STYLE_BYTES } from "../domain/writing-style";
import { useWritingStyle } from "./use-writing-style";

const MAX_KB = Math.round(MAX_STYLE_BYTES / 1024);

export function WritingStyleModal({
  worker,
  onClose,
}: {
  worker: { id: string; email: string };
  onClose: () => void;
}) {
  const { style, loading, error, upload } = useWritingStyle(worker.id);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    setOk(null);
    const lower = file.name.toLowerCase();
    if (!(lower.endsWith(".md") || lower.endsWith(".markdown"))) {
      setErr("O ficheiro tem de ser .md (Markdown).");
      return;
    }
    if (file.size > MAX_STYLE_BYTES) {
      setErr(`O ficheiro excede o limite de ${MAX_KB} KB.`);
      return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      await upload(file.name, text);
      setOk(`Estilo guardado: ${file.name}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao guardar.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="wt-modal-overlay" onClick={onClose}>
      <div className="wt-modal ws-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wt-modal-head">
          <span className="wt-modal-title">Estilo de escrita — {worker.email}</span>
          <button className="wt-modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="wt-modal-body">
          {loading ? <p className="ws-muted">A carregar…</p> : null}
          {error ? <p className="ws-err">{error}</p> : null}

          {!loading && !error ? (
            style ? (
              <div className="ws-current">
                <p className="ws-line">
                  <strong>Ficheiro atual:</strong> {style.sourceFilename ?? "—"}
                </p>
                <p className="ws-muted">
                  {(style.bytes / 1024).toFixed(1)} KB · atualizado{" "}
                  {new Date(style.updatedAt).toLocaleString("pt-PT")}
                </p>
                <pre className="ws-preview">{style.contentMd}</pre>
              </div>
            ) : (
              <p className="ws-muted">Ainda não há estilo carregado para este trabalhador.</p>
            )
          ) : null}

          <div className="ws-upload">
            <label className="ws-btn">
              {style ? "Substituir .md" : "Carregar .md"}
              <input
                ref={inputRef}
                type="file"
                accept=".md,text/markdown"
                onChange={onFile}
                disabled={busy}
                hidden
              />
            </label>
            <span className="ws-hint">
              Só .md · até {MAX_KB} KB · texto de confiança (sem interpretação).
            </span>
          </div>

          {ok ? <p className="ws-ok">{ok}</p> : null}
          {err ? <p className="ws-err">{err}</p> : null}
        </div>
      </div>
    </div>
  );
}
