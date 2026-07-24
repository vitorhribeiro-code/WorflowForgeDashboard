"use client";
import { useCallback, useState } from "react";
import type { CandidateCompleteness, MappingDocument, TaskCandidate } from "../domain/types";

export type ReviewedCandidate = TaskCandidate & { completeness: CandidateCompleteness };

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

  return { candidates, warnings, error, busy, importDoc, convert };
}
