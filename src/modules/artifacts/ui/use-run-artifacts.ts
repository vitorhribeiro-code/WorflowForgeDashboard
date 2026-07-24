// Único ponto da UI que conhece endpoints. Os componentes não sabem de URLs.
"use client";
import { useCallback, useEffect, useState } from "react";
import type { ArtifactView } from "../domain/artifact";

interface State {
  artifacts: ArtifactView[];
  loading: boolean;
  error: string | null;
}

export function useRunArtifacts(runId: string) {
  const [state, setState] = useState<State>({ artifacts: [], loading: true, error: null });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch(`/api/runs/${runId}/artifacts`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // datas vêm como string no JSON -> reidratar
      const artifacts: ArtifactView[] = data.artifacts.map((a: any) => ({
        ...a,
        expiresAt: a.expiresAt ? new Date(a.expiresAt) : null,
        createdAt: new Date(a.createdAt),
      }));
      setState({ artifacts, loading: false, error: null });
    } catch (e) {
      setState({ artifacts: [], loading: false, error: (e as Error).message });
    }
  }, [runId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Pede o link e abre-o. Devolve false se o artefacto já não é descarregável. */
  const download = useCallback(async (artifactId: string): Promise<boolean> => {
    const res = await fetch(`/api/artifacts/${artifactId}/download`);
    if (!res.ok) return false;
    const { url } = await res.json();
    if (typeof window !== "undefined") window.open(url, "_blank", "noopener");
    return true;
  }, []);

  return { ...state, refresh, download };
}
