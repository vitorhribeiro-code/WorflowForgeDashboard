// Interfaces de saída do M8. O service depende SÓ destas (nunca de repos de outros módulos).
// Os adaptadores reais vivem em infra/ e ligam-se no container.ts.

/** Contexto mínimo de um Run, resolvido a partir do M7 (run -> assignment -> worker/org). */
export interface RunContext {
  runId: string;
  workerId: string;
  orgId: string;
}

export interface RunContextPort {
  getRunContext(runId: string): Promise<RunContext | null>;
}

/** Conteúdo binário de um artefacto (logs, docs, intermédios). */
export interface ArtifactContent {
  filename: string;
  mimeType: string | null;
  bytes: Uint8Array;
  /** Chave de upsert para work_document (ignorada pelo store efémero). */
  idempotencyKey?: string;
}

export interface StoredBlob {
  /** Referência opaca: id do ficheiro na cloud, ou chave no store efémero. */
  storageRef: string;
}

export interface DownloadTarget {
  /** URL assinado / temporário. A app nunca serve o ficheiro diretamente. */
  url: string;
  expiresAt?: Date;
}

/**
 * Cloud do trabalhador (work_document). Implementado sobre o M6:
 * resolve a worker_connection de storage do worker e usa o SDK da cloud.
 * Deve lançar DomainError CLOUD_CONNECTION_MISSING / CLOUD_WRITE_SCOPE_MISSING.
 */
export interface CloudStoragePort {
  write(workerId: string, content: ArtifactContent): Promise<StoredBlob>;
  getDownload(workerId: string, storageRef: string): Promise<DownloadTarget>;
  // Sem delete: a retenção da cloud segue a política da cloud do trabalhador,
  // o cleanup do M8 nunca lhe toca.
}

/** Store efémero (intermediate): S3+TTL, Redis, disco temporário, etc. */
export interface EphemeralStoragePort {
  write(content: ArtifactContent): Promise<StoredBlob>;
  getDownload(storageRef: string): Promise<DownloadTarget>;
  delete(storageRef: string): Promise<void>;
}
