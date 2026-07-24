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

export interface RunHandler {
  runtime: string;
  execute?(ctx: ExecContext): Promise<Record<string, unknown>>;
  stream?(ctx: ExecContext): AsyncIterable<RunEvent>;
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
