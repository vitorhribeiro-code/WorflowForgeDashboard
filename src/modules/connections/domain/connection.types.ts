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
  /** Contador de validade (rotação/expiração), ou null se não ligada. */
  validity: ValidityCountdown | null;
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

/* -------------------------------------------------------------------------- */
/*  Contador de validade da conexão (higiene: rotação/reautorização periódica) */
/* -------------------------------------------------------------------------- */

/**
 * Política de revisão: mesmo em conexões sem expiração técnica, pedimos
 * reautorização periódica por higiene. É o teto do contador.
 */
export const CONNECTION_REVIEW_DAYS = 90;

/**
 * Referência de comportamento de tokens por ferramenta (ver pesquisa de campo).
 * `absoluteExpiryDays` = expiração DURA e ABSOLUTA (o token morre nessa data,
 * use-se ou não). Só a listamos quando existe; janelas de INATIVIDADE deslizantes
 * (Microsoft 90d, Google em produção 6 meses) NÃO entram aqui, porque o uso
 * contínuo dos digests renova-as — mostrá-las como contador enganaria.
 *
 *  - google: 7 dias ENQUANTO a app OAuth estiver em "Testing". Ao publicar
 *    (sair de Testing), remover esta entrada — passa a só ter a política de 90.
 *  - microsoft / dropbox: sem expiração absoluta → só a política de revisão.
 */
export const TOKEN_VALIDITY: Record<string, { absoluteExpiryDays?: number }> = {
  google: { absoluteExpiryDays: 7 },
};

export type ValidityKind = "expira" | "rever";
export type ValiditySeverity = "neutral" | "warning" | "danger";

export interface ValidityCountdown {
  /** Data-limite (a menor entre política de 90 dias e expiração dura). */
  date: Date;
  /** Dias que faltam (arredondado para cima; 0 ou negativo = no limite/passou). */
  daysLeft: number;
  /** "expira" = expiração dura real (aviso); "rever" = política de higiene. */
  kind: ValidityKind;
  /** Tom do rótulo, já derivado dos limiares. */
  severity: ValiditySeverity;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Contador de validade de uma conexão ligada. Função pura:
 *   contador = min(connectedAt + 90 dias (política), connectedAt + expiração dura)
 * O rótulo/tom seguem quem ganha:
 *   - "expira" (dura): âmbar ≤7 dias, vermelho ≤2 dias, senão neutro.
 *   - "rever"  (política): âmbar ≤14 dias, senão neutro (higiene, sem alarme).
 * Devolve null se a conexão não tem `connectedAt` (não ligada).
 */
export function computeValidityCountdown(
  toolKey: string,
  connectedAt: Date | null,
  now: Date,
): ValidityCountdown | null {
  if (!connectedAt) return null;

  const base = connectedAt.getTime();
  const policyDate = new Date(base + CONNECTION_REVIEW_DAYS * DAY_MS);
  const hardDays = TOKEN_VALIDITY[toolKey]?.absoluteExpiryDays;

  let date: Date;
  let kind: ValidityKind;
  if (hardDays !== undefined) {
    const hardDate = new Date(base + hardDays * DAY_MS);
    // A expiração dura só "ganha" (e vira aviso) se for a mais próxima.
    if (hardDate.getTime() <= policyDate.getTime()) {
      date = hardDate;
      kind = "expira";
    } else {
      date = policyDate;
      kind = "rever";
    }
  } else {
    date = policyDate;
    kind = "rever";
  }

  const daysLeft = Math.ceil((date.getTime() - now.getTime()) / DAY_MS);
  const severity: ValiditySeverity =
    kind === "expira"
      ? daysLeft <= 2
        ? "danger"
        : daysLeft <= 7
          ? "warning"
          : "neutral"
      : daysLeft <= 14
        ? "warning"
        : "neutral";

  return { date, daysLeft, kind, severity };
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
