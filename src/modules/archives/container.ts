// Composition root do M9. ÚNICO sítio que lê env e liga adaptadores reais.
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { AuditPort } from "../../lib/audit";
import { createArchiveRepository } from "./data/archive.repository";
import { createArchiveService, type ArchiveService } from "./service/archive.service";
import { createPeriodSourceAdapter } from "./infra/period-source.drizzle";
import { createWorkerDirectoryAdapter } from "./infra/worker-directory.drizzle";
import { createMemoryArchiveStore } from "./infra/archive-storage.memory";
import { createArtifactArchiveAdapter, type M8MarkArchived } from "./infra/artifact-archive.m8";
import type { ArchiveStoragePort } from "./service/ports";
import { db as defaultDb } from "@/db/client";
import { createDrizzleAudit } from "@/lib/audit.drizzle";
import { getArtifactContainer } from "@/modules/artifacts/container";
import { createS3ArchiveStore } from "@/platform/storage/stores";
import { getS3Bucket, getS3Client } from "@/platform/storage/s3-client";

export interface ArchiveContainerDeps {
  db: PgDatabase<any, any, any>;
  audit: AuditPort;
  /** Service do M8 (só precisamos de markArchived). */
  artifacts: M8MarkArchived;
  /** Store do arquivo; se omitido, escolhe S3 (se configurado) ou memória. */
  storage?: ArchiveStoragePort;
}

export interface ArchiveContainer {
  service: ArchiveService;
}

let cached: ArchiveContainer | null = null;

export function buildArchiveContainer(deps: ArchiveContainerDeps): ArchiveContainer {
  const service = createArchiveService({
    repo: createArchiveRepository(deps.db),
    source: createPeriodSourceAdapter(deps.db),
    storage: deps.storage ?? buildArchiveStoreFromEnv(), // memory → S3/R2
    artifactArchive: createArtifactArchiveAdapter(deps.artifacts),
    workers: createWorkerDirectoryAdapter(deps.db),
    audit: deps.audit,
    now: () => new Date(),
  });
  return { service };
}

// memory → S3: usa o store de arquivo S3/R2 se o bucket estiver configurado.
function buildArchiveStoreFromEnv(): ArchiveStoragePort {
  return resolveArchiveStore(
    getS3Client(),
    getS3Bucket(),
    process.env.NODE_ENV === "production",
  );
}

/**
 * Escolhe o store do arquivo. Exportado para ser testável sem env real.
 *  - S3 configurado → store S3/R2.
 *  - Sem S3 em PRODUÇÃO → recusa (store que falha nas escritas/download): nunca
 *    gerar arquivos "success" sem objeto no R2 (era a origem do NoSuchKey no
 *    download). O build cai em `error`, visível e reprocessável.
 *  - Sem S3 fora de produção → memória (dev/testes).
 */
export function resolveArchiveStore(
  s3: ReturnType<typeof getS3Client>,
  bucket: ReturnType<typeof getS3Bucket>,
  isProduction: boolean,
): ArchiveStoragePort {
  if (!s3 || !bucket) {
    if (isProduction) return productionMisconfiguredStore();
    return createMemoryArchiveStore();
  }
  // O store S3 aceita um manifesto genérico (Record); o M9 usa ArchiveManifest
  // (objeto concreto). Adaptamos só esse parâmetro — o valor é o mesmo em runtime.
  const store = createS3ArchiveStore(s3, bucket);
  return {
    createFolder: (workerId, period) => store.createFolder(workerId, period),
    writeManifest: (folderRef, manifest) =>
      store.writeManifest(folderRef, manifest as unknown as Record<string, unknown>),
    getDownload: (folderRef) => store.getDownload(folderRef),
  };
}

// Store "não configurado em produção": leitura de lista/detalhe vem da BD (não
// usa store), por isso continua a funcionar; escrita e download falham alto.
function productionMisconfiguredStore(): ArchiveStoragePort {
  const fail = (): never => {
    throw new Error(
      "Arquivo M9: store S3/R2 não configurado em produção (S3_BUCKET/credenciais em falta); " +
        "recuso usar memória para não gerar arquivos sem objeto no R2.",
    );
  };
  return {
    createFolder: async () => fail(),
    writeManifest: async () => fail(),
    getDownload: async () => fail(),
  };
}

/** Deps reais por defeito: BD, auditoria e o markArchived do M8 (M9 ← M8). */
function defaultArchiveDeps(): ArchiveContainerDeps {
  return {
    db: defaultDb,
    audit: createDrizzleAudit(defaultDb),
    artifacts: getArtifactContainer().service,
  };
}

/** Override explícito do container (ex.: testes de integração). */
export function initArchiveContainer(deps: ArchiveContainerDeps): void {
  cached = buildArchiveContainer(deps);
}

/** Acesso preguiçoso a partir das rotas: auto-inicializa com as deps reais. */
export function getArchiveContainer(): ArchiveContainer {
  if (!cached) cached = buildArchiveContainer(defaultArchiveDeps());
  return cached;
}
