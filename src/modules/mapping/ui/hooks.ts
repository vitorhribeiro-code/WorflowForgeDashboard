"use client";
import { useCallback, useState } from "react";
import type { CandidateCompleteness, MappingDocument, TaskCandidate } from "../domain/types";

export type ReviewedCandidate = TaskCandidate & { completeness: CandidateCompleteness };

// Resumo de uma conversão em lote: o que ficou no catálogo e o que falhou.
export type ConvertSummary = {
  created: Array<{ sourceRef: string; id: string }>;
  failed: Array<{ sourceRef: string; error: string }>;
};

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message ?? `HTTP ${res.status}`);
  return data as T;
}

export function useMapping() {
  const [candidates, setCandidates] = useState<ReviewedCandidate[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Importa o documento (JSON) e recebe os rascunhos.
  const importDoc = useCallback(async (doc: MappingDocument) => {
    setBusy(true);
    setError(null);
    try {
      const res = await post<{ candidates: ReviewedCandidate[]; warnings: string[] }>(
        "/api/mapping/parse",
        doc,
      );
      setCandidates(res.candidates);
      setWarnings(res.warnings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }, []);

  // Converte um candidato (com overrides do admin) em Task no M4.
  const convert = useCallback(
    (candidate: TaskCandidate, overrides?: { runtime?: string; areaId?: string | null }) =>
      post<{ id: string }>("/api/mapping/convert", { candidate, overrides }),
    [],
  );

  // Converte vários candidatos em lote. Slice 1: sequencial, sem reconciliação
  // server-side (dedup contra o catálogo é a slice 2). Falha de um não trava os
  // restantes — devolve o resumo por candidato.
  const convertMany = useCallback(
    async (cands: TaskCandidate[]): Promise<ConvertSummary> => {
      const created: ConvertSummary["created"] = [];
      const failed: ConvertSummary["failed"] = [];
      setBusy(true);
      try {
        for (const c of cands) {
          try {
            const { id } = await convert(c);
            created.push({ sourceRef: c.sourceRef, id });
          } catch (e) {
            failed.push({ sourceRef: c.sourceRef, error: e instanceof Error ? e.message : "Erro" });
          }
        }
      } finally {
        setBusy(false);
      }
      return { created, failed };
    },
    [convert],
  );

  return { candidates, warnings, error, busy, importDoc, convert, convertMany };
}
