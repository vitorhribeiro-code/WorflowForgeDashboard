"use client";
import { useCallback, useEffect, useState } from "react";
import type { AiBindingView, AiProviderView } from "../domain/types";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", accept: "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
  return body as T;
}

function useList<T>(url: string) {
  const [items, setItems] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refetch = useCallback(() => {
    setLoading(true);
    setError(null);
    api<T[]>(url)
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : "Erro"))
      .finally(() => setLoading(false));
  }, [url]);
  useEffect(() => refetch(), [refetch]);
  return { items, loading, error, refetch };
}

export type CreateProviderArgs = {
  provider: string;
  apiKey?: string;
  defaultModel?: string | null;
  enabled?: boolean;
};

export function useAiProviders() {
  const { items, loading, error, refetch } = useList<AiProviderView>("/api/ai/providers");

  const create = useCallback(
    async (input: CreateProviderArgs) => {
      const p = await api<AiProviderView>("/api/ai/providers", {
        method: "POST",
        body: JSON.stringify(input),
      });
      refetch();
      return p;
    },
    [refetch],
  );

  const update = useCallback(
    async (id: string, patch: { apiKey?: string; defaultModel?: string | null; enabled?: boolean }) => {
      const p = await api<AiProviderView>(`/api/ai/providers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      refetch();
      return p;
    },
    [refetch],
  );

  const remove = useCallback(
    async (id: string) => {
      await api(`/api/ai/providers/${id}`, { method: "DELETE" });
      refetch();
    },
    [refetch],
  );

  return { providers: items, loading, error, refetch, create, update, remove };
}

export type SetBindingArgs = { capability: string; provider: string; model?: string | null };

export function useAiBindings() {
  const { items, loading, error, refetch } = useList<AiBindingView>("/api/ai/bindings");

  const set = useCallback(
    async (input: SetBindingArgs) => {
      const b = await api<AiBindingView>("/api/ai/bindings", {
        method: "PUT",
        body: JSON.stringify(input),
      });
      refetch();
      return b;
    },
    [refetch],
  );

  const remove = useCallback(
    async (id: string) => {
      await api(`/api/ai/bindings/${id}`, { method: "DELETE" });
      refetch();
    },
    [refetch],
  );

  return { bindings: items, loading, error, refetch, set, remove };
}
