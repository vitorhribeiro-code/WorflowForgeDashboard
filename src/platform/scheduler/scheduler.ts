import { DomainError } from "@/lib/errors";
import {
  computeDue,
  MAX_WINDOW_MINUTES,
  type ScheduledAssignment,
} from "@/modules/assignments/domain/schedule";
import { windowKeyOf } from "@/modules/assignments/domain/cron";

// Janela de catch-up por defeito (minutos). Um tick olha para trás este número
// de minutos, para tolerar folga entre invocações do cron do host. Limitado
// por MAX_WINDOW_MINUTES no computeDue.
export const DEFAULT_LOOKBACK_MINUTES = 5;

// Códigos de erro do enqueue que são ESPERADOS e não indicam avaria: a
// atribuição não está pronta (worker ainda não ligou a ferramenta) ou o estado
// mudou (desativada / já enfileirada nesta janela). Contam como "ignorados".
const EXPECTED_SKIP_CODES = new Set(["not_ready", "conflict"]);

export type SchedulerDeps = {
  // Candidatas ativas+automáticas+com cron (contexto de sistema).
  listScheduled: () => Promise<ScheduledAssignment[]>;
  // Enfileira uma execução agendada idempotente por janela. Lança DomainError
  // (`not_ready`/`conflict`) quando não deve correr — tratado como ignorado.
  enqueue: (cmd: { assignmentId: string; windowKey: string }) => Promise<void>;
  now?: () => Date;
  lookbackMinutes?: number;
};

export type SchedulerTickResult = {
  window: { from: string; to: string };
  considered: number; // atribuições agendadas ativas encontradas
  due: number; // pares (atribuição, minuto) que casaram o cron
  enqueued: number; // enfileirados de facto (inclui hits idempotentes já existentes)
  skipped: number; // não prontos / desativados / duplicados na janela
  errors: { assignmentId: string; windowKey: string; error: string }[];
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function createScheduler(deps: SchedulerDeps) {
  const now = deps.now ?? (() => new Date());
  const lookback = clamp(
    deps.lookbackMinutes ?? DEFAULT_LOOKBACK_MINUTES,
    1,
    MAX_WINDOW_MINUTES,
  );

  // Corre uma vez: apura o que é devido na janela [now-lookback+1, now] e
  // enfileira. Uma falha esperada (not_ready/conflict) é ignorada; uma
  // inesperada é registada em `errors`, MAS nunca aborta o tick — um cron mau
  // de uma atribuição não pode calar as restantes.
  async function tick(): Promise<SchedulerTickResult> {
    const to = now();
    const from = new Date(to.getTime() - (lookback - 1) * 60_000);

    const items = await deps.listScheduled();
    const due = computeDue(items, from, to, lookback);

    let enqueued = 0;
    let skipped = 0;
    const errors: SchedulerTickResult["errors"] = [];

    for (const d of due) {
      try {
        await deps.enqueue(d);
        enqueued++;
      } catch (err) {
        if (err instanceof DomainError && EXPECTED_SKIP_CODES.has(err.code)) {
          skipped++;
        } else {
          errors.push({ ...d, error: messageOf(err) });
        }
      }
    }

    return {
      window: { from: windowKeyOf(from), to: windowKeyOf(to) },
      considered: items.length,
      due: due.length,
      enqueued,
      skipped,
      errors,
    };
  }

  return { tick };
}

export type Scheduler = ReturnType<typeof createScheduler>;
