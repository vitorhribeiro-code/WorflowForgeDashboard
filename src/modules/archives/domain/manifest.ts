// Manifesto do arquivo: inventário do período. Puro (recebe os dados e o instante).
import type { PeriodData } from "./archive";

export interface ManifestRun {
  runId: string;
  status: string;
  trigger: string;
  finishedAt: string | null;
}

export interface ManifestArtifact {
  id: string;
  runId: string;
  filename: string;
  tier: string;
  location: string;
  storageRef: string;
}

export interface ArchiveManifest {
  period: string;
  generatedAt: string; // ISO
  runCount: number;
  artifactCount: number;
  runs: ManifestRun[];
  artifacts: ManifestArtifact[];
}

export function buildManifest(input: {
  period: string;
  generatedAt: Date;
  data: PeriodData;
}): ArchiveManifest {
  const { period, generatedAt, data } = input;
  return {
    period,
    generatedAt: generatedAt.toISOString(),
    runCount: data.runs.length,
    artifactCount: data.artifacts.length,
    runs: data.runs.map((r) => ({
      runId: r.runId,
      status: r.status,
      trigger: r.trigger,
      finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
    })),
    artifacts: data.artifacts.map((a) => ({
      id: a.id,
      runId: a.runId,
      filename: a.filename,
      tier: a.tier,
      location: a.location,
      storageRef: a.storageRef,
    })),
  };
}

/** Ids dos intermédios do período — para o M8 marcar como arquivados. */
export function intermediateArtifactIds(data: PeriodData): string[] {
  return data.artifacts.filter((a) => a.tier === "intermediate").map((a) => a.id);
}
