// Regras de negócio do M8. PURO: recebe todas as deps por injeção (repo, ports, audit, now).
// Testável sem DB nem rede.
import { DomainError } from "../../../lib/errors";
import { mapWithConcurrency } from "../../../lib/concurrency";
import type { AuditPort } from "../../../lib/audit";
import type { SessionContext } from "../../../lib/session";
import type { Artifact, ArtifactTier, ArtifactView } from "../domain/artifact";
import { canAccessRun } from "../domain/access";
import { isCleanable, isDownloadable, isExpired, planArtifact } from "../domain/tier-policy";
import type { ArtifactRepository } from "../data/artifact.repository";
import type {
  CloudStoragePort,
  DownloadTarget,
  EphemeralStoragePort,
  RunContextPort,
} from "./ports";

export interface ArtifactServiceDeps {
  repo: ArtifactRepository;
  cloud: CloudStoragePort;
  ephemeral: EphemeralStoragePort;
  runs: RunContextPort;
  audit: AuditPort;
  now: () => Date;
  /** TTL dos intermédios em ms. Injetado (config). */
  ttlMs: number;
}

export interface PersistInput {
  runId: string;
  filename: string;
  mimeType: string | null;
  tier: ArtifactTier;
  bytes: Uint8Array;
  /** Upsert do work_document na cloud (mesmo (tarefa, período) → mesmo ficheiro). */
  idempotencyKey?: string;
}

export interface ArtifactService {
  /** Chamado pelo motor (M7) via ArtifactSink. Contexto de sistema, sem sessão. */
  persist(input: PersistInput): Promise<Artifact>;
  /**
   * Acrescenta um bloco a um ficheiro vivo da cloud do trabalhador (ex.: os
   * resumos da semana), por workerId — fora do pipeline de run e sem criar
   * linha de artefacto. Idempotente por marker.
   */
  appendWorkerDocument(
    workerId: string,
    args: { filename: string; idempotencyKey: string; marker: string; header: string; block: string },
  ): Promise<{ storageRef: string; appended: boolean }>;
  /** Lista artefactos de um run (Detalhe de Run). Aplica controlo de acesso. */
  listByRun(session: SessionContext, runId: string): Promise<ArtifactView[]>;
  /** Resolve um link de download. Efémero expirado -> ARTIFACT_EXPIRED. */
  getDownload(session: SessionContext, artifactId: string): Promise<DownloadTarget>;
  /** Marca intermédios como arquivados (chamado pelo M9). */
  markArchived(ids: string[]): Promise<void>;
  /**
   * Job de limpeza: apaga intermédios expirados E arquivados (blob + linha).
   *  - deleted:   nº de artefactos efetivamente purgados nesta invocação
   *  - failed:    nº cujo blob não apagou (linha preservada — nunca orfana)
   *  - remaining: backlog que ficou por processar (drena na próxima execução)
   */
  cleanupExpiredIntermediates(): Promise<{
    deleted: number;
    failed: number;
    remaining: number;
  }>;
}

