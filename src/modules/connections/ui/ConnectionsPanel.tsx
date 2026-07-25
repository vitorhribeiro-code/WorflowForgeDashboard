"use client";

/**
 * "As minhas conexões" (Painel do Trabalhador, secção 3 da spec).
 * Cobre os estados de UI transversais (secção 4): loading, vazio, erro, sucesso.
 *
 * Self-contained: o hook (endpoints) e os subcomponentes presentacionais
 * (ConnectionCard, StatusPill) vivem aqui ou no `use-connections` irmão.
 */

import type { ConnectionStatus, ConnectionView } from "../domain/connection.types";
import { useConnections } from "./use-connections";

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  pending: "Por ligar",
  connected: "Ligada",
  expired: "Expirada",
  revoked: "Revogada",
};

const STATUS_TONE: Record<ConnectionStatus, string> = {
  pending: "bg-neutral-100 text-neutral-600",
  connected: "bg-emerald-100 text-emerald-700",
  expired: "bg-amber-100 text-amber-700",
  revoked: "bg-rose-100 text-rose-700",
};

function StatusPill({ status }: { status: ConnectionStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

interface CardProps {
  conn: ConnectionView;
  onConnect: (toolId: string) => void;
  onRenew: (toolId: string) => void;
  onRevoke: (toolId: string) => void;
}

function ConnectionCard({ conn, onConnect, onRenew, onRevoke }: CardProps) {
  return (
    <div className="rounded-xl border border-neutral-200 p-4">
      <div className="flex items-center justify-between">
        <p className="font-medium">{conn.toolName}</p>
        <StatusPill status={conn.status} />
      </div>

      {conn.missingScopes.length > 0 && (
        <p className="mt-2 text-xs text-amber-700">
          Faltam permissões: {conn.missingScopes.join(", ")}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        {conn.status === "connected" && conn.ready ? (
          <button
            onClick={() => onRevoke(conn.toolId)}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700"
          >
            Revogar
          </button>
        ) : conn.status === "expired" ? (
          <button
            onClick={() => onRenew(conn.toolId)}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm text-white"
          >
            Renovar
          </button>
        ) : (
          <button
            onClick={() => onConnect(conn.toolId)}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm text-white"
          >
            Ligar
          </button>
        )}
      </div>
    </div>
  );
}

export function ConnectionsPanel() {
  const { status, connections, error, connect, renew, revoke, refresh } = useConnections();

  if (status === "loading" || status === "idle") {
    return <SkeletonList />;
  }

  if (status === "error") {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm">
        <p className="text-rose-800">Não foi possível carregar as conexões.</p>
        <p className="mt-1 text-rose-600">{error}</p>
        <button
          onClick={() => void refresh()}
          className="mt-3 rounded-lg border border-rose-300 px-3 py-1.5 text-rose-700"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  if (connections.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center">
        <p className="font-medium">Sem ferramentas por ligar</p>
        <p className="mt-1 text-sm text-neutral-500">
          Quando te forem atribuídas tarefas, as ferramentas que precisas de autorizar aparecem
          aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {connections.map((conn) => (
        <ConnectionCard
          key={conn.toolId}
          conn={conn}
          onConnect={connect}
          onRenew={renew}
          onRevoke={revoke}
        />
      ))}
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-busy>
      {[0, 1].map((i) => (
        <div
          key={i}
          className="h-40 animate-pulse rounded-xl border border-neutral-200 bg-neutral-50"
        />
      ))}
    </div>
  );
}
