// Entrypoint do processo WORKER (serviço separado no Railway).
// Consome a fila e delega no processRun do M7. Uso: `tsx scripts/worker.ts`.
import { loadEnv } from "@/platform/config/env";
import { startRunWorker } from "@/platform/queue/run-queue";
import { processRun } from "@/modules/runs";

async function main() {
  const env = loadEnv();

  // Cada job da fila `runs.process` entrega um runId; delega no motor do M7.
  // Erros num run não derrubam o worker: são registados e o run fica `error`
  // (o processRun trata a falha internamente e persiste o estado terminal).
  const boss = await startRunWorker(env.DATABASE_URL, async (runId) => {
    try {
      await processRun(runId);
    } catch (err) {
      console.error(`[worker] processRun(${runId}) lançou:`, err);
    }
  });
  console.info("[worker] a consumir a fila runs.process");

  const shutdown = async () => {
    await boss.stop();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
