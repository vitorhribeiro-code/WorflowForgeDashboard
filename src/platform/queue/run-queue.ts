import { PgBoss, type ConstructorOptions } from "pg-boss";

// Port da fila EXATAMENTE como o M7 o consome:
//   queue.enqueue(runId)            — enfileira
//   queue.enqueue(runId, {delayMs}) — retry com backoff
export interface RunQueuePort {
  enqueue(runId: string, opts?: { delayMs?: number }): Promise<void>;
}

const QUEUE = "runs.process";

export type BossRole = "web" | "worker";

/**
 * Política de LIGAÇÕES do pg-boss, centralizada e testável.
 *
 * Cada instância PgBoss abre o SEU pool interno (default ~10) — à parte do pool
 * do Drizzle (`src/db/client.ts`, `max:5`). Em serverless cada lambda quente soma
 * os dois pools; sem teto, sob concorrência esgota as ligações do Postgres gerido
 * (Railway trial/Hobby tem poucas) e a query seguinte rebenta com `connection
 * timeout`. Por isso capamos o `max` por papel:
 *  - **web** (serverless): o boss só ENFILEIRA (`send`) e cada lambda tem o seu
 *    pool → teto BAIXO. `supervise`/`schedule` OFF (o worker é que supervisiona
 *    e agenda) para não segurar timers/ligações entre pedidos.
 *  - **worker** (processo único persistente): supervisiona + processa → teto
 *    modesto (o suficiente para fetch/complete/manutenção sem esgotar o servidor).
 *
 * SSL fica de fora de propósito: resolve-se pela própria connection string (a web
 * usa `sslmode` no URL; o worker fala em rede interna com `DATABASE_SSL=false`).
 * Mexer nisso aqui arriscaria uma regressão sem relação com o pooling.
 */
export function bossOptions(connectionString: string, role: BossRole): ConstructorOptions {
  const common = { connectionString, application_name: `wff-${role}-boss` };
  return role === "web"
    ? { ...common, max: 2, supervise: false, schedule: false }
    : { ...common, max: 5 };
}

// Adaptador pg-boss (usa o próprio Postgres como broker — dispensa Redis).
//
// CRÍTICO (lado do enqueue, processo web): no pg-boss v10+ um `send` exige que a
// instância esteja `start()`-ada E que a fila exista (`createQueue`). O container
// do M7 constrói o PgBoss mas não pode chamar `start()` (getRunsService é síncrono),
// por isso arrancamos preguiçosamente aqui, UMA vez, antes do primeiro envio.
export function createPgBossQueue(boss: PgBoss): RunQueuePort {
  let ready: Promise<void> | null = null;
  const ensureReady = (): Promise<void> => {
    if (!ready) {
      ready = (async () => {
        await boss.start();
        await boss.createQueue(QUEUE);
      })();
    }
    return ready;
  };

  return {
    async enqueue(runId, opts) {
      await ensureReady();
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
  const boss = new PgBoss(bossOptions(connectionString, "worker"));
  // Um erro do pg-boss não deve derrubar o worker (senão os digests param).
  boss.on("error", (e) => console.error("[pg-boss:worker]", e));
  await boss.start();
  await boss.createQueue(QUEUE);
  await boss.work<{ runId: string }>(QUEUE, async (jobs) => {
    for (const job of jobs) await processRun(job.data.runId);
  });
  return boss;
}
