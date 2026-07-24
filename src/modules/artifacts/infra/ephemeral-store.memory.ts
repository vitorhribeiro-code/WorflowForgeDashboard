// Impl de referência do store efémero (em memória). Em produção trocar por
// S3 com lifecycle/TTL, Redis, ou volume temporário — a interface não muda.
// O TTL "duro" é aplicado pela política do M8 (expiresAt) + cleanup; aqui só guarda bytes.
import { randomUUID } from "node:crypto";
import type {
  ArtifactContent,
  DownloadTarget,
  EphemeralStoragePort,
  StoredBlob,
} from "../service/ports";

export function createMemoryEphemeralStore(
  baseUrl = "memory://ephemeral",
): EphemeralStoragePort {
  const blobs = new Map<string, ArtifactContent>();
  return {
    async write(content: ArtifactContent): Promise<StoredBlob> {
      const key = randomUUID();
      blobs.set(key, content);
      return { storageRef: key };
    },
    async getDownload(storageRef: string): Promise<DownloadTarget> {
      if (!blobs.has(storageRef)) {
        // O service já bloqueia expirados; aqui só o físico ausente.
        throw new Error("blob efémero inexistente");
      }
      return { url: `${baseUrl}/${storageRef}` };
    },
    async delete(storageRef: string): Promise<void> {
      blobs.delete(storageRef);
    },
  };
}
