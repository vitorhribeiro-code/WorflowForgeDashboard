// Liga o hook de artefactos (endpoints) ao componente presentacional.
// Usado no drill-down do popup "Ações recentes": um run -> os seus artefactos.
"use client";
import { useRunArtifacts } from "./use-run-artifacts";
import { ArtifactList } from "./artifact-list";

export function RunArtifactsPanel({ runId }: { runId: string }) {
  const { artifacts, loading, error, download } = useRunArtifacts(runId);

  return (
    <ArtifactList
      artifacts={artifacts}
      loading={loading}
      error={error}
      onDownload={(id) => void download(id)}
    />
  );
}
