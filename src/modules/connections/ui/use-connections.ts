// Único ponto da UI que conhece endpoints. Os componentes não sabem de URLs.
"use client";
import { useCallback, useEffect, useState } from "react";
import type { ConnectionView } from "../domain/connection.types";

type Status = "idle" | "loading" | "ready" | "error";

interface State {
  status: Status;
  connections: ConnectionView[];
  error: string | null;
}

function rehydrate(c: ConnectionView & { connectedAt: string | null }): ConnectionView {
  return { ...c, connectedAt: c.connectedAt ? new Date(c.connectedAt) : null };
}

export function useConnections() {
  const [state, setState] = useState<State>({
    status: "idle",
    connections: [],
    error: null,
  });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, status: "loading", error: null }));
    try {
      const res = await fetch("/api/connections");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Array<ConnectionView & { connectedAt: string | null }>;
      setState({ status: "ready", connections: data.map(rehydrate), error: null });
    } catch (e) {
      setState({ status: "error", connections: [], error: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Inicia o OAuth: pede o URL de consentimento e navega para lá.
  const connect = useCallback(async (toolId: string) => {
    const res = await fetch("/api/connections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ toolId }),
    });
    if (!res.ok) return;
    const { authorizationUrl } = (await res.json()) as { authorizationUrl: string };
    if (typeof window !== "undefined") window.location.assign(authorizationUrl);
  }, []);

  // Renova: se o refresh silencioso não chegar, o servidor devolve reauth.
  const renew = useCallback(
    async (toolId: string) => {
      const res = await fetch(`/api/connections/${toolId}/renew`, { method: "POST" });
      if (!res.ok) return;
      const out = (await res.json()) as
        | { status: "renewed" }
        | { status: "reauth_required"; authorizationUrl: string };
      if (out.status === "reauth_required" && typeof window !== "undefined") {
        window.location.assign(out.authorizationUrl);
        return;
      }
      await refresh();
    },
    [refresh],
  );

  const revoke = useCallback(
    async (toolId: string) => {
      const res = await fetch(`/api/connections/${toolId}/revoke`, { method: "POST" });
      if (res.ok) await refresh();
    },
    [refresh],
  );

  return { ...state, connect, renew, revoke, refresh };
}
