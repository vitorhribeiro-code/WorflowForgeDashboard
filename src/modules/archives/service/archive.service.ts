// Regras de negócio do M9. PURO: deps por injeção, testável sem DB nem rede.
import { DomainError } from "../../../lib/errors";
import type { AuditPort } from "../../../lib/audit";
import type { SessionContext } from "../../../lib/session";
import type { MonthlyArchive } from "../domain/archive";
import { canViewArchive, isAdmin } from "../domain/access";
import { buildManifest, intermediateArtifactIds } from "../domain/manifest";
import { assertPeriod, periodBounds } from "../domain/period";
import type { ArchiveListFilter, ArchiveRepository } from "../data/archive.repository";
import type {
  ArchiveStoragePort,
  ArtifactArchivePort,
  PeriodSourcePort,
  WorkerDirectoryPort,
} from "./ports";

export interface ArchiveServiceDeps {
  repo: ArchiveRepository;
  source: PeriodSourcePort;
  storage: ArchiveStoragePort;
  artifactArchive: ArtifactArchivePort; // M8
  workers: WorkerDirectoryPort; // M2
  audit: AuditPort;
  now: () => Date;
}

export interface BuildResult {
  workerId: string;
  ok: boolean;
  archive?: MonthlyArchive;
  error?: string;
}

export interface ArchiveService {
  /** Consolida (worker, period). Idempotente: success/running não reconsolida. */
  buildArchive(cmd: { workerId: string; period: string; actorId?: string | null }): Promise<MonthlyArchive>;
  /** Job de fecho de mês: consolida todos os workers (ou de uma org). */
  buildAllForPeriod(period: string, orgId?: string): Promise<BuildResult[]>;
  getArchiveById(session: SessionContext, id: string): Promise<MonthlyArchive>;
  listArchives(session: SessionContext, filter?: ArchiveListFilter): Promise<MonthlyArchive[]>;
  getDownload(session: SessionContext, id: string): Promise<{ url: string }>;
  /** Só admin; regenera arquivo em error/running preso. Com { force }, também
   *  reconstrói um já success (ex.: folderRef de memória sem objeto no R2). */
  reprocess(
    session: SessionContext,
    id: string,
    opts?: { force?: boolean },
  ): Promise<MonthlyArchive>;
  /** Manutenção (sem sessão): reconstrói os arquivos "success" cujo folderRef
   *  ficou em formato-memória (nunca escritos no R2). Idempotente. */
  rebuildBrokenArchives(): Promise<{ scanned: number; rebuilt: number; failed: number }>;
}

