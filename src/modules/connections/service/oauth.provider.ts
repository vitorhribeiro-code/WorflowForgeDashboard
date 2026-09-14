/**
 * Abstração de provider OAuth2.
 *
 * Evita abstração prematura: NÃO há uma classe por ferramenta. Há um provider
 * genérico movido a config (authUrl/tokenUrl/revokeUrl/clientId/secret) e um
 * registo keyed por Tool.key. Serve Google, Dropbox, Microsoft 365, etc.,
 * que são OAuth2 padrão. Casos especiais podem registar um provider próprio.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { OAuthCredentials } from "../domain/connection.types";
import { oauthDenied, providerError, stateInvalid } from "@/lib/errors";

export interface OAuthProvider {
  /** URL para onde redirecionar o trabalhador (consentimento). */
  authorizationUrl(params: { state: string; scopes: string[]; redirectUri: string }): string;
  /** Troca o `code` por tokens. */
  exchangeCode(params: { code: string; redirectUri: string }): Promise<OAuthCredentials>;
  /** Refresh silencioso; lança se não for possível (obriga a reautorizar). */
  refresh(refreshToken: string): Promise<OAuthCredentials>;
  /** Revoga do lado do provider (best-effort). */
  revoke(token: string): Promise<void>;
}

export interface OAuthProviderConfig {
  authUrl: string;
  tokenUrl: string;
  revokeUrl?: string;
  clientId: string;
  clientSecret: string;
  /** Alguns providers precisam de params extra (ex.: access_type=offline). */
  extraAuthParams?: Record<string, string>;
  /**
   * Normaliza cada scope devolvido pelo provider na resposta de token. Alguns
   * (Microsoft) devolvem o scope com o prefixo do recurso
   * (`https://graph.microsoft.com/Files.ReadWrite`); isto reduz à forma curta
   * que a Tool declara, para que a validação (granted ⊆ available) E o gate de
   * prontidão (required ⊆ granted) usem a MESMA forma canónica. Sem isto, o
   * mesmo tipo de desalinhamento que rebentou no Dropbox como `invalid_scopes`.
   */
  mapScope?: (scope: string) => string;
  /**
   * Scopes que o provider concede mas NÃO ecoa no `scope` da resposta de token.
   * A Microsoft faz isto com o `offline_access`: consome-o para emitir o refresh
   * token mas não o devolve na lista de scopes — pelo que o gate de prontidão o
   * marcaria como em falta apesar de a ligação estar completa. Aqui, quando vem
   * refresh_token (a prova de que foi concedido), estes scopes são acrescentados
   * aos concedidos. Só se aplica se o provider os declarar (Google/Dropbox não).
   */
  impliedScopes?: string[];
}

type FetchLike = typeof fetch;

/** Provider OAuth2 genérico. `httpFetch` é injetável para testes. */
export function createGenericOAuthProvider(
  cfg: OAuthProviderConfig,
  httpFetch: FetchLike = fetch,
): OAuthProvider {
  return {
    authorizationUrl({ state, scopes, redirectUri }) {
      const u = new URL(cfg.authUrl);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("client_id", cfg.clientId);
      u.searchParams.set("redirect_uri", redirectUri);
      u.searchParams.set("scope", scopes.join(" "));
      u.searchParams.set("state", state);
      for (const [k, v] of Object.entries(cfg.extraAuthParams ?? {})) {
        u.searchParams.set(k, v);
      }
      return u.toString();
    },

    async exchangeCode({ code, redirectUri }) {
      const res = await httpFetch(cfg.tokenUrl, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
        }),
      });
      return parseTokenResponse(res, cfg.mapScope, cfg.impliedScopes);
    },

    async refresh(refreshToken) {
      const res = await httpFetch(cfg.tokenUrl, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
        }),
      });
      const creds = await parseTokenResponse(res, cfg.mapScope, cfg.impliedScopes);
      // Muitos providers não reenviam o refresh_token — preserva o antigo.
      if (!creds.refreshToken) creds.refreshToken = refreshToken;
      return creds;
    },

    async revoke(token) {
      if (!cfg.revokeUrl) return; // best-effort
      try {
        await httpFetch(cfg.revokeUrl, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token }),
        });
      } catch {
        /* revogação local prossegue mesmo que o provider falhe */
      }
    },
  };
}

