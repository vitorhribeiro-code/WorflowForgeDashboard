// Fakes em memória. Implementam as interfaces do M9 estruturalmente. Sem DB nem rede.
import { randomUUID } from "node:crypto";
import type { MonthlyArchive, PeriodData } from "@/modules/archives/domain/archive";
import type { ArchiveManifest } from "@/modules/archives/domain/manifest";
import type { ArchiveStatus } from "@/modules/archives/domain/status";
import type {
  ArchiveListFilter,
  ArchiveRepository,
} from "@/modules/archives/data/archive.repository";
import type {
  ArchiveStoragePort,
  ArtifactArchivePort,
  PeriodSourcePort,
  WorkerDirectoryPort,
  WorkerRef,
} from "@/modules/archives/service/ports";
import type { AuditEntry, AuditPort } from "@/lib/audit";

export function fakeRepo(seed: MonthlyArchive[] = []) {
  const rows = new Map<string, MonthlyArchive>(seed.map((a) => [a.id, a]));
  const repo: ArchiveRepository = {
    async findById(id) {
      return rows.get(id) ?? null;
    },
    async findByWorkerPeriod(workerId, period) {
      return [...rows.values()].find((a) => a.workerId === workerId && a.period === period) ?? null;
    },
    async ensure(workerId, period) {
      const existing = await this.findByWorkerPeriod(workerId, period);
      if (existing) return existing;
      const a: MonthlyArchive = {
        id: randomUUID(),
        workerId,
        period,
        status: "pending",
        archiveFolderRef: null,
        manifest: null,
        createdAt: new Date(),
      };
      rows.set(a.id, a);
      return a;
    },
    async updateStatus(id, status: ArchiveStatus) {
      const a = rows.get(id)!;
      const next = { ...a, status };
      rows.set(id, next);
      return next;
    },
    async finish(id, data) {
      const a = rows.get(id)!;
      const next = {
        ...a,
        status: data.status,
        archiveFolderRef: data.archiveFolderRef,
        manifest: data.manifest,
      };
      rows.set(id, next);
      return next;
    },
    async listByWorker(workerId, period) {
      return [...rows.values()].filter(
        (a) => a.workerId === workerId && (!period || a.period === period),
      );
    },
    async listByOrg(_orgId, filter?: ArchiveListFilter) {
      // O fake não conhece org->worker; devolve por filtro (o teste controla o seed).
      return [...rows.values()].filter(
        (a) =>
          (!filter?.workerId || a.workerId === filter.workerId) &&
          (!filter?.period || a.period === filter.period),
      );
    },
    async listMemoryFormatArchives() {
      return [...rows.values()].filter(
        (a) =>
          a.status === "success" &&
          !!a.archiveFolderRef &&
          a.archiveFolderRef.startsWith("arch:"),
      );
    },
  };
  return { repo, rows };
}

export function fakeSource(data: PeriodData) {
  const calls: Array<{ workerId: string; start: Date; end: Date }> = [];
  const source: PeriodSourcePort = {
    async collect(workerId, start, end) {
      calls.push({ workerId, start, end });
      return data;
    },
  };
  return { source, calls };
}

export function fakeSourceThatThrows() {
  const source: PeriodSourcePort = {
    async collect() {
      throw new Error("falha a recolher período");
    },
  };
  return { source };
}

export function fakeStorage() {
  const folders: Array<{ workerId: string; period: string; folderRef: string }> = [];
  const manifests = new Map<string, ArchiveManifest>();
  const storage: ArchiveStoragePort = {
    async createFolder(workerId, period) {
      const folderRef = `arch:${workerId}:${period}:${folders.length + 1}`;
      folders.push({ workerId, period, folderRef });
      return { folderRef };
    },
    async writeManifest(folderRef, manifest) {
      manifests.set(folderRef, manifest);
    },
    async getDownload(folderRef) {
      return { url: `memory://${folderRef}` };
    },
  };
  return { storage, folders, manifests };
}

export function fakeArtifactArchive() {
  const marked: string[][] = [];
  const artifactArchive: ArtifactArchivePort = {
    async markArchived(ids) {
      marked.push(ids);
    },
  };
  return { artifactArchive, marked };
}

export function fakeWorkers(map: Record<string, WorkerRef>) {
  const workers: WorkerDirectoryPort = {
    async getWorker(workerId) {
      return map[workerId] ?? null;
    },
    async listWorkerIds(orgId) {
      return Object.values(map)
        .filter((w) => !orgId || w.orgId === orgId)
        .map((w) => w.workerId);
    },
  };
  return { workers };
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

export function fixedClock(iso: string) {
  let current = new Date(iso);
  return {
    now: () => current,
    set: (next: string) => {
      current = new Date(next);
    },
  };
}
