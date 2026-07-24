/**
 * Tipos de domínio do motor de execução (M7).
 *
 * Alinhado ao schema.ts (fonte de verdade):
 *   run_status  = queued | running | success | error   (NÃO há "cancelled")
 *   run_trigger = manual | schedule | webhook
 *
 * O cancelamento é modelado como terminal `error` + metadata `cancelled:true`
 * (o schema não tem estado próprio — ver nota de migração no README).
 *
 * Convenção de armazenamento:
 *   runs.input  → pertence a quem dispara (payload de negócio).
 *   runs.output → pertence ao motor: { result?, _engine: EngineMeta }.
 * Assim não misturamos metadata de execução com o input do utilizador.
 */

export type RunStatus = "queued" | "running" | "success" | "error";
export type RunTrigger = "manual" | "schedule" | "webhook";
// task_type do schema: automáticas correm na fila, assistidas com stream.
export type TaskType = "automation" | "assistant";

/** Resultado observável (derivado), já com o caso "cancelled". */
export type RunOutcome = "success" | "failed" | "cancelled";

/** Classe de erro: decide se um retry é permitido. */
export type ErrorClass = "transient" | "permanent";

export interface EngineMeta {
  attempt: number;
  retryOf?: string;
  errorClass?: ErrorClass;
  cancelled?: boolean;
}

export type RunOutput = {
  result?: Record<string, unknown>;
  _engine: EngineMeta;
}

/** Vista segura de um Run para a API/UI. */
export interface RunView {
  id: string;
  assignmentId: string;
  status: RunStatus;
  trigger: RunTrigger;
  outcome: RunOutcome | null; // null enquanto não-terminal
  attempt: number;
  retryOf?: string;
  errorClass?: ErrorClass;
  error: string | null;
  hasResult: boolean;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

const EMPTY_META: EngineMeta = { attempt: 1 };

export function readEngine(output: Record<string, unknown> | null | undefined): EngineMeta {
  const meta = (output as RunOutput | null)?._engine;
  return meta ? { ...EMPTY_META, ...meta } : { ...EMPTY_META };
}

export function withEngine(
  output: Record<string, unknown> | null | undefined,
  meta: Partial<EngineMeta>,
): RunOutput {
  const prev = (output as RunOutput | null) ?? { _engine: EMPTY_META };
  return { ...prev, _engine: { ...prev._engine, ...meta } };
}

export function deriveOutcome(status: RunStatus, meta: EngineMeta): RunOutcome | null {
  if (status === "success") return "success";
  if (status === "error") return meta.cancelled ? "cancelled" : "failed";
  return null; // queued | running
}
