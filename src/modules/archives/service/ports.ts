// Interfaces de saída do M9. O service depende só destas; adaptadores em infra/.
import type { PeriodData } from "../domain/archive";
import type { ArchiveManifest } from "../domain/manifest";

/** Recolhe runs + artefactos de um worker num intervalo [start, end). Lê M7/M8. */
export interface PeriodSourcePort {
  collect(workerId: string, start: Date, end: Date): Promise<PeriodData>;
}

/** Storage do pacote do arquivo (pasta + manifesto). Cloud/objeto/volume. */
export interface ArchiveStoragePort {
  createFolder(workerId: string, period: string): Promise<{ folderRef: string }>;
  writeManifest(folderRef: string, manifest: ArchiveManifest): Promise<void>;
  getDownload(folderRef: string): Promise<{ url: string }>;
}

/** Ponte para o M8: marcar intermédios como arquivados (habilita o cleanup do M8). */
export interface ArtifactArchivePort {
  markArchived(artifactIds: string[]): Promise<void>;
}

export interface WorkerRef {
  workerId: string;
  orgId: string;
}

/** Diretório de trabalhadores (M2). Resolve org e lista workers para o cron. */
export interface WorkerDirectoryPort {
  getWorker(workerId: string): Promise<WorkerRef | null>;
  /** orgId omitido = todos os workers (job de plataforma). */
  listWorkerIds(orgId?: string): Promise<string[]>;
}
