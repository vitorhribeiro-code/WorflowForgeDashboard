"use client";
import { useCallback, useEffect, useState } from "react";
import type { RuntimeCatalogItem } from "../domain/runtime-catalog";
import type { TaskType } from "../domain/types";

export type NewRuntimeInput = {
  key: string;
  label: string;
  taskType: TaskType;
  instruction: string;
  system?: string;
};

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

// Catálogo de runtimes (built-in + generated). Alimenta o dropdown do form e
// o painel de gestão. `createRuntime` cria um generated e refaz a lista.
export function useRuntimes() {
  const [runtimes, setRuntimes] = useState<RuntimeCatalogItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    setError(null);
    api<RuntimeCatalogItem[]>("/api/runtimes")
      .then(setRuntimes)
      .catch((e) => setError(e instanceof Error ? e.message : "Erro"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => refetch(), [refetch]);

  const createRuntime = useCallback(
    async (input: NewRuntimeInput) => {
      const rt = await api<RuntimeCatalogItem>("/api/runtimes", {
        method: "POST",
        body: JSON.stringify(input),
      });
      refetch();
      return rt;
    },
    [refetch],
  );

  return { runtimes, loading, error, refetch, createRuntime };
}
