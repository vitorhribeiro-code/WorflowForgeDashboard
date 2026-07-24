// Tipos de domínio do arquivo mensal. Puro, sem IO.
import type { ArchiveStatus } from "./status";
import type { ArchiveManifest } from "./manifest";

export interface MonthlyArchive {
  id: string;
  workerId: string;
  period: string; // "YYYY-MM"
  status: ArchiveStatus;
  /** Pasta onde vive o pacote (logs + ficheiros retidos). Só quando success. */
  archiveFolderRef: string | null;
  manifest: ArchiveManifest | null;
  createdAt: Date;
}

/* --- Dados recolhidos do período (fronteira com M7/M8) --- */

export interface ArchivedRun {
  runId: string;
  status: string;
  trigger: string;
  finishedAt: Date | null;
}

export interface ArchivedArtifact {
  id: string;
  runId: string;
  filename: string;
  tier: "work_document" | "intermediate";
  location: string;
  storageRef: string;
}

export interface PeriodData {
  runs: ArchivedRun[];
  artifacts: ArchivedArtifact[];
}