export function createArtifactService(deps: ArtifactServiceDeps): ArtifactService {
  const { repo, cloud, ephemeral, runs, audit, now, ttlMs } = deps;

  async function resolveRun(runId: string) {
    const ctx = await runs.getRunContext(runId);
    if (!ctx) throw new DomainError("RUN_NOT_FOUND", "Run inexistente", { runId });
    return ctx;
  }

  return {
    async persist(input) {
      const ctx = await resolveRun(input.runId);
      const plan = planArtifact(input.tier, now(), ttlMs);
      const content = {
        filename: input.filename,
        mimeType: input.mimeType,
        bytes: input.bytes,
        idempotencyKey: input.idempotencyKey,
      };

      // Escreve no store do tier. A app guarda a REFERÊNCIA, não o ficheiro.
      const { storageRef } =
        input.tier === "work_document"
          ? await cloud.write(ctx.workerId, content) // pode lançar CLOUD_*
          : await ephemeral.write(content);

      const artifact = await repo.insert({
        runId: input.runId,
        filename: input.filename,
        mimeType: input.mimeType,
        tier: input.tier,
        location: plan.location,
        storageRef,
        archived: false,
        expiresAt: plan.expiresAt,
      });

      await audit.record({
        actorId: null,
        action: "artifact.created",
        entity: "run_artifact",
        entityId: artifact.id,
        metadata: { runId: input.runId, tier: artifact.tier, location: artifact.location },
      });

      return artifact;
    },

    async appendWorkerDocument(workerId, args) {
      // Escrita direta na cloud do trabalhador (append a um ficheiro vivo). Não
      // cria linha de artefacto: o ficheiro semanal é um documento contínuo, não
      // um entregável por-run. Pode lançar CLOUD_* (sem cloud/scope/token).
      return cloud.appendDocument(workerId, args);
    },

    async listByRun(session, runId) {
      const ctx = await resolveRun(runId);
      if (!canAccessRun(session, ctx)) {
        throw new DomainError("FORBIDDEN", "Sem acesso a este run");
      }
      const t = now();
      const items = await repo.listByRun(runId);
      return items.map((a): ArtifactView => ({
        ...a,
        expired: isExpired(a, t),
        downloadable: isDownloadable(a, t),
      }));
    },

    async getDownload(session, artifactId) {
      const artifact = await repo.findById(artifactId);
      if (!artifact) throw new DomainError("ARTIFACT_NOT_FOUND", "Artefacto inexistente");

      const ctx = await resolveRun(artifact.runId);
      if (!canAccessRun(session, ctx)) {
        throw new DomainError("FORBIDDEN", "Sem acesso a este artefacto");
      }

      if (artifact.location === "ephemeral") {
        if (isExpired(artifact, now())) {
          throw new DomainError("ARTIFACT_EXPIRED", "Intermédio já expirou (TTL)");
        }
        return ephemeral.getDownload(artifact.storageRef);
      }
      return cloud.getDownload(ctx.workerId, artifact.storageRef);
    },

    async markArchived(ids) {
      await repo.markArchived(ids);
    },

    async cleanupExpiredIntermediates() {
      const t = now();
      const candidates = await repo.listCleanable(t);
      // Dupla-verificação pura (defesa contra query mal formada / clock skew).
      const cleanable = candidates.filter((a) => isCleanable(a, t));

      // Teto por invocação: o cron-job.org corta respostas > ~30 s. Processamos
      // até CLEANUP_MAX_PER_RUN por chamada e o resto drena nas execuções
      // seguintes — o job é idempotente (só apaga o que ainda é limpável).
      const batch = cleanable.slice(0, CLEANUP_MAX_PER_RUN);
      const remaining = cleanable.length - batch.length;

      // Apaga os blobs em paralelo (concorrência limitada). Uma falha por-item
      // NÃO é fatal: um objeto que não apague não deve estragar toda a limpeza
      // diária. A linha só é removida se o blob for libertado — nunca orfana.
      const outcomes = await mapWithConcurrency(
        batch,
        CLEANUP_CONCURRENCY,
        async (a) => {
          try {
            await ephemeral.delete(a.storageRef);
            return { artifact: a, ok: true as const };
          } catch {
            return { artifact: a, ok: false as const };
          }
        },
      );

      const purged = outcomes.filter((o) => o.ok).map((o) => o.artifact);
      await repo.deleteByIds(purged.map((a) => a.id));

      // Auditoria também em paralelo (um insert por artefacto purgado).
      await mapWithConcurrency(purged, CLEANUP_CONCURRENCY, (a) =>
        audit.record({
          actorId: null,
          action: "artifact.expired",
          entity: "run_artifact",
          entityId: a.id,
          metadata: { tier: a.tier },
        }),
      );

      return {
        deleted: purged.length,
        failed: batch.length - purged.length,
        remaining,
      };
    },
  };
}

// Teto de artefactos processados por invocação do cleanup. Mantém o pior caso
// bem abaixo do corte de ~30 s do cron-job.org; o backlog drena idempotente nas
// execuções seguintes. Concorrência = tarefas de I/O (R2 / BD) em paralelo.
const CLEANUP_MAX_PER_RUN = 1000;
const CLEANUP_CONCURRENCY = 20;
