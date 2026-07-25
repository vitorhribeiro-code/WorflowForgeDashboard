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
      return parseTokenResponse(res);
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
      const creds = await parseTokenResponse(res);
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

async function parseTokenResponse(res: Response): Promise<OAuthCredentials> {
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const code = String(json.error ?? "");
    if (code === "access_denied") throw oauthDenied("Consentimento negado.");
    throw providerError("Falha na troca de tokens.", { status: res.status, ...json });
  }
  const accessToken = json.access_token as string | undefined;
  if (!accessToken) throw providerError("Resposta sem access_token.");
  const expiresIn = Number(json.expires_in ?? 0);
  return {
    accessToken,
    refreshToken: (json.refresh_token as string | undefined) ?? undefined,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
    raw: json,
  };
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
