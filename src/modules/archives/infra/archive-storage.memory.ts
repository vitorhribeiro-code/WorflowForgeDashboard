// Storage do pacote do arquivo (referência, em memória). Em produção trocar por
// cloud/objeto (S3, GCS, Drive do trabalhador) — a interface não muda.
import { randomUUID } from "node:crypto";
import type { ArchiveManifest } from "../domain/manifest";
import type { ArchiveStoragePort } from "../service/ports";

export function createMemoryArchiveStore(baseUrl = "memory://archives"): ArchiveStoragePort {
  const manifests = new Map<string, ArchiveManifest>();
  return {
    async createFolder(workerId, period): Promise<{ folderRef: string }> {
      return { folderRef: `arch:${workerId}:${period}:${randomUUID()}` };
    },
    async writeManifest(folderRef, manifest): Promise<void> {
      manifests.set(folderRef, manifest);
    },
    async getDownload(folderRef): Promise<{ url: string }> {
      return { url: `${baseUrl}/${folderRef}` };
    },
  };
}
