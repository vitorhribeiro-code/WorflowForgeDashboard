"use client";
import { useCallback, useState } from "react";
import type { SessionContext } from "@/lib/session";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message ?? `HTTP ${res.status}`);
  return data as T;
}

export function useAuth() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (email: string, password: string) => {
    setBusy(true);
    setError(null);
    try {
      // O cookie de sessão é definido pelo servidor (HttpOnly).
      return await post<{ redirect: string; user: SessionContext }>("/api/auth/login", {
        email,
        password,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
      throw e;
    } finally {
      setBusy(false);
    }
  }, []);

  const logout = useCallback(() => post("/api/auth/logout", {}), []);

  const requestReset = useCallback(
    (email: string) => post("/api/auth/password-reset", { email }),
    [],
  );

  const confirmReset = useCallback(
    (token: string, password: string) =>
      post("/api/auth/password-reset/confirm", { token, password }),
    [],
  );

  return { login, logout, requestReset, confirmReset, busy, error };
}
