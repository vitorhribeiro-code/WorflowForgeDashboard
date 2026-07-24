import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";

// -------------------------------------------------------------------------- //
//  Estes ports espelham EXATAMENTE os do M8/M9 (uploads). O download é sempre  //
//  um URL assinado/temporário — a app nunca serve o ficheiro diretamente.      //
// -------------------------------------------------------------------------- //
export type ArtifactContent = { filename: string; mimeType: string | null; bytes: Uint8Array };
export type StoredBlob = { storageRef: string };
export type DownloadTarget = { url: string; expiresAt?: Date };

// M8: store efémero (tier `intermediate`).
export interface EphemeralStoragePort {
  write(content: ArtifactContent): Promise<StoredBlob>;
  getDownload(storageRef: string): Promise<DownloadTarget>;
  delete(storageRef: string): Promise<void>;
}

// M9: store do arquivo (pasta + manifesto).
export interface ArchiveStoragePort {
  createFolder(workerId: string, period: string): Promise<{ folderRef: string }>;
  writeManifest(folderRef: string, manifest: Record<string, unknown>): Promise<void>;
  getDownload(folderRef: string): Promise<{ url: string }>;
}

const SIGNED_TTL = 300; // 5 min

// M8 EphemeralStoragePort sobre S3/R2 (lifecycle do bucket cobre a expiração).
export function createS3EphemeralStore(s3: S3Client, bucket: string, prefix = "ephemeral/"): EphemeralStoragePort {
  return {
    async write(content) {
      const key = `${prefix}${randomUUID()}/${content.filename}`;
      await s3.send(new PutObjectCommand({
        Bucket: bucket, Key: key, Body: content.bytes,
        ContentType: content.mimeType ?? "application/octet-stream",
      }));
      return { storageRef: key };
    },
    async getDownload(storageRef) {
      const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: storageRef }), { expiresIn: SIGNED_TTL });
      return { url, expiresAt: new Date(Date.now() + SIGNED_TTL * 1000) };
    },
    async delete(storageRef) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: storageRef }));
    },
  };
}

// M9 ArchiveStoragePort sobre S3/R2 (a "pasta" é um prefixo de chaves).
export function createS3ArchiveStore(s3: S3Client, bucket: string, prefix = "archives/"): ArchiveStoragePort {
  return {
    async createFolder(workerId, period) {
      return { folderRef: `${prefix}${workerId}/${period}/` };
    },
    async writeManifest(folderRef, manifest) {
      await s3.send(new PutObjectCommand({
        Bucket: bucket, Key: `${folderRef}manifest.json`,
        Body: JSON.stringify(manifest, null, 2), ContentType: "application/json",
      }));
    },
    async getDownload(folderRef) {
      const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: `${folderRef}manifest.json` }), { expiresIn: SIGNED_TTL });
      return { url };
    },
  };
}
