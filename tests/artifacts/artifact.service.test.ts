import { beforeEach, describe, expect, it } from "vitest";
import {
  createArtifactService,
  type ArtifactService,
} from "@/modules/artifacts/service/artifact.service";
import type { Artifact } from "@/modules/artifacts/domain/artifact";
import type { SessionContext } from "@/lib/session";
import {
  fakeAudit,
  fakeCloud,
  fakeEphemeral,
  fakeRepo,
  fakeRuns,
  fixedClock,
} from "./fakes";

const RUN = { runId: "run1", workerId: "w1", orgId: "o1" };
const worker: SessionContext = { userId: "w1", orgId: "o1", role: "worker" };
const other: SessionContext = { userId: "w2", orgId: "o1", role: "worker" };
const admin: SessionContext = { userId: "a1", orgId: "o1", role: "super_admin" };
const TTL = 60_000; // 1 min

function bytes(s: string) {
  return new TextEncoder().encode(s);
}

function build(opts: { seed?: Artifact[]; cloudMissing?: boolean } = {}) {
  const clock = fixedClock("2026-07-22T12:00:00Z");
  const { repo, rows } = fakeRepo(opts.seed);
  const { cloud, uploads } = fakeCloud({ missing: opts.cloudMissing });
  const { ephemeral, blobs, deleted } = fakeEphemeral();
  const { runs } = fakeRuns({ [RUN.runId]: RUN });
  const { audit, entries } = fakeAudit();
  const service: ArtifactService = createArtifactService({
    repo,
    cloud,
    ephemeral,
    runs,
    audit,
    now: clock.now,
    ttlMs: TTL,
  });
  return { service, repo, rows, cloud, uploads, ephemeral, blobs, deleted, audit, entries, clock };
}

describe("persist", () => {
  it("work_document -> escreve na cloud, sem TTL, audita", async () => {
    const { service, uploads, entries } = build();
    const a = await service.persist({
      runId: RUN.runId,
      filename: "relatorio.pdf",
      mimeType: "application/pdf",
      tier: "work_document",
      bytes: bytes("x"),
    });
    expect(a.location).toBe("worker_cloud");
    expect(a.expiresAt).toBeNull();
    expect(a.storageRef).toMatch(/^cloud:/);
    expect(uploads[0]!.workerId).toBe("w1");
    expect(entries[0]).toMatchObject({ action: "artifact.created", actorId: null });
  });

  it("intermediate -> store efémero com expiresAt = now+ttl", async () => {
    const { service } = build();
    const a = await service.persist({
      runId: RUN.runId,
      filename: "tmp.json",
      mimeType: "application/json",
      tier: "intermediate",
      bytes: bytes("y"),
    });
    expect(a.location).toBe("ephemeral");
    expect(a.storageRef).toMatch(/^eph:/);
    expect(a.expiresAt?.toISOString()).toBe("2026-07-22T12:01:00.000Z");
  });

  it("cloud em falta -> CLOUD_CONNECTION_MISSING e nada é persistido", async () => {
    const { service, rows } = build({ cloudMissing: true });
    await expect(
      service.persist({
        runId: RUN.runId,
        filename: "f.pdf",
        mimeType: null,
        tier: "work_document",
        bytes: bytes("z"),
      }),
    ).rejects.toMatchObject({ code: "CLOUD_CONNECTION_MISSING" });
    expect(rows.size).toBe(0);
  });

  it("run inexistente -> RUN_NOT_FOUND", async () => {
    const { service } = build();
    await expect(
      service.persist({
        runId: "nope",
        filename: "f",
        mimeType: null,
        tier: "intermediate",
        bytes: bytes("z"),
      }),
    ).rejects.toMatchObject({ code: "RUN_NOT_FOUND" });
  });
});

