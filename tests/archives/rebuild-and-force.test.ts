import { describe, expect, it } from "vitest";
import { createArchiveService } from "@/modules/archives/service/archive.service";
import { resolveArchiveStore } from "@/modules/archives/container";
import type { MonthlyArchive, PeriodData } from "@/modules/archives/domain/archive";
import type { SessionContext } from "@/lib/session";
import {
  fakeArtifactArchive,
  fakeAudit,
  fakeRepo,
  fakeSource,
  fakeSourceThatThrows,
  fakeStorage,
  fakeWorkers,
  fixedClock,
} from "./fakes";

const PERIOD = "2026-07";
const admin: SessionContext = { userId: "a1", orgId: "o1", role: "super_admin" };

const sampleData: PeriodData = {
  runs: [{ runId: "r1", status: "success", trigger: "schedule", finishedAt: new Date("2026-07-10T00:00:00Z") }],
  artifacts: [
    { id: "art-final", runId: "r1", filename: "rel.pdf", tier: "work_document", location: "worker_cloud", storageRef: "cloud:1" },
  ],
};

function build(opts: { seed?: MonthlyArchive[]; failing?: boolean } = {}) {
  const clock = fixedClock("2026-08-01T00:00:00Z");
  const { repo, rows } = fakeRepo(opts.seed);
  const src = opts.failing ? fakeSourceThatThrows() : fakeSource(sampleData);
  const { storage } = fakeStorage();
  const { artifactArchive } = fakeArtifactArchive();
  const { workers } = fakeWorkers({ w1: { workerId: "w1", orgId: "o1" } });
  const { audit } = fakeAudit();
  const service = createArchiveService({
    repo,
    source: src.source,
    storage,
    artifactArchive,
    workers,
    audit,
    now: clock.now,
  });
  return { service, rows };
}

function memoryArchive(id: string, folderRef: string | null): MonthlyArchive {
  return {
    id,
    workerId: "w1",
    period: PERIOD,
    status: "success",
    archiveFolderRef: folderRef,
    manifest: { period: PERIOD, generatedAt: new Date(), runCount: 0, artifactCount: 0, runs: [], artifacts: [] } as never,
    createdAt: new Date(),
  };
}

describe("reprocess com force", () => {
  it("admin com { force } reconstrói um success (folderRef de memória) -> novo folderRef", async () => {
    const { service, rows } = build({ seed: [memoryArchive("m1", "arch:w1:2026-07:old")] });
    const a = await service.reprocess(admin, "m1", { force: true });
    expect(a.status).toBe("success");
    // runConsolidation correu: folderRef foi regravado pelo store.
    expect(a.archiveFolderRef).not.toBe("arch:w1:2026-07:old");
    expect(rows.get("m1")!.archiveFolderRef).toBe(a.archiveFolderRef);
  });

  it("admin sem force num success continua a dar ARCHIVE_ALREADY_READY", async () => {
    const { service } = build({ seed: [memoryArchive("m1", "arch:w1:2026-07:old")] });
    await expect(service.reprocess(admin, "m1")).rejects.toMatchObject({
      code: "ARCHIVE_ALREADY_READY",
    });
  });
});

describe("rebuildBrokenArchives", () => {
  it("reconstrói só os de formato-memória; ignora os já em archives/… e os não-success", async () => {
    const { service, rows } = build({
      seed: [
        memoryArchive("broken", "arch:w1:2026-07:old"),
        memoryArchive("healthy", "archives/w1/2026-07/"),
        { ...memoryArchive("err", "arch:w1:2026-06:x"), status: "error" },
      ],
    });
    const res = await service.rebuildBrokenArchives();
    expect(res).toEqual({ scanned: 1, rebuilt: 1, failed: 0 });
    // O partido foi reconstruído (folderRef mudou); o saudável ficou intacto.
    expect(rows.get("broken")!.archiveFolderRef).not.toBe("arch:w1:2026-07:old");
    expect(rows.get("healthy")!.archiveFolderRef).toBe("archives/w1/2026-07/");
  });

  it("falha por-item é não-fatal: source a falhar -> failed conta, sem atirar", async () => {
    const { service, rows } = build({
      failing: true,
      seed: [memoryArchive("m1", "arch:a"), memoryArchive("m2", "arch:b")],
    });
    const res = await service.rebuildBrokenArchives();
    expect(res).toEqual({ scanned: 2, rebuilt: 0, failed: 2 });
    // Cada um ficou em error (reprocessável), não success oco.
    expect(rows.get("m1")!.status).toBe("error");
    expect(rows.get("m2")!.status).toBe("error");
  });
});

describe("resolveArchiveStore (guard de produção)", () => {
  it("sem S3 em produção -> escrita/download falham (não gera success oco)", async () => {
    const store = resolveArchiveStore(null, null, true);
    await expect(store.writeManifest("archives/x/", {} as never)).rejects.toThrow();
    await expect(store.getDownload("archives/x/")).rejects.toThrow();
  });

  it("sem S3 fora de produção -> store de memória funcional (dev/testes)", async () => {
    const store = resolveArchiveStore(null, null, false);
    const { folderRef } = await store.createFolder("w1", PERIOD);
    await expect(store.writeManifest(folderRef, {} as never)).resolves.toBeUndefined();
    const { url } = await store.getDownload(folderRef);
    expect(url).toContain(folderRef);
  });
});
