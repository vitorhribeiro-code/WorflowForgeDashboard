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

/** Escrita de artefactos de log (ligado ao M8). */
export interface ArtifactSink {
  writeLog(input: {
    runId: string;
    name: string;
    body: Record<string, unknown>;
  }): Promise<void>;
}
