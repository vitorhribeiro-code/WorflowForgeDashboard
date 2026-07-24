"use client";
import { useCallback, useEffect, useState } from "react";
import type { Publishability } from "../domain/publishability";
import type { NewTask, RequiredTool, Task, TaskPatch } from "../domain/types";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", accept: "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function useTasks(filter: { areaId?: string; type?: string } = {}) {
  const qs = new URLSearchParams(
    Object.entries(filter).filter(([, v]) => v) as [string, string][],
  ).toString();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    setError(null);
    api<Task[]>(`/api/tasks${qs ? `?${qs}` : ""}`)
      .then(setTasks)
      .catch((e) => setError(e instanceof Error ? e.message : "Erro"))
      .finally(() => setLoading(false));
  }, [qs]);

  useEffect(() => refetch(), [refetch]);

  const createTask = useCallback(
    async (input: Omit<NewTask, "organizationId">) => {
      const t = await api<Task>("/api/tasks", { method: "POST", body: JSON.stringify(input) });
      refetch();
      return t;
    },
    [refetch],
  );

  const updateTask = useCallback(
    async (taskId: string, patch: TaskPatch) =>
      api<Task>(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(patch) }),
    [],
  );

  const setRequiredTools = useCallback(
    async (taskId: string, items: RequiredTool[]) =>
      api<RequiredTool[]>(`/api/tasks/${taskId}/required-tools`, {
        method: "PUT",
        body: JSON.stringify({ items }),
      }),
    [],
  );

  const publish = useCallback(
    async (taskId: string, unpublish = false) => {
      const t = await api<{ published: boolean; publishability?: Publishability }>(
        `/api/tasks/${taskId}/publish${unpublish ? "?unpublish=1" : ""}`,
        { method: "POST" },
      );
      refetch();
      return t;
    },
    [refetch],
  );

  return { tasks, loading, error, refetch, createTask, updateTask, setRequiredTools, publish };
}
