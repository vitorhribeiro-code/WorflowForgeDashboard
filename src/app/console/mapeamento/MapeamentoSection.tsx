"use client";

import { useMemo, useState } from "react";
import type { MappingDocument } from "@/modules/mapping/domain/types";
import { CandidateReview } from "@/modules/mapping/ui/CandidateReview";
import { useMapping, type ConvertSummary, type ReviewedCandidate } from "@/modules/mapping/ui/hooks";

// Página do M11: o admin carrega o JSON do mapeamento (do trabalhador tipo),
// revê os candidatos e converte os escolhidos em Tarefas do catálogo (M4).
// Slice 1: conversão em lote por loop (sem reconciliação/dedup — isso é a
// slice 2; a atribuição em massa é a slice 3).
export function MapeamentoSection() {
  const { candidates, warnings, error, busy, importDoc, convertMany } = useMapping();

  const [raw, setRaw] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<ConvertSummary | null>(null);

  // Só os selecionados que são de facto convertíveis contam para o botão.
  const selectableCount = useMemo(() => {
    if (!candidates) return 0;
    return candidates.filter((c) => selected.has(c.sourceRef) && c.completeness.convertible).length;
  }, [candidates, selected]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRaw(await file.text());
    setParseError(null);
  }

  function onImport() {
    setParseError(null);
    setResult(null);
    setSelected(new Set());
    let doc: MappingDocument;
    try {
      doc = JSON.parse(raw) as MappingDocument;
    } catch {
      setParseError("JSON inválido — verifica o ficheiro de mapeamento.");
      return;
    }
    void importDoc(doc);
  }

  function toggle(sourceRef: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sourceRef)) next.delete(sourceRef);
      else next.add(sourceRef);
      return next;
    });
  }

  function selectAllConvertible() {
    if (!candidates) return;
    setSelected(new Set(candidates.filter((c) => c.completeness.convertible).map((c) => c.sourceRef)));
  }

  async function convertList(list: ReviewedCandidate[]) {
    if (list.length === 0) return;
    const res = await convertMany(list);
    setResult(res);
  }

  async function onConvertSelected() {
    if (!candidates) return;
    await convertList(
      candidates.filter((c) => selected.has(c.sourceRef) && c.completeness.convertible),
    );
  }

  return (
    <section className="console-section">
      <h1>Importar mapeamento</h1>
      <p className="muted">
        Carrega o JSON do mapeamento (o do trabalhador tipo), revê os candidatos e converte os que
        quiseres em Tarefas do catálogo. O documento não é guardado — só origina rascunhos.
      </p>

      <div className="panel mapping-import">
        <label htmlFor="mapping-json">Documento de mapeamento (JSON)</label>
        <textarea
          id="mapping-json"
          className="mapping-textarea"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder='{ "source": "...", "opportunities": [ { "title": "...", "runtimeHint": "email.digest" } ] }'
          rows={8}
          spellCheck={false}
        />
        <div className="mapping-actions">
          <input type="file" accept=".json,application/json" onChange={onFile} />
          <button type="button" onClick={onImport} disabled={busy || raw.trim().length === 0}>
            {busy ? "A importar…" : "Importar"}
          </button>
        </div>
        {parseError ? <p className="mapping-error">{parseError}</p> : null}
        {error ? <p className="mapping-error">{error}</p> : null}
      </div>

      {candidates ? (
        <div className="panel">
          <div className="mapping-batchbar">
            <button type="button" className="btn-secondary" onClick={selectAllConvertible}>
              Selecionar convertíveis
            </button>
            <button type="button" onClick={onConvertSelected} disabled={busy || selectableCount === 0}>
              Converter selecionados ({selectableCount})
            </button>
          </div>

          <CandidateReview
            candidates={candidates}
            warnings={warnings}
            selected={selected}
            onToggleSelect={toggle}
            onConvert={(c) => void convertList([c])}
          />

          {result ? (
            <div className="mapping-result">
              <p>
                Criadas {result.created.length} tarefa(s)
                {result.failed.length > 0 ? `, ${result.failed.length} falha(s)` : ""}.
              </p>
              {result.failed.length > 0 ? (
                <ul className="mapping-failed">
                  {result.failed.map((f) => (
                    <li key={f.sourceRef}>
                      <code>{f.sourceRef}</code>: {f.error}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
