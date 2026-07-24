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

export interface ArtifactContainerDeps {
  db: PgDatabase<any, any, any>;
  audit: AuditPort;
  /** Vem do M6: resolve a conexão de storage do worker. */
  storageConnections: StorageConnectionPort;
  /** Registo de SDKs de cloud por Tool.key (partilha o registo do M6). */
  sdkByToolKey: (toolKey: string) => CloudSdk | undefined;
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
  const ephemeral = createMemoryEphemeralStore(); // trocar por S3/Redis em produção
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

/** Acesso preguiçoso a partir das rotas. Inicializar com initArtifactContainer no bootstrap. */
export function initArtifactContainer(deps: ArtifactContainerDeps): void {
  cached = buildArtifactContainer(deps);
}

export function getArtifactContainer(): ArtifactContainer {
  if (!cached) throw new Error("ArtifactContainer não inicializado — chamar initArtifactContainer");
  return cached;
}
