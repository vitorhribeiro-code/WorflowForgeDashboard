// Handlers de runtime (RECONSTRUÍDO). Cada handler declara o seu runtime.
export type RunEvent =
  | { type: "progress"; data?: Record<string, unknown> }
  | { type: "log"; data: { message: string } }
  | { type: "result"; data: Record<string, unknown> }
  | { type: "error"; data: { message: string } };

export interface ExecContext {
  input: Record<string, unknown>;
  config: Record<string, unknown> | null;
  signal: AbortSignal;
  emit: (event: RunEvent) => void;
}

/**
 * Rascunho de um entregável final (work_document): bytes prontos para a cloud
 * do trabalhador. É uma função PURA do output do handler — testável sem rede.
 */
export interface DeliverableDraft {
  filename: string;
  mimeType: string | null;
  bytes: Uint8Array;
  /**
   * Chave estável que identifica "o mesmo documento" entre execuções (ex.:
   * `email.digest:2026-07`). Quando presente, o storage faz UPSERT: reescreve o
   * ficheiro anterior em vez de criar um novo. Ausente = cria sempre.
   */
  idempotencyKey?: string;
}

export interface RunHandler {
  runtime: string;
  execute?(ctx: ExecContext): Promise<Record<string, unknown>>;
  stream?(ctx: ExecContext): AsyncIterable<RunEvent>;
  /**
   * Opcional: transforma o output num entregável para a cloud do worker
   * (tier work_document). Devolver null = este run não produz entregável.
   */
  deliverable?(result: Record<string, unknown>): DeliverableDraft | null;
}

export interface HandlerRegistry {
  get(runtime: string): RunHandler | undefined;
  has(runtime: string): boolean;
}

// Recebe um ARRAY de handlers e indexa por runtime.
export function createHandlerRegistry(handlers: RunHandler[]): HandlerRegistry {
  const map = new Map(handlers.map((h) => [h.runtime, h]));
  return { get: (r) => map.get(r), has: (r) => map.has(r) };
}
