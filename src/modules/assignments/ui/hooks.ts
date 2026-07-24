"use client";
import { useCallback, useEffect, useState } from "react";
import type { AssignmentReadiness, NewAssignment, TaskAssignment } from "../domain/types";

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
