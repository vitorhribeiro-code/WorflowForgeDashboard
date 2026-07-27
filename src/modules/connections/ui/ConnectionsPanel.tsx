"use client";

/**
 * "As minhas conexões" (Painel do Trabalhador, secção 3 da spec).
 * Cobre os estados de UI transversais (secção 4): loading, vazio, erro, sucesso.
 *
 * Usa o design system do projeto (globals.css, tokens em CSS-vars) — NÃO Tailwind.
 * As cores do estado reaproveitam o semáforo da matriz do M5 (verde/âmbar/vermelho).
 * A decisão de tom/ação vive no domínio (connectionTone/connectionAction); esta
 * camada é só apresentação.
 */

import {
  connectionAction,
  connectionTone,
  type ConnectionStatus,
  type ConnectionView,
} from "../domain/connection.types";
import { useConnections } from "./use-connections";

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  pending: "Por ligar",
  connected: "Ligada",
  expired: "Expirada",
  revoked: "Revogada",
};

function StatusPill({ conn }: { conn: ConnectionView }) {
  const tone = connectionTone(conn.status, conn.missingScopes);
  return (
    <span className={`status-pill status-${tone}`}>
      <span className="readiness-dot" aria-hidden />
      {STATUS_LABEL[conn.status]}
    </span>
  );
}

interface CardProps {
  conn: ConnectionView;
  busy: boolean;
  onConnect: (toolId: string) => void;
  onRenew: (toolId: string) => void;
  onRevoke: (toolId: string) => void;
}

function ConnectionCard({ conn, busy, onConnect, onRenew, onRevoke }: CardProps) {
  const action = connectionAction(conn.status, conn.ready);

  return (
    <div className="conn-card">
      <div className="conn-card-head">
        <p className="conn-card-name">{conn.toolName}</p>
        <StatusPill conn={conn} />
      </div>

      <p className="conn-scopes">
        {conn.grantedScopes.length}/{conn.requiredScopes.length} permissões concedidas
      </p>

      {conn.missingScopes.length > 0 && (
        <p className="conn-missing">Faltam: {conn.missingScopes.join(", ")}</p>
      )}

      <div className="conn-actions">
        {action === "revoke" ? (
          <button
            type="button"
            className="btn-danger"
            disabled={busy}
            onClick={() => onRevoke(conn.toolId)}
          >
            Revogar
          </button>
        ) : action === "renew" ? (
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() => onRenew(conn.toolId)}
          >
            Renovar
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() => onConnect(conn.toolId)}
          >
            {action === "reconnect" ? "Religar" : "Ligar"}
          </button>
        )}
      </div>
    </div>
  );
}

export function ConnectionsPanel() {
  const { status, connections, error, busyToolId, connect, renew, revoke, refresh } =
    useConnections();

  if (status === "loading" || status === "idle") {
    return <SkeletonList />;
  }

  if (status === "error") {
    return (
      <div className="conn-error">
        <p className="conn-error-title">Não foi possível carregar as conexões.</p>
        <p className="conn-error-detail">{error}</p>
        <button type="button" className="btn-secondary" onClick={() => void refresh()}>
          Tentar de novo
        </button>
      </div>
    );
  }

  if (connections.length === 0) {
    return (
      <div className="conn-empty">
        <p className="conn-empty-title">Sem ferramentas por ligar</p>
        <p className="conn-empty-sub">
          Quando te forem atribuídas tarefas, as ferramentas que precisas de autorizar
          aparecem aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="conn-grid">
      {connections.map((conn) => (
        <ConnectionCard
          key={conn.toolId}
          conn={conn}
          busy={busyToolId === conn.toolId}
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
    <div className="conn-grid" aria-busy>
      {[0, 1].map((i) => (
        <div key={i} className="conn-skeleton" />
      ))}
    </div>
  );
}