describe("listByRun", () => {
  it("worker dono vê os seus, com flags derivadas", async () => {
    const { service } = build();
    await service.persist({ runId: RUN.runId, filename: "a", mimeType: null, tier: "work_document", bytes: bytes("1") });
    const list = await service.listByRun(worker, RUN.runId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ expired: false, downloadable: true });
  });

  it("outro worker -> FORBIDDEN", async () => {
    const { service } = build();
    await expect(service.listByRun(other, RUN.runId)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("admin da org vê", async () => {
    const { service } = build();
    await service.persist({ runId: RUN.runId, filename: "a", mimeType: null, tier: "intermediate", bytes: bytes("1") });
    const list = await service.listByRun(admin, RUN.runId);
    expect(list).toHaveLength(1);
  });
});

describe("getDownload", () => {
  it("efémero não expirado -> url", async () => {
    const { service } = build();
    const a = await service.persist({ runId: RUN.runId, filename: "t", mimeType: null, tier: "intermediate", bytes: bytes("1") });
    const target = await service.getDownload(worker, a.id);
    expect(target.url).toMatch(/^memory:\/\//);
  });

  it("efémero expirado -> ARTIFACT_EXPIRED", async () => {
    const { service, clock } = build();
    const a = await service.persist({ runId: RUN.runId, filename: "t", mimeType: null, tier: "intermediate", bytes: bytes("1") });
    clock.set("2026-07-22T12:02:00Z"); // > TTL
    await expect(service.getDownload(worker, a.id)).rejects.toMatchObject({ code: "ARTIFACT_EXPIRED" });
  });

  it("work_document -> url da cloud", async () => {
    const { service } = build();
    const a = await service.persist({ runId: RUN.runId, filename: "d.pdf", mimeType: null, tier: "work_document", bytes: bytes("1") });
    const target = await service.getDownload(worker, a.id);
    expect(target.url).toMatch(/^https:\/\/cloud\.example\//);
  });

  it("artefacto inexistente -> ARTIFACT_NOT_FOUND", async () => {
    const { service } = build();
    await expect(service.getDownload(worker, "missing")).rejects.toMatchObject({ code: "ARTIFACT_NOT_FOUND" });
  });
});

describe("cleanupExpiredIntermediates", () => {
  const base = (p: Partial<Artifact>): Artifact => ({
    id: p.id ?? "x",
    runId: RUN.runId,
    filename: "f",
    mimeType: null,
    tier: "intermediate",
    location: "ephemeral",
    storageRef: p.storageRef ?? "eph:seed",
    archived: false,
    expiresAt: null,
    createdAt: new Date("2026-07-22T10:00:00Z"),
    ...p,
  });

  it("apaga só intermédios expirados E arquivados; poupa o resto", async () => {
    const seed: Artifact[] = [
      base({ id: "del", storageRef: "eph:del", archived: true, expiresAt: new Date("2026-07-22T11:00:00Z") }), // apagar
      base({ id: "not-archived", archived: false, expiresAt: new Date("2026-07-22T11:00:00Z") }), // fica
      base({ id: "not-expired", archived: true, expiresAt: new Date("2026-07-22T13:00:00Z") }), // fica
      base({ id: "final", tier: "work_document", location: "worker_cloud", archived: true, expiresAt: null }), // nunca
    ];
    const { service, rows, deleted, entries } = build({ seed });
    const res = await service.cleanupExpiredIntermediates();

    expect(res.deleted).toBe(1);
    expect(rows.has("del")).toBe(false);
    expect(rows.has("not-archived")).toBe(true);
    expect(rows.has("not-expired")).toBe(true);
    expect(rows.has("final")).toBe(true);
    expect(deleted).toContain("eph:del"); // blob efémero libertado
    expect(entries.some((e) => e.action === "artifact.expired")).toBe(true);
  });
});

describe("markArchived", () => {
  it("marca intermédios como arquivados (usado pelo M9)", async () => {
    const seed: Artifact[] = [
      {
        id: "m1",
        runId: RUN.runId,
        filename: "f",
        mimeType: null,
        tier: "intermediate",
        location: "ephemeral",
        storageRef: "eph:m1",
        archived: false,
        expiresAt: new Date("2026-07-22T13:00:00Z"),
        createdAt: new Date(),
      },
    ];
    const { service, rows } = build({ seed });
    await service.markArchived(["m1"]);
    expect(rows.get("m1")?.archived).toBe(true);
  });
});
