"use client";
import { useCallback, useEffect, useState } from "react";
import type {
  AuditFilter,
  AuditLogRow,
  OperationalMetrics,
  Paginated,
} from "../domain/types";

// ÚNICO ponto da UI que conhece endpoints. Os componentes recebem dados por props.

type Async<T> = { data: T | null; loading: boolean; error: string | null; refetch: () => void };

function toParams(obj: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    p.set(k, v instanceof Date ? v.toISOString() : String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function useAsync<T>(fetcher: () => Promise<T>, deps: unknown[]): Async<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetcher()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Erro"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => run(), [run]);
  return { data, loading, error, refetch: run };
}

export function useAuditLogs(
  filter: AuditFilter & { page?: number; pageSize?: number },
): Async<Paginated<AuditLogRow>> {
  const qs = toParams(filter);
  return useAsync(() => getJson(`/api/audit-logs${qs}`), [qs]);
}

export function useOperationalMetrics(range?: {
  from?: Date;
  to?: Date;
}): Async<OperationalMetrics> {
  const qs = toParams(range ?? {});
  return useAsync(() => getJson(`/api/metrics${qs}`), [qs]);
}
