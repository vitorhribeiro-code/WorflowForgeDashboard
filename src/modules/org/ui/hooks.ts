"use client";
import { useCallback, useEffect, useState } from "react";
import type { FunctionalArea, Role, User } from "../domain/types";

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

export function useAreas() {
  const { items, loading, error, refetch } = useList<FunctionalArea>("/api/areas");
  const create = useCallback(
    async (name: string, description?: string) => {
      const a = await api<FunctionalArea>("/api/areas", {
        method: "POST",
        body: JSON.stringify({ name, description }),
      });
      refetch();
      return a;
    },
    [refetch],
  );
  const remove = useCallback(
    async (id: string) => {
      await api(`/api/areas/${id}`, { method: "DELETE" });
      refetch();
    },
    [refetch],
  );
  return { areas: items, loading, error, refetch, create, remove };
}

export function useUsers() {
  const { items, loading, error, refetch } = useList<User>("/api/users");
  const invite = useCallback(
    async (email: string, role: Role = "worker", name?: string) => {
      const u = await api<User>("/api/users", {
        method: "POST",
        body: JSON.stringify({ email, role, name }),
      });
      refetch();
      return u;
    },
    [refetch],
  );
  const setSuspended = useCallback(
    async (id: string, suspended: boolean) => {
      await api(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify({ suspended }) });
      refetch();
    },
    [refetch],
  );
  const changeRole = useCallback(
    async (id: string, role: Role) => {
      await api(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify({ role }) });
      refetch();
    },
    [refetch],
  );
  // Gera um link de definição de password (convite manual / reenvio). Não muda a
  // lista, logo não faz refetch — só devolve o URL para o admin entregar.
  const generateSetPasswordLink = useCallback(
    (id: string) =>
      api<{ url: string; expiresAt: string }>(`/api/users/${id}/set-password-link`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    [],
  );
  return {
    users: items,
    loading,
    error,
    refetch,
    invite,
    setSuspended,
    changeRole,
    generateSetPasswordLink,
  };
}
