import { PgBoss } from "pg-boss";

// Port da fila EXATAMENTE como o M7 o consome:
//   queue.enqueue(runId)            — enfileira
//   queue.enqueue(runId, {delayMs}) — retry com backoff
export interface RunQueuePort {
  enqueue(runId: string, opts?: { delayMs?: number }): Promise<void>;
}

const QUEUE = "runs.process";

// Adaptador pg-boss (usa o próprio Postgres como broker — dispensa Redis).
export function createPgBossQueue(boss: PgBoss): RunQueuePort {
  return {
    async enqueue(runId, opts) {
      await boss.send(
        QUEUE,
        { runId },
        { startAfter: opts?.delayMs ? Math.ceil(opts.delayMs / 1000) : 0, retryLimit: 0 },
      );
    },
  };
}

// Entrypoint do worker (processo persistente). Liga a fila ao processRun do M7.
export async function startRunWorker(
  connectionString: string,
  processRun: (runId: string) => Promise<unknown>,
): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString });
  await boss.start();
  await boss.createQueue(QUEUE);
  await boss.work<{ runId: string }>(QUEUE, async (jobs) => {
    for (const job of jobs) await processRun(job.data.runId);
  });
  return boss;
}
