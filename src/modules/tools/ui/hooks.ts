"use client";
import { useCallback, useEffect, useState } from "react";
import type { NewTool, Tool, ToolPatch } from "../domain/types";

// ÚNICO ponto da UI que conhece endpoints.
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

export function useTools() {
  const [tools, setTools] = useState<Tool[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    setError(null);
    api<Tool[]>("/api/tools")
      .then(setTools)
      .catch((e) => setError(e instanceof Error ? e.message : "Erro"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => refetch(), [refetch]);

  const createTool = useCallback(
    async (input: NewTool) => {
      const t = await api<Tool>("/api/tools", { method: "POST", body: JSON.stringify(input) });
      refetch();
      return t;
    },
    [refetch],
  );

  const updateTool = useCallback(
    async (id: string, patch: ToolPatch) => {
      const t = await api<Tool>(`/api/tools/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      refetch();
      return t;
    },
    [refetch],
  );

  return { tools, loading, error, refetch, createTool, updateTool };
}
