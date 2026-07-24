// Único ponto da UI que conhece endpoints. Os componentes não sabem de URLs.
"use client";
import { useCallback, useEffect, useState } from "react";
import type { MonthlyArchive } from "../domain/archive";

interface State {
  archives: MonthlyArchive[];
  loading: boolean;
  error: string | null;
}

function hydrate(a: any): MonthlyArchive {
  return { ...a, createdAt: new Date(a.createdAt) };
}

export function useArchives(filter?: { workerId?: string; period?: string }) {
  const [state, setState] = useState<State>({ archives: [], loading: true, error: null });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const qs = new URLSearchParams();
      if (filter?.workerId) qs.set("workerId", filter.workerId);
      if (filter?.period) qs.set("period", filter.period);
      const res = await fetch(`/api/archives?${qs.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setState({ archives: data.archives.map(hydrate), loading: false, error: null });
    } catch (e) {
      setState({ archives: [], loading: false, error: (e as Error).message });
    }
  }, [filter?.workerId, filter?.period]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const download = useCallback(async (id: string): Promise<boolean> => {
    const res = await fetch(`/api/archives/${id}/download`);
    if (!res.ok) return false;
    const { url } = await res.json();
    if (typeof window !== "undefined") window.open(url, "_blank", "noopener");
    return true;
  }, []);

  /** Reprocessar (admin). Devolve true se aceite. */
  const reprocess = useCallback(
    async (id: string): Promise<boolean> => {
      const res = await fetch(`/api/archives/${id}/reprocess`, { method: "POST" });
      if (res.ok) await refresh();
      return res.ok;
    },
    [refresh],
  );

  return { ...state, refresh, download, reprocess };
}
