import { describe, it, expect } from "vitest";
import {
  createGenericOAuthProvider,
  createProviderRegistry,
  type OAuthProviderConfig,
} from "@/modules/connections/service/oauth.provider";
import { buildProviderConfigs } from "@/modules/connections/container";
import type { AppEnv } from "@/platform/config/env";

// httpFetch fake: devolve uma Response com o JSON dado e um status configurável.
function fakeFetch(json: unknown, ok = true) {
  const calls: Array<{ url: string; body: string }> = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? "") });
    return {
      ok,
      status: ok ? 200 : 400,
      json: async () => json,
    } as Response;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

// Config Google idêntica à que o container monta (mantém o teste fiel a produção).
const googleCfg: OAuthProviderConfig = {
  authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  revokeUrl: "https://oauth2.googleapis.com/revoke",
  clientId: "cid-123",
  clientSecret: "secret-xyz",
  extraAuthParams: { access_type: "offline", prompt: "consent" },
};

describe("provider genérico — authorizationUrl (Google)", () => {
  it("inclui access_type=offline, prompt=consent, scopes, redirect e state", () => {
    const p = createGenericOAuthProvider(googleCfg);
    const url = new URL(
      p.authorizationUrl({
        state: "st-1",
        scopes: [
          "https://www.googleapis.com/auth/gmail.readonly",
          "https://www.googleapis.com/auth/gmail.compose",
        ],
        redirectUri: "https://app.example/api/connections/callback",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("cid-123");
    expect(url.searchParams.get("state")).toBe("st-1");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example/api/connections/callback",
    );
    // scopes separados por espaço
    expect(url.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose",
    );
  });
});

describe("provider genérico — exchangeCode", () => {
  it("faz POST ao token endpoint e parseia access/refresh/expiry/scope", async () => {
    const { fn, calls } = fakeFetch({
      access_token: "at-1",
      refresh_token: "rt-1",
      expires_in: 3600,
      scope:
        "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose",
    });
    const p = createGenericOAuthProvider(googleCfg, fn);
    const creds = await p.exchangeCode({
      code: "auth-code",
      redirectUri: "https://app.example/api/connections/callback",
    });

    expect(calls[0]!.url).toBe("https://oauth2.googleapis.com/token");
    expect(calls[0]!.body).toContain("grant_type=authorization_code");
    expect(calls[0]!.body).toContain("code=auth-code");
    expect(creds.accessToken).toBe("at-1");
    expect(creds.refreshToken).toBe("rt-1");
    expect(creds.expiresAt).toBeInstanceOf(Date);
    expect(creds.raw?.scope).toContain("gmail.compose");
  });

  it("lança oauthDenied quando o provider devolve access_denied", async () => {
    const { fn } = fakeFetch({ error: "access_denied" }, false);
    const p = createGenericOAuthProvider(googleCfg, fn);
    await expect(
      p.exchangeCode({ code: "x", redirectUri: "https://app.example/cb" }),
    ).rejects.toMatchObject({ code: "oauth_denied" });
  });
});

describe("provider genérico — refresh", () => {
  it("preserva o refresh token antigo quando o provider não o reenvia", async () => {
    // Google costuma NÃO reenviar refresh_token no refresh.
    const { fn } = fakeFetch({ access_token: "at-2", expires_in: 3600 });
    const p = createGenericOAuthProvider(googleCfg, fn);
    const creds = await p.refresh("rt-original");
    expect(creds.accessToken).toBe("at-2");
    expect(creds.refreshToken).toBe("rt-original");
  });
});

describe("registry por Tool.key", () => {
  it("resolve o provider registado e devolve undefined para chaves desconhecidas", () => {
    const reg = createProviderRegistry({ google: googleCfg });
    expect(reg.get("google")).toBeDefined();
    expect(reg.get("dropbox")).toBeUndefined();
  });
});

describe("wiring de produção — buildProviderConfigs", () => {
  function envWith(overrides: Partial<AppEnv>): AppEnv {
    return { APP_BASE_URL: "https://app.example", AUTH_SECRET: "x".repeat(32), ...overrides } as AppEnv;
  }

  it("regista o Google com URLs corretos + access_type=offline quando há secrets", () => {
    const cfg = buildProviderConfigs(
      envWith({ GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "sec" }),
    );
    expect(cfg.google).toBeDefined();
    expect(cfg.google!.authUrl).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(cfg.google!.tokenUrl).toBe("https://oauth2.googleapis.com/token");
    expect(cfg.google!.extraAuthParams).toMatchObject({ access_type: "offline", prompt: "consent" });
  });

  it("NÃO regista o Google sem secrets (fica no no-op gracioso da fase a)", () => {
    const cfg = buildProviderConfigs(envWith({}));
    expect(cfg.google).toBeUndefined();
  });

  it("regista Microsoft e Dropbox de forma independente, cada um pelos seus secrets", () => {
    const cfg = buildProviderConfigs(
      envWith({ DROPBOX_CLIENT_ID: "d", DROPBOX_CLIENT_SECRET: "s" }),
    );
    expect(cfg.dropbox).toBeDefined();
    expect(cfg.microsoft).toBeUndefined();
    expect(cfg.google).toBeUndefined();
  });
});
