/**
 * Camada de serviço do M6 — Conexões do Trabalhador.
 *
 * Regras (spec M6 + Regras de negócio-chave):
 *  - Só o próprio trabalhador liga/renova/revoga; o admin nunca vê tokens.
 *  - Uma conexão por (worker, tool); granted_scopes ⊆ scopes da Tool.
 *  - "Uma conexão = união dos scopes de todas as tarefas do worker" para a tool.
 *  - Credenciais SEMPRE cifradas; nunca saem da service em claro.
 *  - Revogar/expirar suspende atribuições dependentes (sem apagar histórico).
 *  - Ações sensíveis geram Audit_Log (append-only).
 *
 * A service é agnóstica de HTTP e de framework. Recebe todas as dependências
 * por injeção (createConnectionsService) — testável sem DB nem rede.
 */

import {
  computeReady,
  computeValidityCountdown,
  type ConnectionView,
  type OAuthCredentials,
} from "../domain/connection.types";
import { isSubset, missingScopes, normalizeScopes } from "../domain/scopes";
import type { ConnectionsRepository } from "../data/connections.repository";
import type { Cipher } from "./crypto";
import { credsCodec } from "./crypto";
import type { ProviderRegistry, StateSigner } from "./oauth.provider";
import type { AuditPort } from "@/lib/audit";
import type { SessionContext } from "@/lib/session";
import {
  conflict,
  forbidden,
  invalidScopes,
  notFound,
  oauthDenied,
  toolNotOAuth,
} from "@/lib/errors";

export interface ConnectionsServiceDeps {
  repo: ConnectionsRepository;
  providers: ProviderRegistry;
  cipher: Cipher;
  state: StateSigner;
  audit: AuditPort;
  redirectUri: string; // callback OAuth (ex.: https://app/api/connections/callback)
  now?: () => Date; // injetável para testes
}

export interface ConnectionsService {
  /** Painel "As minhas conexões": estado por ferramenta exigida. */
  listMyConnections(session: SessionContext): Promise<ConnectionView[]>;
  /**
   * Leitura admin (consola «Trabalhadores»): estado das conexões de um
   * trabalhador da org. Só super_admin; valida tenant. Reutiliza a mesma
   * projeção `ConnectionView` — que NUNCA inclui tokens (só status/scopes).
   */
  listWorkerConnections(
    session: SessionContext,
    workerId: string,
  ): Promise<ConnectionView[]>;
  /** Inicia OAuth: devolve o URL de consentimento. */
  startConnection(
    session: SessionContext,
    toolId: string,
  ): Promise<{ authorizationUrl: string }>;
  /** Conclui OAuth a partir do callback (state + code). */
  completeConnection(input: { state: string; code: string }): Promise<ConnectionView>;
  /** Renova: refresh silencioso, ou pede reautorização (devolve URL). */
  renewConnection(
    session: SessionContext,
    toolId: string,
  ): Promise<{ status: "renewed" } | { status: "reauth_required"; authorizationUrl: string }>;
  /** Revoga e suspende atribuições dependentes. */
  revokeConnection(
    session: SessionContext,
    toolId: string,
  ): Promise<{ suspendedAssignments: number }>;
}

