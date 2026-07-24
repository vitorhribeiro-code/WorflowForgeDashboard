// Entrypoint do processo WORKER (serviço separado no Railway).
// Consome a fila e delega no processRun do M7. Uso: `tsx scripts/worker.ts`.
import { loadEnv } from "@/platform/config/env";
import { startRunWorker } from "@/platform/queue/run-queue";

async function main() {
  const env = loadEnv();

  // TODO M7: substituir por `import { processRun } from "@/modules/runs"`.
  const processRun = async (runId: string): Promise<void> => {
    console.warn(`[worker] recebido run ${runId} — ligar ao processRun do M7`);
  };

  const boss = await startRunWorker(env.DATABASE_URL, processRun);
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
