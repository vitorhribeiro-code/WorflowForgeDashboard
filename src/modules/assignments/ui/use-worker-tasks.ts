// Único ponto da UI do worker que conhece endpoints. Os componentes não sabem
// de URLs — chamam estas funções. Espelha o padrão de use-connections (M6).
"use client";
import { useCallback, useEffect, useState } from "react";
import type { WorkerAssignmentView } from "@/modules/assignments";
import type { RunView } from "@/modules/runs";

// RunView tal como chega ao cliente: as datas viajam como string ISO (Response.json).
export type RunRow = Omit<RunView, "startedAt" | "finishedAt" | "createdAt"> & {
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

// Item do feed "Execuções recentes": um RunRow com o nome/runtime da tarefa.
export type MineRunRow = RunRow & { taskName: string; taskRuntime: string };

// Eventos do stream assistido (SSE). Espelha o RunEvent do handler + o "done"
// final do serviço. O "error" pode vir como {message} (handler) ou string (rota).
export type StreamEvent =
  | { type: "progress"; data?: Record<string, unknown> }
  | { type: "log"; data: { message: string } }
  | { type: "result"; data: Record<string, unknown> }
  | { type: "error"; data: { message: string } | string }
  | { type: "done"; data: { run: RunRow } };

type Status = "idle" | "loading" | "ready" | "error";

async function httpError(res: Response): Promise<Error> {
  try {
    const body = (await res.json()) as { message?: string; error?: string };
    return new Error(body?.message ?? body?.error ?? `HTTP ${res.status}`);
  } catch {
    return new Error(`HTTP ${res.status}`);
  }
}

export function useWorkerTasks() {
  const [status, setStatus] = useState<Status>("idle");
  const [tasks, setTasks] = useState<WorkerAssignmentView[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/assignments/mine");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTasks((await res.json()) as WorkerAssignmentView[]);
      setStatus("ready");
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, tasks, error, refresh };
}

/* --- Ações (usadas pelos cartões) ---------------------------------------- */

export async function fetchHistory(assignmentId: string): Promise<RunRow[]> {
  const res = await fetch(`/api/assignments/${assignmentId}/runs`);
  if (!res.ok) throw await httpError(res);
  return (await res.json()) as RunRow[];
}

// Um email já resumido, para a vista tipo caixa de entrada.
export type SummaryEmail = {
  from: string;
  subject: string;
  receivedAt: string | null;
  resumo: string | null;
};

// Resultado estruturado do último resumo (o `output.result` do email.digest).
export type LastSummary = {
  period: string | null;
  total: number;
  emails: SummaryEmail[];
  ai?: { used?: boolean; provider?: string; model?: string } | null;
  generatedAt?: string;
};

// Último resumo produzido para a atribuição (por agendamento ou manual), ou null.
export async function fetchLastSummary(assignmentId: string): Promise<LastSummary | null> {
  const res = await fetch(`/api/assignments/${assignmentId}/last-summary`);
  if (!res.ok) throw await httpError(res);
  const body = (await res.json()) as { result: LastSummary | null };
  return body.result;
}

// Feed agregado dos últimos Runs do trabalhador (todas as suas atribuições).
export async function fetchMineRuns(limit = 6): Promise<MineRunRow[]> {
  const res = await fetch(`/api/runs/mine?limit=${limit}`);
  if (!res.ok) throw await httpError(res);
  return (await res.json()) as MineRunRow[];
}

// Atribuições do trabalhador (leitura simples, para o widget "Próxima ação",
// que vive na sidebar e não partilha o estado do painel).
export async function fetchMineAssignments(): Promise<WorkerAssignmentView[]> {
  const res = await fetch("/api/assignments/mine");
  if (!res.ok) throw await httpError(res);
  return (await res.json()) as WorkerAssignmentView[];
}

// Dispara manualmente uma automática (trigger=manual). Devolve o Run enfileirado.
export async function runNow(assignmentId: string): Promise<RunRow> {
  const res = await fetch(`/api/assignments/${assignmentId}/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw await httpError(res);
  return (await res.json()) as RunRow;
}

// Grava a ordem do board do trabalhador (assignmentIds na nova ordem).
export async function saveOrder(order: string[]): Promise<void> {
  const res = await fetch("/api/assignments/mine/order", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ order }),
  });
  if (!res.ok) throw await httpError(res);
}

export async function cancelRun(runId: string): Promise<RunRow> {
  const res = await fetch(`/api/runs/${runId}/cancel`, { method: "POST" });
  if (!res.ok) throw await httpError(res);
  return (await res.json()) as RunRow;
}

export async function retryRun(runId: string): Promise<RunRow> {
  const res = await fetch(`/api/runs/${runId}/retry`, { method: "POST" });
  if (!res.ok) throw await httpError(res);
  return (await res.json()) as RunRow;
}

/**
 * Abre o stream assistido (SSE por POST). Chama onEvent por cada frame até o
 * stream fechar. O cancelamento faz-se abortando o `signal` (o servidor propaga
 * o abort para o AbortSignal do handler).
 */
export async function openAssisted(
  assignmentId: string,
  onEvent: (e: StreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(`/api/assignments/${assignmentId}/assisted`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
    signal,
  });
  if (!res.ok || !res.body) throw await httpError(res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // Frames SSE separados por linha em branco.
    let sep = buffer.indexOf("\n\n");
    while (sep !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      const payload = line?.slice(5).trim();
      if (payload) {
        try {
          onEvent(JSON.parse(payload) as StreamEvent);
        } catch {
          /* ignora frame malformado */
        }
      }
      sep = buffer.indexOf("\n\n");
    }
  }
}
