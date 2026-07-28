/**
 * Acesso a um access token OAuth válido de um trabalhador, em contexto de
 * SISTEMA (sem sessão) — para a aquisição de dados a montante dos handlers (M7).
 *
 * Ao contrário da ConnectionsService (que é worker-facing e nunca devolve
 * tokens ao exterior), este porto é interno: só o motor de execução o usa, no
 * processo worker, para chamar APIs externas (ex.: Gmail) em nome do worker.
 * As credenciais continuam a nunca sair para HTTP/UI — ficam neste processo.
 *
 * Faz refresh silencioso quando o access token está a expirar e persiste o
 * resultado (mesmo padrão do renewConnection do M6).
 */

import type { OAuthCredentials } from "../domain/connection.types";
import type { ConnectionsRepository } from "../data/connections.repository";
import type { Cipher } from "./crypto";
import { credsCodec } from "./crypto";
import type { ProviderRegistry } from "./oauth.provider";
import { normalizeScopes } from "../domain/scopes";

export interface WorkerTokenPort {
  /**
   * Access token válido do worker para a ferramenta (por Tool.key, ex.: "google"),
   * ou null se não houver conexão ligada. Faz refresh se necessário.
   * Lança se o refresh falhar (consentimento revogado → reautorizar).
   */
  getAccessToken(workerId: string, toolKey: string): Promise<string | null>;
}

export interface WorkerTokenDeps {
  repo: ConnectionsRepository;
  cipher: Cipher;
  providers: ProviderRegistry;
  resolveToolIdByKey(toolKey: string): Promise<string | null>;
  now?: () => Date;
  /** Margem antes da expiração para renovar preventivamente (default 60s). */
  skewMs?: number;
}

export function createWorkerTokenAdapter(deps: WorkerTokenDeps): WorkerTokenPort {
  const now = deps.now ?? (() => new Date());
  const skewMs = deps.skewMs ?? 60_000;

  function isExpiring(creds: OAuthCredentials): boolean {
    if (!creds.expiresAt) return false; // sem expiração conhecida → assume válido
    return new Date(creds.expiresAt).getTime() - now().getTime() <= skewMs;
  }

  return {
    async getAccessToken(workerId, toolKey) {
      const toolId = await deps.resolveToolIdByKey(toolKey);
      if (!toolId) return null;

      const conn = await deps.repo.getConnection(workerId, toolId);
      if (!conn || conn.status !== "connected" || !conn.credentialsEncrypted) {
        return null;
      }

      const creds = credsCodec.deserialize<OAuthCredentials>(
        deps.cipher.decrypt(conn.credentialsEncrypted),
      );

      if (!isExpiring(creds)) return creds.accessToken;

      // Token a expirar → refresh silencioso (se houver refresh token + provider).
      if (!creds.refreshToken) return creds.accessToken; // deixa o provider externo falhar 401
      const provider = deps.providers.get(toolKey);
      if (!provider) return creds.accessToken;

      const refreshed = await provider.refresh(creds.refreshToken);
      await deps.repo.upsertConnection({
        workerId,
        toolId,
        grantedScopes: normalizeScopes(conn.grantedScopes),
        credentialsEncrypted: deps.cipher.encrypt(credsCodec.serialize(refreshed)),
        status: "connected",
        connectedAt: now(),
      });
      return refreshed.accessToken;
    },
  };
}
