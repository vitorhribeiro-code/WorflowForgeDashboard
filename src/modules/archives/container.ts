// Composition root do M9. ÚNICO sítio que lê env e liga adaptadores reais.
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { AuditPort } from "../../lib/audit";
import { createArchiveRepository } from "./data/archive.repository";
import { createArchiveService, type ArchiveService } from "./service/archive.service";
import { createPeriodSourceAdapter } from "./infra/period-source.drizzle";
import { createWorkerDirectoryAdapter } from "./infra/worker-directory.drizzle";
import { createMemoryArchiveStore } from "./infra/archive-storage.memory";
import { createArtifactArchiveAdapter, type M8MarkArchived } from "./infra/artifact-archive.m8";

export interface ArchiveContainerDeps {
  db: PgDatabase<any, any, any>;
  audit: AuditPort;
  /** Service do M8 (só precisamos de markArchived). */
  artifacts: M8MarkArchived;
}

export interface ArchiveContainer {
  service: ArchiveService;
}

let cached: ArchiveContainer | null = null;

export function buildArchiveContainer(deps: ArchiveContainerDeps): ArchiveContainer {
  const service = createArchiveService({
    repo: createArchiveRepository(deps.db),
    source: createPeriodSourceAdapter(deps.db),
    storage: createMemoryArchiveStore(), // trocar por cloud/objeto em produção
    artifactArchive: createArtifactArchiveAdapter(deps.artifacts),
    workers: createWorkerDirectoryAdapter(deps.db),
    audit: deps.audit,
    now: () => new Date(),
  });
  return { service };
}

export function initArchiveContainer(deps: ArchiveContainerDeps): void {
  cached = buildArchiveContainer(deps);
}

export function getArchiveContainer(): ArchiveContainer {
  if (!cached) throw new Error("ArchiveContainer não inicializado — chamar initArchiveContainer");
  return cached;
}