async function parseTokenResponse(
  res: Response,
  mapScope?: (scope: string) => string,
  impliedScopes?: string[],
): Promise<OAuthCredentials> {
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const code = String(json.error ?? "");
    if (code === "access_denied") throw oauthDenied("Consentimento negado.");
    throw providerError("Falha na troca de tokens.", { status: res.status, ...json });
  }
  const accessToken = json.access_token as string | undefined;
  if (!accessToken) throw providerError("Resposta sem access_token.");
  // Normaliza o `scope` devolvido (ex.: prefixo do recurso Graph) ANTES de o
  // service o ler de `raw.scope` — mantém granted e required na mesma forma.
  if (mapScope && typeof json.scope === "string") {
    json.scope = json.scope
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(mapScope)
      .join(" ");
  }
  // Scopes concedidos mas não ecoados (Microsoft: offline_access). Só se vier
  // refresh_token — que é a prova de que o offline_access foi de facto concedido.
  if (impliedScopes?.length && typeof json.refresh_token === "string") {
    const current =
      typeof json.scope === "string" ? json.scope.split(/[\s,]+/).filter(Boolean) : [];
    json.scope = Array.from(new Set([...current, ...impliedScopes])).join(" ");
  }
  const expiresIn = Number(json.expires_in ?? 0);
  return {
    accessToken,
    refreshToken: (json.refresh_token as string | undefined) ?? undefined,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
    raw: json,
  };
}

/**
 * Reduz um scope da Microsoft à forma curta que a Tool declara. O Graph devolve
 * por vezes o scope com o prefixo do recurso
 * (`https://graph.microsoft.com/Files.ReadWrite`) ou de uma API custom
 * (`api://<id>/...`). Absorve ambos. Idempotente na forma curta (`Files.ReadWrite`
 * → `Files.ReadWrite`), por isso é seguro aplicá-lo sempre.
 */
export function normalizeMicrosoftScope(scope: string): string {
  return scope
    .trim()
    .replace(/^https?:\/\/graph\.microsoft\.com\//i, "")
    .replace(/^api:\/\/[^/]+\//i, "");
}

/* ------------------------------------------------------------------ */
/*  Registo de providers por Tool.key                                 */
/* ------------------------------------------------------------------ */

export interface ProviderRegistry {
  get(toolKey: string): OAuthProvider | undefined;
}

export function createProviderRegistry(
  configs: Record<string, OAuthProviderConfig>,
  httpFetch: FetchLike = fetch,
): ProviderRegistry {
  const cache = new Map<string, OAuthProvider>();
  return {
    get(toolKey) {
      if (cache.has(toolKey)) return cache.get(toolKey);
      const cfg = configs[toolKey];
      if (!cfg) return undefined;
      const p = createGenericOAuthProvider(cfg, httpFetch);
      cache.set(toolKey, p);
      return p;
    },
  };
}

/* ------------------------------------------------------------------ */
/*  State assinado (CSRF) — stateless, sem tabela extra                */
/* ------------------------------------------------------------------ */

export interface StateSigner {
  sign(payload: { workerId: string; toolId: string; ttlMs?: number }): string;
  verify(token: string): { workerId: string; toolId: string };
}

/** HMAC-SHA256 sobre `workerId.toolId.nonce.exp`. */
export function createStateSigner(secret: string): StateSigner {
  const b64u = (b: Buffer) =>
    b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  return {
    sign({ workerId, toolId, ttlMs = 10 * 60_000 }) {
      const nonce = randomBytes(8).toString("hex");
      const exp = Date.now() + ttlMs;
      const payload = `${workerId}.${toolId}.${nonce}.${exp}`;
      const sig = createHmac("sha256", secret).update(payload).digest();
      return `${b64u(Buffer.from(payload))}.${b64u(sig)}`;
    },

    verify(token) {
      const [payloadB64, sigB64] = token.split(".");
      if (!payloadB64 || !sigB64) throw stateInvalid("State malformado.");
      const payload = Buffer.from(
        payloadB64.replace(/-/g, "+").replace(/_/g, "/"),
        "base64",
      ).toString("utf8");
      const expected = createHmac("sha256", secret).update(payload).digest();
      const got = Buffer.from(sigB64.replace(/-/g, "+").replace(/_/g, "/"), "base64");
      if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
        throw stateInvalid("Assinatura de state inválida.");
      }
      const [workerId, toolId, , expStr] = payload.split(".");
      if (!workerId || !toolId || !expStr) throw stateInvalid("State malformado.");
      if (Number(expStr) < Date.now()) throw stateInvalid("State expirado.");
      return { workerId, toolId };
    },
  };
}