export function createArchiveService(deps: ArchiveServiceDeps): ArchiveService {
  const { repo, source, storage, artifactArchive, workers, audit, now } = deps;

  /** Núcleo da consolidação. Assume que `archive` já existe. Força (usado pelo reprocess). */
  async function runConsolidation(
    archive: MonthlyArchive,
    actorId: string | null,
  ): Promise<MonthlyArchive> {
    let current = await repo.updateStatus(archive.id, "running");
    await audit.record({
      actorId,
      action: "archive.build_started",
      entity: "monthly_archive",
      entityId: current.id,
      metadata: { workerId: current.workerId, period: current.period },
    });

    try {
      const { start, end } = periodBounds(current.period);
      const data = await source.collect(current.workerId, start, end);
      const { folderRef } = await storage.createFolder(current.workerId, current.period);
      const manifest = buildManifest({ period: current.period, generatedAt: now(), data });
      await storage.writeManifest(folderRef, manifest);

      // M8: marca os intermédios do período como arquivados (habilita o cleanup do M8).
      await artifactArchive.markArchived(intermediateArtifactIds(data));

      current = await repo.finish(current.id, {
        status: "success",
        archiveFolderRef: folderRef,
        manifest,
      });
      await audit.record({
        actorId,
        action: "archive.ready",
        entity: "monthly_archive",
        entityId: current.id,
        metadata: { workerId: current.workerId, period: current.period, ...counts(manifest) },
      });
      return current;
    } catch (err) {
      await repo.updateStatus(current.id, "error");
      await audit.record({
        actorId,
        action: "archive.error",
        entity: "monthly_archive",
        entityId: current.id,
        metadata: { workerId: current.workerId, period: current.period, error: String(err) },
      });
      throw err;
    }
  }

  return {
    async buildArchive(cmd) {
      assertPeriod(cmd.period);
      const existing = await repo.findByWorkerPeriod(cmd.workerId, cmd.period);
      // Idempotência: já consolidado ou a decorrer -> devolve sem reconsolidar.
      if (existing && (existing.status === "success" || existing.status === "running")) {
        return existing;
      }
      const archive = existing ?? (await repo.ensure(cmd.workerId, cmd.period));
      return runConsolidation(archive, cmd.actorId ?? null);
    },

    async buildAllForPeriod(period, orgId) {
      assertPeriod(period);
      const ids = await workers.listWorkerIds(orgId);
      const results: BuildResult[] = [];
      for (const workerId of ids) {
        try {
          const archive = await this.buildArchive({ workerId, period });
          results.push({ workerId, ok: true, archive });
        } catch (err) {
          // Um worker falhado não trava o job dos restantes.
          results.push({ workerId, ok: false, error: String(err) });
        }
      }
      return results;
    },

    async getArchiveById(session, id) {
      const archive = await repo.findById(id);
      if (!archive) throw new DomainError("ARCHIVE_NOT_FOUND", "Arquivo inexistente");
      const worker = await workers.getWorker(archive.workerId);
      if (!worker) throw new DomainError("WORKER_NOT_FOUND", "Trabalhador inexistente");
      if (!canViewArchive(session, worker.orgId, archive.workerId)) {
        throw new DomainError("FORBIDDEN", "Sem acesso a este arquivo");
      }
      return archive;
    },

    async listArchives(session, filter) {
      if (isAdmin(session)) {
        return repo.listByOrg(session.orgId, filter);
      }
      // worker: ignora workerId de filtro (só vê os seus).
      return repo.listByWorker(session.userId, filter?.period);
    },

    async getDownload(session, id) {
      const archive = await this.getArchiveById(session, id); // aplica acesso
      if (archive.status !== "success" || !archive.archiveFolderRef) {
        throw new DomainError("ARCHIVE_NOT_FOUND", "Arquivo ainda não está pronto", {
          status: archive.status,
        });
      }
      return storage.getDownload(archive.archiveFolderRef);
    },

    async reprocess(session, id, opts) {
      if (!isAdmin(session)) throw new DomainError("FORBIDDEN", "Só admin reprocessa");
      const archive = await repo.findById(id);
      if (!archive) throw new DomainError("ARCHIVE_NOT_FOUND", "Arquivo inexistente");
      const worker = await workers.getWorker(archive.workerId);
      if (!worker || worker.orgId !== session.orgId) {
        throw new DomainError("FORBIDDEN", "Sem acesso a este arquivo");
      }
      if (archive.status === "success" && !opts?.force) {
        throw new DomainError("ARCHIVE_ALREADY_READY", "Arquivo já está pronto; nada a reprocessar");
      }
      return runConsolidation(archive, session.userId);
    },

    async rebuildBrokenArchives() {
      const broken = await repo.listMemoryFormatArchives();
      let rebuilt = 0;
      let failed = 0;
      for (const archive of broken) {
        try {
          // Força a reconsolidação: recomputa o manifesto e reescreve no store
          // atual (S3/R2), atualizando o folderRef para o formato correto.
          await runConsolidation(archive, null);
          rebuilt += 1;
        } catch {
          // Falha por-item não trava os restantes (fica error, reprocessável).
          failed += 1;
        }
      }
      return { scanned: broken.length, rebuilt, failed };
    },
  };
}

function counts(m: { runCount: number; artifactCount: number }) {
  return { runCount: m.runCount, artifactCount: m.artifactCount };
}
