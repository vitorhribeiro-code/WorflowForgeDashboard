// Composition root do scheduler (§6.3). Liga o motor puro (createScheduler) às
// duas dependências reais: as atribuições agendadas (repo do M5) e o enqueue do
// motor de execução (M7), sempre em contexto de SISTEMA (session=null).
//
// O enqueue do M7 é idempotente por (assignmentId, trigger, windowKey), por isso
// re-disparos da mesma janela — inevitáveis com catch-up e sobreposição entre
// ticks — não criam Runs duplicados.
import { db } from "@/db/client";
import { loadEnv } from "@/platform/config/env";
import { DrizzleAssignmentRepository } from "@/modules/assignments/data/assignment.repository";
import { getRunsService } from "@/modules/runs/container";
import { createScheduler, type Scheduler } from "./scheduler";

let cached: Scheduler | null = null;

export function getScheduler(): Scheduler {
  if (cached) return cached;
  const env = loadEnv();
  const repo = new DrizzleAssignmentRepository(db);

  cached = createScheduler({
    listScheduled: () => repo.listScheduledActive(),
    async enqueue({ assignmentId, windowKey }) {
      // session=null → contexto de sistema (o serviço salta a autorização de
      // ator e valida prontidão/estado por dentro). Lança not_ready/conflict
      // quando não deve correr; o scheduler trata isso como "ignorado".
      await getRunsService().enqueue({
        session: null,
        assignmentId,
        trigger: "schedule",
        windowKey,
      });
    },
    lookbackMinutes: env.SCHEDULER_LOOKBACK_MINUTES,
  });
  return cached;
}
