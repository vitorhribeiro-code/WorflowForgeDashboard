// Tipos de domínio dos artefactos. Puro: sem IO, sem Drizzle.
// Os valores seguem o schema.ts (fonte de verdade), NÃO a docx.
//   - tier:     work_document | intermediate   (a docx dizia cloud_worker/ephemeral/monthly_archive)
//   - location: worker_cloud  | ephemeral
// O "monthly_archive" da docx NÃO é um tier: é a tabela monthly_archives (M9).

export type ArtifactTier = "work_document" | "intermediate";
export type ArtifactLocation = "worker_cloud" | "ephemeral";

export interface Artifact {
  id: string;
  runId: string;
  filename: string;
  mimeType: string | null;
  tier: ArtifactTier;
  location: ArtifactLocation;
  /** id na cloud do trabalhador (work_document) ou chave no store efémero (intermediate). */
  storageRef: string;
  /** Marcado pelo M9 quando o intermédio já foi capturado para o arquivo mensal. */
  archived: boolean;
  /** Só preenchido para intermédios (TTL). null para work_document. */
  expiresAt: Date | null;
  createdAt: Date;
}

/** Vista para a UI: acrescenta estado derivado (não persistido). */
export interface ArtifactView extends Artifact {
  expired: boolean;
  downloadable: boolean;
}
