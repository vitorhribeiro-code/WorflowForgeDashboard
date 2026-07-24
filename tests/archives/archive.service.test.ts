import { describe, expect, it } from "vitest";
import { createArchiveService } from "@/modules/archives/service/archive.service";
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
const worker: SessionContext = { userId: "w1", orgId: "o1", role: "worker" };
const other: SessionContext = { userId: "w2", orgId: "o1", role: "worker" };
const admin: SessionContext = { userId: "a1", orgId: "o1", role: "super_admin" };

const sampleData: PeriodData = {
  runs: [{ runId: "r1", status: "success", trigger: "schedule", finishedAt: new Date("2026-07-10T00:00:00Z") }],
  artifacts: [
    { id: "art-final", runId: "r1", filename: "rel.pdf", tier: "work_document", location: "worker_cloud", storageRef: "cloud:1" },
    { id: "art-tmp", runId: "r1", filename: "tmp.json", tier: "intermediate", location: "ephemeral", storageRef: "eph:1" },
  ],
};

function build(opts: { seed?: MonthlyArchive[]; data?: PeriodData; failing?: boolean } = {}) {
  const clock = fixedClock("2026-08-01T00:00:00Z");
  const { repo, rows } = fakeRepo(opts.seed);
  const src = opts.failing ? fakeSourceThatThrows() : fakeSource(opts.data ?? sampleData);
  const { storage, manifests } = fakeStorage();
  const { artifactArchive, marked } = fakeArtifactArchive();
  const { workers } = fakeWorkers({
    w1: { workerId: "w1", orgId: "o1" },
    w2: { workerId: "w2", orgId: "o1" },
  });
  const { audit, entries } = fakeAudit();
  const service = createArchiveService({
    repo,
    source: src.source,
    storage,
    artifactArchive,
    workers,
    audit,
    now: clock.now,
  });
  return { service, repo, rows, calls: (src as any).calls, manifests, marked, entries };
}

describe("buildArchive", () => {
  it("consolida: cria linha, running->success, pasta+manifesto, marca intermédios, audita", async () => {
    const { service, marked, manifests, entries } = build();
    const a = await service.buildArchive({ workerId: "w1", period: PERIOD });

    expect(a.status).toBe("success");
    expect(a.archiveFolderRef).toBeTruthy();
    expect(a.manifest?.runCount).toBe(1);
    expect(a.manifest?.artifactCount).toBe(2);
    // Só o intermédio é marcado como arquivado (o final não).
    expect(marked).toEqual([["art-tmp"]]);
    expect([...manifests.values()]).toHaveLength(1);
    const actions = entries.map((e) => e.action);
    expect(actions).toContain("archive.build_started");
    expect(actions).toContain("archive.ready");
  });

  it("idempotente: 2ª chamada com success devolve o existente sem reconsolidar", async () => {
    const { service, calls } = build();
    await service.buildArchive({ workerId: "w1", period: PERIOD });
    await service.buildArchive({ workerId: "w1", period: PERIOD });
    expect(calls).toHaveLength(1); // collect chamado uma única vez
  });

  it("reconsolida a partir de um estado error", async () => {
    const seed: MonthlyArchive[] = [
      { id: "x", workerId: "w1", period: PERIOD, status: "error", archiveFolderRef: null, manifest: null, createdAt: new Date() },
    ];
    const { service } = build({ seed });
    const a = await service.buildArchive({ workerId: "w1", period: PERIOD });
    expect(a.id).toBe("x");
    expect(a.status).toBe("success");
  });

  it("falha na recolha -> status error, audita archive.error e propaga", async () => {
    const { service, rows, entries } = build({ failing: true });
    await expect(service.buildArchive({ workerId: "w1", period: PERIOD })).rejects.toThrow();
    expect([...rows.values()][0]!.status).toBe("error");
    expect(entries.map((e) => e.action)).toContain("archive.error");
  });

  it("período inválido -> INVALID_PERIOD", async () => {
    const { service } = build();
    await expect(service.buildArchive({ workerId: "w1", period: "2026-13" })).rejects.toMatchObject({
      code: "INVALID_PERIOD",
    });
  });
});

describe("buildAllForPeriod", () => {
  it("consolida todos os workers e agrega ok/failed", async () => {
    const { service } = build();
    const results = await service.buildAllForPeriod(PERIOD);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.ok)).toBe(true);
  });
});

describe("getArchiveById / acesso", () => {
  async function seededOwnedByW1() {
    const { service, rows } = build();
    const a = await service.buildArchive({ workerId: "w1", period: PERIOD });
    return { service, id: a.id, rows };
  }

  it("dono acede", async () => {
    const { service, id } = await seededOwnedByW1();
    const a = await service.getArchiveById(worker, id);
    expect(a.workerId).toBe("w1");
  });
  it("outro worker -> FORBIDDEN", async () => {
    const { service, id } = await seededOwnedByW1();
    await expect(service.getArchiveById(other, id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("admin da org acede", async () => {
    const { service, id } = await seededOwnedByW1();
    const a = await service.getArchiveById(admin, id);
    expect(a.workerId).toBe("w1");
  });
  it("inexistente -> ARCHIVE_NOT_FOUND", async () => {
    const { service } = build();
    await expect(service.getArchiveById(admin, "nope")).rejects.toMatchObject({
      code: "ARCHIVE_NOT_FOUND",
    });
  });
});

describe("listArchives", () => {
  it("worker vê só os seus", async () => {
    const { service } = build();
    await service.buildArchive({ workerId: "w1", period: PERIOD });
    await service.buildArchive({ workerId: "w2", period: PERIOD });
    const list = await service.listArchives(worker);
    expect(list.every((a) => a.workerId === "w1")).toBe(true);
    expect(list).toHaveLength(1);
  });
});

describe("reprocess", () => {
  function seedError() {
    return [
      { id: "e1", workerId: "w1", period: PERIOD, status: "error" as const, archiveFolderRef: null, manifest: null, createdAt: new Date() },
    ];
  }

  it("admin reprocessa um error -> success", async () => {
    const { service } = build({ seed: seedError() });
    const a = await service.reprocess(admin, "e1");
    expect(a.status).toBe("success");
  });
  it("worker não reprocessa -> FORBIDDEN", async () => {
    const { service } = build({ seed: seedError() });
    await expect(service.reprocess(worker, "e1")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("reprocessar um success -> ARCHIVE_ALREADY_READY", async () => {
    const { service } = build();
    const a = await service.buildArchive({ workerId: "w1", period: PERIOD });
    await expect(service.reprocess(admin, a.id)).rejects.toMatchObject({
      code: "ARCHIVE_ALREADY_READY",
    });
  });
});

describe("getDownload", () => {
  it("success -> url; não-pronto -> ARCHIVE_NOT_FOUND", async () => {
    const { service, rows } = build({
      seed: [
        { id: "p1", workerId: "w1", period: PERIOD, status: "pending", archiveFolderRef: null, manifest: null, createdAt: new Date() },
      ],
    });
    await expect(service.getDownload(worker, "p1")).rejects.toMatchObject({ code: "ARCHIVE_NOT_FOUND" });

    const done = await service.buildArchive({ workerId: "w1", period: "2026-06" });
    const dl = await service.getDownload(worker, done.id);
    expect(dl.url).toMatch(/^memory:\/\//);
    void rows;
  });
});
