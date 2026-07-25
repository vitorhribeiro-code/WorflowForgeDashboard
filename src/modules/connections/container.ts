// Composition root do M6. Lê o env (via loadEnv), instancia os adaptadores
// reais (repo Drizzle, cifra, providers OAuth, state signer, auditoria) e
// injeta-os na service. Lazy singleton, como o container do M7.
import { db } from "@/db/client";
import { createDrizzleAudit } from "@/lib/audit.drizzle";
import { loadEnv } from "@/platform/config/env";
import { createDrizzleConnectionsRepository } from "./data/connections.repository";
import { createConnectionsService, type ConnectionsService } from "./service/connections.service";
import { createCipher } from "./service/crypto";
import {
  createProviderRegistry,
  createStateSigner,
  type OAuthProviderConfig,
} from "./service/oauth.provider";

/**
 * Configuração OAuth2 por Tool.key. Não é uma classe por ferramenta: o provider
 * genérico é movido a config. Só se registam as que têm client id + secret.
 */
function buildProviderConfigs(env: ReturnType<typeof loadEnv>): Record<string, OAuthProviderConfig> {
  const configs: Record<string, OAuthProviderConfig> = {};

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    configs.google = {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      revokeUrl: "https://oauth2.googleapis.com/revoke",
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      // Necessário para receber refresh_token no Google.
      extraAuthParams: { access_type: "offline", prompt: "consent" },
    };
  }

  if (env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) {
    configs.microsoft = {
      authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      clientId: env.MICROSOFT_CLIENT_ID,
      clientSecret: env.MICROSOFT_CLIENT_SECRET,
    };
  }

  if (env.DROPBOX_CLIENT_ID && env.DROPBOX_CLIENT_SECRET) {
    configs.dropbox = {
      authUrl: "https://www.dropbox.com/oauth2/authorize",
      tokenUrl: "https://api.dropboxapi.com/oauth2/token",
      revokeUrl: "https://api.dropboxapi.com/2/auth/token/revoke",
      clientId: env.DROPBOX_CLIENT_ID,
      clientSecret: env.DROPBOX_CLIENT_SECRET,
      extraAuthParams: { token_access_type: "offline" },
    };
  }

  return configs;
}

let cached: ConnectionsService | null = null;

export function getConnectionsService(): ConnectionsService {
  if (cached) return cached;
  const env = loadEnv();

  if (!env.ENCRYPTION_KEY) {
    throw new Error("ENCRYPTION_KEY em falta: necessária para cifrar credenciais OAuth (M6).");
  }
  // O env guarda a chave em hex (32 bytes = 64 chars); o Cipher espera base64.
  const keyBase64 = Buffer.from(env.ENCRYPTION_KEY, "hex").toString("base64");

  cached = createConnectionsService({
    repo: createDrizzleConnectionsRepository(db),
    providers: createProviderRegistry(buildProviderConfigs(env)),
    cipher: createCipher(keyBase64),
    state: createStateSigner(env.AUTH_SECRET),
    audit: createDrizzleAudit(db),
    redirectUri: `${env.APP_BASE_URL}/api/connections/callback`,
  });
  return cached;
}
