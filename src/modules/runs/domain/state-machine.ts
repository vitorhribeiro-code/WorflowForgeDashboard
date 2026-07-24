/**
 * Máquina de estados dos Runs (pura, sem IO).
 * Transições monotónicas: queued → running → (success | error).
 * Estados terminais não têm saída. Cancelar = ir para `error` (com meta).
 */

import type { RunStatus } from "./run.types";

const TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  queued: ["running", "error"], // error cobre cancelamento em fila
  running: ["success", "error"],
  success: [],
  error: [],
};

export const TERMINAL: readonly RunStatus[] = ["success", "error"];

export function isTerminal(status: RunStatus): boolean {
  return TERMINAL.includes(status);
}

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Só se pode cancelar enquanto não-terminal. */
export function canCancel(status: RunStatus): boolean {
  return !isTerminal(status);
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: RunStatus,
    public readonly to: RunStatus,
  ) {
    super(`Transição inválida: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function assertTransition(from: RunStatus, to: RunStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}
