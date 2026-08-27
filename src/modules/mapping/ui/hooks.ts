"use client";
import { useCallback, useState } from "react";
import type { CollisionMatch } from "../domain/collision";
import type { CandidateCompleteness, MappingDocument, TaskCandidate } from "../domain/types";

export type ReviewedCandidate = TaskCandidate & { completeness: CandidateCompleteness };

// Decisão do admin perante uma colisão (dedup slice 2).
export type ConvertDecision = { kind: "create" } | { kind: "reuse"; taskId: string };

// Desfecho de uma conversão (espelha o serviço).
export type ConvertOutcome =
  | { status: "created"; id: string }
  | { status: "reused"; id: string }
  | { status: "needs_decision"; existing: CollisionMatch[] };

// Resumo de uma conversão em lote: criadas, reutilizadas, à espera de decisão
// (colisão) e falhadas.
export type ConvertSummary = {
  created: Array<{ sourceRef: string; id: string }>;
  reused: Array<{ sourceRef: string; id: string }>;
  pending: Array<{ sourceRef: string; existing: CollisionMatch[] }>;
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

  // Converte um candidato (com overrides + decisão do admin) em Task no M4.
  // Devolve o desfecho: created / reused / needs_decision (colisão).
  const convert = useCallback(
    (
      candidate: TaskCandidate,
      overrides?: { runtime?: string; areaId?: string | null },
      decision?: ConvertDecision,
    ) =>
      post<ConvertOutcome>("/api/mapping/convert", { candidate, overrides, decision }),
    [],
  );

  // Converte vários candidatos em lote (dedup slice 2): sequencial, sem forçar.
  // Cada colisão vai para `pending` (o admin decide depois); falha de um não
  // trava os restantes — devolve o resumo por candidato.
  const convertMany = useCallback(
    async (cands: TaskCandidate[]): Promise<ConvertSummary> => {
      const created: ConvertSummary["created"] = [];
      const reused: ConvertSummary["reused"] = [];
      const pending: ConvertSummary["pending"] = [];
      const failed: ConvertSummary["failed"] = [];
      setBusy(true);
      try {
        for (const c of cands) {
          try {
            const outcome = await convert(c);
            if (outcome.status === "created") created.push({ sourceRef: c.sourceRef, id: outcome.id });
            else if (outcome.status === "reused") reused.push({ sourceRef: c.sourceRef, id: outcome.id });
            else pending.push({ sourceRef: c.sourceRef, existing: outcome.existing });
          } catch (e) {
            failed.push({ sourceRef: c.sourceRef, error: e instanceof Error ? e.message : "Erro" });
          }
        }
      } finally {
        setBusy(false);
      }
      return { created, reused, pending, failed };
    },
    [convert],
  );

  return { candidates, warnings, error, busy, importDoc, convert, convertMany };
}
