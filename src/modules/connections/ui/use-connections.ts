// Único ponto da UI que conhece endpoints. Os componentes não sabem de URLs.
"use client";
import { useCallback, useEffect, useState } from "react";
import type { ConnectionView, ValidityCountdown } from "../domain/connection.types";

type Status = "idle" | "loading" | "ready" | "error";

interface State {
  status: Status;
  connections: ConnectionView[];
  error: string | null;
  busyToolId: string | null; // ferramenta com ação em curso (desativa os seus botões)
}

// A vista chega via JSON — datas vêm como string. Reidratamos connectedAt e a
// data do contador de validade para Date.
type RawConnection = Omit<ConnectionView, "connectedAt" | "validity"> & {
  connectedAt: string | null;
  validity: (Omit<ValidityCountdown, "date"> & { date: string }) | null;
};

function rehydrate(c: RawConnection): ConnectionView {
  return {
    ...c,
    connectedAt: c.connectedAt ? new Date(c.connectedAt) : null,
    validity: c.validity ? { ...c.validity, date: new Date(c.validity.date) } : null,
  };
}

export function useConnections() {
  const [state, setState] = useState<State>({
    status: "idle",
    connections: [],
    error: null,
    busyToolId: null,
  });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, status: "loading", error: null }));
    try {
      const res = await fetch("/api/connections");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as RawConnection[];
      setState({ status: "ready", connections: data.map(rehydrate), error: null, busyToolId: null });
    } catch (e) {
      setState({ status: "error", connections: [], error: (e as Error).message, busyToolId: null });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Inicia o OAuth: pede o URL de consentimento e navega para lá.
  const connect = useCallback(async (toolId: string) => {
    setState((s) => ({ ...s, busyToolId: toolId }));
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toolId }),
      });
      if (!res.ok) {
        setState((s) => ({ ...s, busyToolId: null }));
        return;
      }
      const { authorizationUrl } = (await res.json()) as { authorizationUrl: string };
      if (typeof window !== "undefined") window.location.assign(authorizationUrl);
    } catch {
      setState((s) => ({ ...s, busyToolId: null }));
    }
  }, []);

  // Renova: se o refresh silencioso não chegar, o servidor devolve reauth.
  const renew = useCallback(
    async (toolId: string) => {
      setState((s) => ({ ...s, busyToolId: toolId }));
      try {
        const res = await fetch(`/api/connections/${toolId}/renew`, { method: "POST" });
        if (!res.ok) {
          setState((s) => ({ ...s, busyToolId: null }));
          return;
        }
        const out = (await res.json()) as
          | { status: "renewed" }
          | { status: "reauth_required"; authorizationUrl: string };
        if (out.status === "reauth_required" && typeof window !== "undefined") {
          window.location.assign(out.authorizationUrl);
          return;
        }
        await refresh();
      } catch {
        setState((s) => ({ ...s, busyToolId: null }));
      }
    },
    [refresh],
  );

  const revoke = useCallback(
    async (toolId: string) => {
      setState((s) => ({ ...s, busyToolId: toolId }));
      try {
        const res = await fetch(`/api/connections/${toolId}/revoke`, { method: "POST" });
        if (res.ok) await refresh();
        else setState((s) => ({ ...s, busyToolId: null }));
      } catch {
        setState((s) => ({ ...s, busyToolId: null }));
      }
    },
    [refresh],
  );

  return { ...state, connect, renew, revoke, refresh };
}
