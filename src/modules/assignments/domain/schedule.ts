import { cronMatches, windowKeyOf } from "./cron";

// Uma atribuição agendada, reduzida ao mínimo que o scheduler precisa.
export type ScheduledAssignment = { assignmentId: string; schedule: string };

// Um par (atribuição, janela) a enfileirar. A windowKey dá a idempotência: o
// enqueue do M7 deduplica por (assignmentId, trigger, windowKey), por isso
// reprocessar a mesma janela não cria Runs duplicados.
export type DueEnqueue = { assignmentId: string; windowKey: string };

// Teto de catch-up: mesmo que o intervalo pedido seja maior, só se percorre
// esta quantidade de minutos para trás, para o ciclo ser sempre finito.
export const MAX_WINDOW_MINUTES = 60;

function floorToMinute(d: Date): Date {
  return new Date(Math.floor(d.getTime() / 60_000) * 60_000);
}

// Percorre minuto-a-minuto o intervalo [from, to] (inclusive, truncado ao
// minuto UTC) e, para cada atribuição cujo cron casa nesse minuto, emite um
// {assignmentId, windowKey}. Determinístico e sem I/O — o coração testável do
// scheduler. Se o endpoint correr a cada N minutos, este catch-up garante que
// nenhum minuto agendado dentro da janela é perdido (a idempotência trata os
// re-disparos da sobreposição entre invocações).
export function computeDue(
  items: ScheduledAssignment[],
  from: Date,
  to: Date,
  maxWindowMinutes: number = MAX_WINDOW_MINUTES,
): DueEnqueue[] {
  const out: DueEnqueue[] = [];
  const end = floorToMinute(to);
  const rawStart = floorToMinute(from);
  if (end.getTime() < rawStart.getTime()) return out;

  const cap = Math.max(1, maxWindowMinutes);
  const start = new Date(
    Math.max(rawStart.getTime(), end.getTime() - (cap - 1) * 60_000),
  );

  for (let t = start.getTime(); t <= end.getTime(); t += 60_000) {
    const minute = new Date(t);
    const windowKey = windowKeyOf(minute);
    for (const it of items) {
      if (cronMatches(it.schedule, minute)) {
        out.push({ assignmentId: it.assignmentId, windowKey });
      }
    }
  }
  return out;
}
