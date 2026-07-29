// Interfaces de saída do M7 (RECONSTRUÍDO a partir do uso em runs.service.ts).
// O serviço depende só destas; os adaptadores reais vivem na plataforma/M8/M6.

/** Fila de execuções. O worker consumidor chama processRun(runId). */
export interface RunQueue {
  // enqueue(runId) normal; enqueue(runId, { delayMs }) para o backoff do retry.
  enqueue(runId: string, opts?: { delayMs?: number }): Promise<void>;
}

/** Resultado da verificação de prontidão (conexões suficientes). */
export interface ReadinessResult {
  ready: boolean;
  missing: Array<{ toolId: string; toolKey?: string; reason: string; missingScopes?: string[] }>;
}

/** Prontidão baseada na Task: resolve as required_tools e verifica conexões. */
export interface ReadinessChecker {
  check(workerId: string, taskId: string): Promise<ReadinessResult>;
}

/**
 * Aquisição de input a montante do handler. Corre no processRun ANTES do
 * dispatch, com o contexto do run (runtime + worker + config). Resolve o input
 * final que o handler recebe. O default (sem provider) é passar o `base` tal e
 * qual — os handlers continuam puros; só runtimes que precisam de dados
 * externos (ex.: email.digest → Gmail) enriquecem aqui.
 */
export interface InputAcquisitionContext {
  runtime: string;
  workerId: string;
  config: Record<string, unknown> | null;
  base: Record<string, unknown>;
}
export interface InputProvider {
  resolve(ctx: InputAcquisitionContext): Promise<Record<string, unknown>>;
}

/** Escrita de artefactos (ligado ao M8). */
export interface ArtifactSink {
  /** Log de execução → artefacto intermédio (efémero, JSON). */
  writeLog(input: {
    runId: string;
    name: string;
    body: Record<string, unknown>;
  }): Promise<void>;
  /**
   * Entregável final → tier work_document (cloud do worker). O M8 resolve o
   * worker a partir do runId. Pode lançar CLOUD_* (sem cloud/scope/token) —
   * o motor classifica como permanente.
   */
  writeDocument(input: {
    runId: string;
    filename: string;
    mimeType: string | null;
    bytes: Uint8Array;
    idempotencyKey?: string;
  }): Promise<{ id: string; storageRef: string }>;
}