export function createConnectionsService(
  deps: ConnectionsServiceDeps,
): ConnectionsService {
  const { repo, providers, cipher, state, audit, redirectUri } = deps;
  const now = deps.now ?? (() => new Date());

  /* --------------------------- helpers privados --------------------------- */

  function assertWorker(session: SessionContext) {
    // Só o próprio trabalhador gere as suas conexões (matriz de permissões).
    if (session.role !== "worker") {
      throw forbidden("Só o trabalhador gere as próprias conexões.");
    }
  }

  function assertAdmin(session: SessionContext) {
    // Leitura admin (só ver estado, nunca tokens): exclusiva do super_admin.
    if (session.role !== "super_admin") {
      throw forbidden("Só o super-utilizador consulta as conexões de um trabalhador.");
    }
  }

  async function loadOAuthTool(toolId: string) {
    const tool = await repo.getToolById(toolId);
    if (!tool) throw notFound("Ferramenta inexistente.", { toolId });
    if (tool.authType !== "oauth") {
      throw toolNotOAuth("Esta ferramenta não usa OAuth.", {
        toolId,
        authType: tool.authType,
      });
    }
    const provider = providers.get(tool.key);
    if (!provider) {
      throw notFound("Sem provider OAuth configurado para a ferramenta.", {
        toolKey: tool.key,
      });
    }
    return { tool, provider };
  }

  function toView(
    tool: { id: string; key: string; name: string; authType: any },
    conn: { status: any; grantedScopes: string[]; connectedAt: Date | null; id: string } | null,
    requiredScopes: string[],
  ): ConnectionView {
    const granted = conn?.grantedScopes ?? [];
    const status = conn?.status ?? "pending";
    const missing = missingScopes(requiredScopes, granted);
    const connectedAt = conn?.connectedAt ?? null;
    return {
      id: conn?.id ?? "",
      toolId: tool.id,
      toolKey: tool.key,
      toolName: tool.name,
      authType: tool.authType,
      status,
      grantedScopes: normalizeScopes(granted),
      requiredScopes: normalizeScopes(requiredScopes),
      missingScopes: missing,
      ready: computeReady(status, missing),
      connectedAt,
      // Contador só faz sentido para uma conexão ativa.
      validity:
        status === "connected"
          ? computeValidityCountdown(tool.key, connectedAt, now())
          : null,
    };
  }

  async function persistCredentials(
    session: SessionContext,
    toolId: string,
    creds: OAuthCredentials,
    grantedScopes: string[],
  ) {
    const encrypted = cipher.encrypt(credsCodec.serialize(creds));
    return repo.upsertConnection({
      workerId: session.userId,
      toolId,
      grantedScopes: normalizeScopes(grantedScopes),
      credentialsEncrypted: encrypted,
      status: "connected",
      connectedAt: now(),
    });
  }

  /* ------------------------------- API pública ---------------------------- */

  return {
    async listMyConnections(session) {
      assertWorker(session);
      const required = await repo.listRequiredTools(session.userId);
      const views: ConnectionView[] = [];
      for (const { tool, requiredScopes } of required) {
        const conn = await repo.getConnection(session.userId, tool.id);
        views.push(toView(tool, conn, requiredScopes));
      }
      return views;
    },

    async listWorkerConnections(session, workerId) {
      assertAdmin(session);
      // Isolamento tenant: o admin só vê trabalhadores da sua própria org.
      // notFound (não forbidden) para não revelar a existência de ids de outras orgs.
      if (!(await repo.workerInOrg(session.orgId, workerId))) {
        throw notFound("Trabalhador inexistente.", { workerId });
      }
      const required = await repo.listRequiredTools(workerId);
      const views: ConnectionView[] = [];
      for (const { tool, requiredScopes } of required) {
        const conn = await repo.getConnection(workerId, tool.id);
        views.push(toView(tool, conn, requiredScopes));
      }
      return views;
    },

    async startConnection(session, toolId) {
      assertWorker(session);
      const { tool, provider } = await loadOAuthTool(toolId);

      // Scopes pedidos = união exigida pelas tarefas do worker para esta tool.
      const requiredScopes = await repo.requiredScopesFor(session.userId, toolId);
      if (requiredScopes.length === 0) {
        throw conflict("Nenhuma tarefa do trabalhador exige esta ferramenta.", {
          toolId,
        });
      }
      // Não podem exigir-se scopes fora dos declarados pela Tool.
      if (!isSubset(requiredScopes, tool.availableScopes)) {
        throw invalidScopes("Scopes exigidos fora dos declarados pela ferramenta.", {
          requiredScopes,
          availableScopes: tool.availableScopes,
        });
      }

      const stateToken = state.sign({ workerId: session.userId, toolId });
      const authorizationUrl = provider.authorizationUrl({
        state: stateToken,
        scopes: requiredScopes,
        redirectUri,
      });

      await audit.record({
        actorId: session.userId,
        action: "connection.oauth_started",
        entity: "worker_connection",
        metadata: { toolId, scopes: requiredScopes },
      });
      return { authorizationUrl };
    },

    async completeConnection({ state: stateToken, code }) {
      // O state assinado transporta a identidade — não confiamos no cliente.
      const { workerId, toolId } = state.verify(stateToken);

      const tool = await repo.getToolById(toolId);
      if (!tool) throw notFound("Ferramenta inexistente.", { toolId });
      const provider = providers.get(tool.key);
      if (!provider) throw notFound("Sem provider OAuth.", { toolKey: tool.key });

      const creds = await provider.exchangeCode({ code, redirectUri });

      // granted_scopes ⊆ scopes da Tool (defesa; o provider pode devolver menos).
      const requiredScopes = await repo.requiredScopesFor(workerId, toolId);
      const grantedScopes = normalizeScopes(
        // Se o provider não devolver scopes explícitos, assumimos os pedidos.
        (creds.raw?.scope as string | undefined)?.split(/[\s,]+/).filter(Boolean) ??
          requiredScopes,
      );
      if (!isSubset(grantedScopes, tool.availableScopes)) {
        throw invalidScopes("Provider devolveu scopes fora do declarado.", {
          grantedScopes,
        });
      }

      const fakeSession: SessionContext = {
        userId: workerId,
        orgId: "", // não usado aqui: workerId vem do state assinado
        role: "worker",
      };
      const row = await persistCredentials(fakeSession, toolId, creds, grantedScopes);

      await audit.record({
        actorId: workerId,
        action: "connection.linked",
        entity: "worker_connection",
        entityId: row.id,
        metadata: { toolId, grantedScopes },
      });

      return toView(tool, row, requiredScopes);
    },

    async renewConnection(session, toolId) {
      assertWorker(session);
      const { tool, provider } = await loadOAuthTool(toolId);
      const conn = await repo.getConnection(session.userId, toolId);
      if (!conn || !conn.credentialsEncrypted) {
        throw notFound("Conexão inexistente para renovar.", { toolId });
      }

      const creds = credsCodec.deserialize<OAuthCredentials>(
        cipher.decrypt(conn.credentialsEncrypted),
      );

      // Sem refresh token → não dá refresh silencioso: pedir reautorização.
      if (!creds.refreshToken) {
        const stateToken = state.sign({ workerId: session.userId, toolId });
        return {
          status: "reauth_required",
          authorizationUrl: provider.authorizationUrl({
            state: stateToken,
            scopes: conn.grantedScopes,
            redirectUri,
          }),
        };
      }

      try {
        const refreshed = await provider.refresh(creds.refreshToken);
        await persistCredentials(session, toolId, refreshed, conn.grantedScopes);
        await audit.record({
          actorId: session.userId,
          action: "connection.renewed",
          entity: "worker_connection",
          entityId: conn.id,
          metadata: { toolId },
        });
        return { status: "renewed" };
      } catch {
        // Refresh falhou (consentimento revogado do lado do provider, etc.).
        await repo.updateStatus(conn.id, "expired");
        const stateToken = state.sign({ workerId: session.userId, toolId });
        return {
          status: "reauth_required",
          authorizationUrl: provider.authorizationUrl({
            state: stateToken,
            scopes: conn.grantedScopes,
            redirectUri,
          }),
        };
      }
    },

    async revokeConnection(session, toolId) {
      assertWorker(session);
      const tool = await repo.getToolById(toolId);
      if (!tool) throw notFound("Ferramenta inexistente.", { toolId });
      const conn = await repo.getConnection(session.userId, toolId);
      if (!conn) throw notFound("Conexão inexistente.", { toolId });

      // Best-effort no provider; a revogação local prossegue de qualquer forma.
      const provider = providers.get(tool.key);
      if (provider && conn.credentialsEncrypted) {
        try {
          const creds = credsCodec.deserialize<OAuthCredentials>(
            cipher.decrypt(conn.credentialsEncrypted),
          );
          await provider.revoke(creds.refreshToken ?? creds.accessToken);
        } catch {
          /* ignora falha remota */
        }
      }

      await repo.updateStatus(conn.id, "revoked");
      const suspended = await repo.suspendAssignmentsDependingOn(
        session.userId,
        toolId,
      );

      await audit.record({
        actorId: session.userId,
        action: "connection.revoked",
        entity: "worker_connection",
        entityId: conn.id,
        metadata: { toolId, suspendedAssignments: suspended },
      });
      return { suspendedAssignments: suspended };
    },
  };
}

// Reexport para conveniência da rota que trata `access_denied` no callback.
export { oauthDenied };
