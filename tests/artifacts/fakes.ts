// Fakes em memória. Implementam as interfaces do M8 estruturalmente. Sem DB nem rede.
import { randomUUID } from "node:crypto";
import type { Artifact } from "@/modules/artifacts/domain/artifact";
import type {
  ArtifactRepository,
  NewArtifact,
} from "@/modules/artifacts/data/artifact.repository";
import type {
  ArtifactContent,
  CloudStoragePort,
  DownloadTarget,
  EphemeralStoragePort,
  RunContext,
  RunContextPort,
  StoredBlob,
} from "@/modules/artifacts/service/ports";
import type { AuditEntry, AuditPort } from "@/lib/audit";
import { DomainError } from "@/lib/errors";

export function fakeRepo(seed: Artifact[] = []) {
  const rows = new Map<string, Artifact>(seed.map((a) => [a.id, a]));
  const repo: ArtifactRepository = {
    async insert(a: NewArtifact) {
      const artifact: Artifact = { id: randomUUID(), createdAt: new Date(), ...a };
      rows.set(artifact.id, artifact);
      return artifact;
    },
    async findById(id) {
      return rows.get(id) ?? null;
    },
    async listByRun(runId) {
      return [...rows.values()].filter((a) => a.runId === runId);
    },
    async markArchived(ids) {
      for (const id of ids) {
        const a = rows.get(id);
        if (a) rows.set(id, { ...a, archived: true });
      }
    },
    async listCleanable(now) {
      return [...rows.values()].filter(
        (a) =>
          a.tier === "intermediate" &&
          a.archived &&
          a.expiresAt !== null &&
          a.expiresAt.getTime() <= now.getTime(),
      );
    },
    async deleteByIds(ids) {
      for (const id of ids) rows.delete(id);
    },
  };
  return { repo, rows };
}

export function fakeCloud(opts: { missing?: boolean } = {}) {
  const uploads: Array<{ workerId: string; content: ArtifactContent }> = [];
  const appends: Array<{
    workerId: string;
    filename: string;
    idempotencyKey: string;
    marker: string;
    header: string;
    block: string;
  }> = [];
  const cloud: CloudStoragePort = {
    async write(workerId, content): Promise<StoredBlob> {
      if (opts.missing) {
        throw new DomainError("CLOUD_CONNECTION_MISSING", "sem cloud");
      }
      uploads.push({ workerId, content });
      return { storageRef: `cloud:${uploads.length}` };
    },
    async getDownload(_workerId, storageRef): Promise<DownloadTarget> {
      return { url: `https://cloud.example/${storageRef}` };
    },
    async appendDocument(workerId, args) {
      if (opts.missing) {
        throw new DomainError("CLOUD_CONNECTION_MISSING", "sem cloud");
      }
      appends.push({ workerId, ...args });
      return { storageRef: "cloud:weekly", appended: true };
    },
  };
  return { cloud, uploads, appends };
}

export function fakeEphemeral(opts: { failOn?: Iterable<string> } = {}) {
  const blobs = new Map<string, ArtifactContent>();
  const deleted: string[] = [];
  const failOn = new Set(opts.failOn ?? []);
  const ephemeral: EphemeralStoragePort = {
    async write(content): Promise<StoredBlob> {
      const key = `eph:${blobs.size + 1}`;
      blobs.set(key, content);
      return { storageRef: key };
    },
    async getDownload(storageRef): Promise<DownloadTarget> {
      return { url: `memory://${storageRef}` };
    },
    async delete(storageRef) {
      // Simula uma falha de apagamento no store (ex.: objeto R2 inacessível).
      if (failOn.has(storageRef)) {
        throw new Error(`falha simulada ao apagar ${storageRef}`);
      }
      blobs.delete(storageRef);
      deleted.push(storageRef);
    },
  };
  return { ephemeral, blobs, deleted };
}

export function fakeRuns(map: Record<string, RunContext>) {
  const runs: RunContextPort = {
    async getRunContext(runId) {
      return map[runId] ?? null;
    },
  };
  return { runs };
}

export function fakeAudit() {
  const entries: AuditEntry[] = [];
  const audit: AuditPort = {
    async record(e) {
      entries.push(e);
    },
  };
  return { audit, entries };
}

/** Relógio fixo, controlável nos testes. */
export function fixedClock(iso: string) {
  let current = new Date(iso);
  return {
    now: () => current,
    set: (next: string) => {
      current = new Date(next);
    },
  };
}
