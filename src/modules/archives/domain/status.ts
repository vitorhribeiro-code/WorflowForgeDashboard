// Máquina de estados do arquivo mensal. Segue o schema (NÃO a docx):
//   schema: pending · running · success · error
//   docx dizia: pending · building · ready · error  (building->running, ready->success)
export type ArchiveStatus = "pending" | "running" | "success" | "error";

const ALLOWED: Record<ArchiveStatus, ArchiveStatus[]> = {
  pending: ["running"],
  running: ["success", "error"],
  error: ["running"], // reprocessamento
  success: [], // terminal
};

export function canTransition(from: ArchiveStatus, to: ArchiveStatus): boolean {
  return ALLOWED[from].includes(to);
}

/** success é terminal. */
export function isTerminal(s: ArchiveStatus): boolean {
  return s === "success";
}

/** Caminho idempotente do build: só consolida a partir de pending ou error. */
export function isBuildable(s: ArchiveStatus): boolean {
  return s === "pending" || s === "error";
}

/** Reprocessamento (admin): parte de error ou de running preso; nunca de success. */
export function isReprocessable(s: ArchiveStatus): boolean {
  return s === "error" || s === "running";
}
