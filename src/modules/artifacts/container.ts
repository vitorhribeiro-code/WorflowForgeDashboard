// Composition root do M8. ÚNICO sítio que lê env e liga adaptadores reais.
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { AuditPort } from "../../lib/audit";
import { createArtifactRepository } from "./data/artifact.repository";
import { createArtifactService, type ArtifactService, type PersistInput } from "./service/artifact.service";
import type { ArtifactTier } from "./domain/artifact";
import { createMemoryEphemeralStore } from "./infra/ephemeral-store.memory";
import { createRunContextAdapter } from "./infra/run-context.drizzle";
import {
  createCloudStorageAdapter,
  type CloudSdk,
  type StorageConnectionPort,
} from "./infra/cloud-storage.worker-connection";
import type { EphemeralStoragePort } from "./service/ports";
import { db as defaultDb } from "@/db/client";
import { createDrizzleAudit } from "@/lib/audit.drizzle";
import { createS3EphemeralStore } from "@/platform/storage/stores";
import { getS3Bucket, getS3Client } from "@/platform/storage/s3-client";
import {
  createM6StorageConnectionBridge,
  defaultCloudSdkRegistry,
} from "./infra/storage-connection.m6";

export interface ArtifactContainerDeps {
  db: PgDatabase<any, any, any>;
  audit: AuditPort;
  /** Vem do M6: resolve a conexão de storage do worker. */
  storageConnections: StorageConnectionPort;
  /** Registo de SDKs de cloud por Tool.key (partilha o registo do M6). */
  sdkByToolKey: (toolKey: string) => CloudSdk | undefined;
  /** Store efémero; se omitido, escolhe S3 (se configurado) ou memória. */
  ephemeral?: EphemeralStoragePort;
}

export interface ArtifactContainer {
  service: ArtifactService;
  /** Adaptador que o M7 espera como ArtifactSink (ver notas de integração). */
  artifactSink: ArtifactSink;
}

/** Contrato esperado pelo M7. Confirmar assinatura exata do port do M7 e alinhar. */
export interface ArtifactSink {
  write(input: {
    runId: string;
    filename: string;
    mimeType?: string | null;
    tier: ArtifactTier;
    bytes: Uint8Array;
  }): Promise<{ id: string; storageRef: string }>;
}

function makeSink(service: ArtifactService): ArtifactSink {
  return {
    async write(input) {
      const persistInput: PersistInput = {
        runId: input.runId,
        filename: input.filename,
        mimeType: input.mimeType ?? null,
        tier: input.tier,
        bytes: input.bytes,
      };
      const a = await service.persist(persistInput);
      return { id: a.id, storageRef: a.storageRef };
    },
  };
}

let cached: ArtifactContainer | null = null;

export function buildArtifactContainer(deps: ArtifactContainerDeps): ArtifactContainer {
  const repo = createArtifactRepository(deps.db);
  const cloud = createCloudStorageAdapter(deps.storageConnections, deps.sdkByToolKey);
  // memory → S3: store injetado, senão S3/R2 se configurado, senão memória.
  const ephemeral = deps.ephemeral ?? buildEphemeralFromEnv();
  const runs = createRunContextAdapter(deps.db);

  const service = createArtifactService({
    repo,
    cloud,
    ephemeral,
    runs,
    audit: deps.audit,
    now: () => new Date(),
    ttlMs: Number(process.env.ARTIFACT_EPHEMERAL_TTL_MS ?? 24 * 60 * 60 * 1000), // 24h
  });

  return { service, artifactSink: makeSink(service) };
}

// memory → S3: usa o store S3/R2 se o bucket estiver configurado, senão memória.
function buildEphemeralFromEnv(): EphemeralStoragePort {
  const s3 = getS3Client();
  const bucket = getS3Bucket();
  if (s3 && bucket) return createS3EphemeralStore(s3, bucket);
  return createMemoryEphemeralStore();
}

/** Deps reais por defeito: BD, auditoria, ponte de storage do M6, registo de SDKs. */
function defaultArtifactDeps(): ArtifactContainerDeps {
  return {
    db: defaultDb,
    audit: createDrizzleAudit(defaultDb),
    storageConnections: createM6StorageConnectionBridge(defaultDb),
    sdkByToolKey: defaultCloudSdkRegistry,
  };
}

/** Override explícito do container (ex.: testes de integração). */
export function initArtifactContainer(deps: ArtifactContainerDeps): void {
  cached = buildArtifactContainer(deps);
}

/** Acesso preguiçoso a partir das rotas: auto-inicializa com as deps reais. */
export function getArtifactContainer(): ArtifactContainer {
  if (!cached) cached = buildArtifactContainer(defaultArtifactDeps());
  return cached;
}
