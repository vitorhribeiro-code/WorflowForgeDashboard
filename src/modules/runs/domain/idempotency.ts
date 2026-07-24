import type { RunTrigger } from "./run.types";

// -------------------------------------------------------------------------- //
//  Idempotência (RECONSTRUÍDO). Regra do handoff:                              //
//   - manual  → NUNCA deduplica (cada disparo é um Run novo) → null.           //
//   - schedule/webhook → deduplicam por JANELA (windowKey).                    //
//  Sem windowKey não há como deduplicar → null.                               //
// -------------------------------------------------------------------------- //
export function buildIdempotencyKey(input: {
  assignmentId: string;
  trigger: RunTrigger;
  windowKey?: string | null;
}): string | null {
  if (input.trigger === "manual") return null;
  if (!input.windowKey) return null;
  return `${input.assignmentId}:${input.trigger}:${input.windowKey}`;
}

// Backoff exponencial para retries: 1s, 2s, 4s, 8s… com teto de 60s.
const BASE_MS = 1000;
const MAX_MS = 60_000;

export function backoffMs(attempt: number): number {
  const exp = Math.max(0, attempt - 1); // attempt=2 (1.º retry) → 2^1 = 2s
  return Math.min(BASE_MS * 2 ** exp, MAX_MS);
}
