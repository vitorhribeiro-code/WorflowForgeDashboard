import type { ErrorClass } from "../domain/run.types";
import { DomainError } from "@/lib/errors";

// Erros marcados explicitamente com a sua classe (usados pelos handlers).
export class TransientError extends Error {
  constructor(message: string) { super(message); this.name = "TransientError"; }
}
export class PermanentError extends Error {
  constructor(message: string) { super(message); this.name = "PermanentError"; }
}

// Classificação: decide se um retry é permitido. Desconhecido = permanente.
const TRANSIENT_CODES = new Set(["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "EPIPE"]);
const TRANSIENT_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export function classify(err: unknown): ErrorClass {
  if (err instanceof TransientError) return "transient";
  if (err instanceof PermanentError) return "permanent";
  const anyErr = err as { transient?: boolean; errorClass?: ErrorClass; code?: string; status?: number };
  if (anyErr?.errorClass === "transient" || anyErr?.errorClass === "permanent") return anyErr.errorClass;
  if (anyErr?.transient === true) return "transient";
  if (err instanceof DomainError) return "permanent"; // erros de domínio não se repetem
  if (typeof anyErr?.code === "string" && TRANSIENT_CODES.has(anyErr.code)) return "transient";
  if (typeof anyErr?.status === "number" && TRANSIENT_STATUS.has(anyErr.status)) return "transient";
  return "permanent";
}

export function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try { return JSON.stringify(err); } catch { return "Erro desconhecido"; }
}
