/**
 * Tipos de domínio do M6 — Conexões do Trabalhador.
 *
 * (RECONSTRUÍDO a partir do uso em connections.service.ts, connections.repository.ts,
 *  oauth.provider.ts e do teste-padrão. Não estava no núcleo entregue.)
 *
 * Princípio: os tipos "de vista" (ConnectionView) NUNCA expõem credenciais.
 * O material sensível (OAuthCredentials) só circula dentro da service, cifrado
 * antes de tocar no repositório.
 */

/** Espelha o enum `tool_auth_type` do schema. */
export type ToolAuthType = "oauth" | "api_key" | "none";

/** Espelha o enum `connection_status` do schema. */
export type ConnectionStatus = "pending" | "connected" | "expired" | "revoked";

/**
 * Credenciais OAuth em claro. Só existem em memória, dentro da service, entre a
 * troca com o provider e a cifra. Nunca são serializadas para fora sem cifrar.
 */
export interface OAuthCredentials {
  accessToken: string;
  refreshToken?: string;
  /** Instante de expiração do access token, quando o provider o indica. */
  expiresAt?: Date;
  /** Resposta crua do token endpoint (ex.: para ler `scope` devolvido). */
  raw?: Record<string, unknown>;
}

/**
 * Projeção segura de uma conexão para o painel do trabalhador.
 * Deriva a prontidão (`ready`) e os `missingScopes` — sem nunca incluir tokens.
 */
export interface ConnectionView {
  /** Id da conexão, ou "" quando ainda não existe (só requisito). */
  id: string;
  toolId: string;
  toolKey: string;
  toolName: string;
  authType: ToolAuthType;
  status: ConnectionStatus;
  grantedScopes: string[];
  requiredScopes: string[];
  missingScopes: string[];
  ready: boolean;
  connectedAt: Date | null;
}

/**
 * Prontidão de uma conexão: só está pronta se estiver ligada e sem scopes em
 * falta. É esta regra que o toggle do M5 reutiliza para permitir `enabled=true`.
 */
export function computeReady(
  status: ConnectionStatus,
  missingScopes: string[],
): boolean {
  return status === "connected" && missingScopes.length === 0;
}

/**
 * Tom do semáforo de uma conexão (alinhado com a matriz do M5):
 *  - green  → ligada e sem scopes em falta (pronta)
 *  - amber  → ligada mas faltam scopes, ou expirada (recuperável)
 *  - red    → revogada (precisa de religar)
 *  - grey   → por ligar (pending)
 * Função pura: a UI só a consome, não decide cores.
 */
export type ConnectionTone = "green" | "amber" | "red" | "grey";

export function connectionTone(
  status: ConnectionStatus,
  missingScopes: string[],
): ConnectionTone {
  switch (status) {
    case "connected":
      return missingScopes.length === 0 ? "green" : "amber";
    case "expired":
      return "amber";
    case "revoked":
      return "red";
    case "pending":
    default:
      return "grey";
  }
}

/** Ação primária que o trabalhador pode tomar, dado o estado da conexão. */
export type ConnectionAction = "connect" | "renew" | "revoke" | "reconnect";

export function connectionAction(
  status: ConnectionStatus,
  ready: boolean,
): ConnectionAction {
  if (status === "connected") return ready ? "revoke" : "connect"; // ligada sem scopes → completar
  if (status === "expired") return "renew";
  if (status === "revoked") return "reconnect";
  return "connect";
}
