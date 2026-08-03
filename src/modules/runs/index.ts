// Entry-point público do M7 (motor de execução). Ponto de importação único para
// o processo worker (scripts/worker.ts) e para as app-routes. Mantém o container
// (getRunsService) encapsulado atrás de funções finas — quem consome não precisa
// de conhecer a montagem dos adaptadores (fila, readiness, handlers, artefactos).

import { getRunsService } from "./container";

export { getRunsService };
export type { RunsService, WorkerRunFeedItem } from "./service/runs.service";
export type { RunView, RunStatus, RunTrigger } from "./domain/run.types";

/**
 * Processa um Run da fila. Consumido pelo worker persistente: para cada job,
 * o pg-boss entrega o runId e este delega no serviço. Idempotente (só corre se
 * ainda `queued`), por isso é seguro em re-entregas da fila.
 */
export function processRun(runId: string): Promise<unknown> {
  return getRunsService().processRun(runId);
}
