"use client";
import { useCallback, useEffect, useState } from "react";
import type { AssignmentReadiness, NewAssignment, TaskAssignment } from "../domain/types";
import type { AssignmentMatrix, MatrixCell } from "../service/ports";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", accept: "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.message ?? `HTTP ${res.status}`) as Error & { details?: unknown };
    err.details = body?.details;
    throw err;
  }
  return body as T;
}

export function useAssignments() {
  const [items, setItems] = useState<TaskAssignment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    setError(null);
    api<TaskAssignment[]>("/api/assignments")
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : "Erro"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => refetch(), [refetch]);

  const create = useCallback(
    async (input: NewAssignment) => {
      const a = await api<TaskAssignment>("/api/assignments", {
        method: "POST",
        body: JSON.stringify(input),
      });
      refetch();
      return a;
    },
    [refetch],
  );

  // Devolve a assignment atualizada; em bloqueio, o erro traz .details.
  const toggle = useCallback(
    async (id: string, enabled: boolean) => {
      const a = await api<TaskAssignment>(`/api/assignments/${id}/toggle`, {
        method: "POST",
        body: JSON.stringify({ enabled }),
      });
      refetch();
      return a;
    },
    [refetch],
  );

  const readiness = useCallback(
    (id: string) =>
      api<{ assignment: TaskAssignment; readiness: AssignmentReadiness }>(`/api/assignments/${id}`),
    [],
  );

  return { items, loading, error, refetch, create, toggle, readiness };
}

// Matriz Task × Trabalhador para a consola.
export function useMatrix() {
  const [matrix, setMatrix] = useState<AssignmentMatrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    setError(null);
    api<AssignmentMatrix>("/api/assignments/matrix")
      .then(setMatrix)
      .catch((e) => setError(e instanceof Error ? e.message : "Erro"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => refetch(), [refetch]);

  // Ativa/desativa uma célula. Cria a atribuição on-the-fly se ainda não existe.
  // Em bloqueio de ativação (pré-requisitos em falta) a atribuição fica criada e
  // desativada; o refetch traz a prontidão a explicar o que falta.
  const setCell = useCallback(async (cell: MatrixCell, enabled: boolean) => {
    let assignmentId = cell.assignmentId;
    if (!assignmentId) {
      if (!enabled) return; // desativar algo que não existe: nada a fazer
      const created = await api<{ id: string }>("/api/assignments", {
        method: "POST",
        body: JSON.stringify({ taskId: cell.taskId, workerId: cell.workerId }),
      });
      assignmentId = created.id;
    }
    await api(`/api/assignments/${assignmentId}/toggle`, {
      method: "POST",
      body: JSON.stringify({ enabled }),
    });
  }, []);

  // Define/limpa o cron de uma atribuição existente (null limpa). Só automáticas
  // aceitam schedule; o serviço rejeita assistidas e cron inválido (o erro
  // sobe com .message para a UI mostrar junto à célula).
  const setSchedule = useCallback(async (assignmentId: string, schedule: string | null) => {
    await api(`/api/assignments/${assignmentId}/schedule`, {
      method: "PUT",
      body: JSON.stringify({ schedule }),
    });
  }, []);

  // Liga/desliga o uso do estilo de escrita do worker (só assistant.writing).
  const setWritingStyle = useCallback(
    async (assignmentId: string, enabled: boolean) => {
      await api(`/api/assignments/${assignmentId}/use-writing-style`, {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      });
      refetch();
    },
    [refetch],
  );

  return { matrix, loading, error, refetch, setCell, setSchedule, setWritingStyle };
}
