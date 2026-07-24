// Ponte para o M8: marcar intermédios como arquivados.
// Recebe o service do M8 (ou só o método markArchived) por injeção — sem importar o repo do M8.
import type { ArtifactArchivePort } from "../service/ports";

export interface M8MarkArchived {
  markArchived(ids: string[]): Promise<void>;
}

export function createArtifactArchiveAdapter(m8: M8MarkArchived): ArtifactArchivePort {
  return {
    async markArchived(artifactIds) {
      if (artifactIds.length === 0) return;
      await m8.markArchived(artifactIds);
    },
  };
}
