import { describe, expect, it } from "vitest";
import {
  isCleanable,
  isDownloadable,
  isExpired,
  locationForTier,
  planArtifact,
} from "@/modules/artifacts/domain/tier-policy";
import type { Artifact } from "@/modules/artifacts/domain/artifact";

const now = new Date("2026-07-22T12:00:00Z");

function art(p: Partial<Artifact>): Artifact {
  return {
    id: "a",
    runId: "r",
    filename: "f",
    mimeType: null,
    tier: "intermediate",
    location: "ephemeral",
    storageRef: "s",
    archived: false,
    expiresAt: null,
    createdAt: now,
    ...p,
  };
}

describe("tier-policy", () => {
  it("mapeia tier -> location", () => {
    expect(locationForTier("work_document")).toBe("worker_cloud");
    expect(locationForTier("intermediate")).toBe("ephemeral");
  });

  it("work_document não tem TTL", () => {
    const plan = planArtifact("work_document", now, 1000);
    expect(plan).toEqual({ location: "worker_cloud", expiresAt: null });
  });

  it("intermediate expira em now+ttl", () => {
    const plan = planArtifact("intermediate", now, 60_000);
    expect(plan.location).toBe("ephemeral");
    expect(plan.expiresAt?.toISOString()).toBe("2026-07-22T12:01:00.000Z");
  });

  it("isExpired: só efémeros com expiresAt no passado", () => {
    expect(isExpired(art({ expiresAt: null }), now)).toBe(false);
    expect(isExpired(art({ expiresAt: new Date("2026-07-22T11:59:59Z") }), now)).toBe(true);
    expect(isExpired(art({ expiresAt: new Date("2026-07-22T12:00:01Z") }), now)).toBe(false);
  });

  it("isCleanable: intermédio + arquivado + expirado", () => {
    const base = { tier: "intermediate" as const, archived: true, expiresAt: new Date("2026-07-22T11:00:00Z") };
    expect(isCleanable(base, now)).toBe(true);
    expect(isCleanable({ ...base, archived: false }, now)).toBe(false); // não arquivado
    expect(isCleanable({ ...base, expiresAt: new Date("2026-07-22T13:00:00Z") }, now)).toBe(false); // não expirado
    expect(isCleanable({ ...base, tier: "work_document" }, now)).toBe(false); // nunca work_document
  });

  it("isDownloadable: cloud sempre; efémero só se não expirado", () => {
    expect(isDownloadable(art({ tier: "work_document" }), now)).toBe(true);
    expect(isDownloadable(art({ tier: "intermediate", expiresAt: new Date("2026-07-22T13:00:00Z") }), now)).toBe(true);
    expect(isDownloadable(art({ tier: "intermediate", expiresAt: new Date("2026-07-22T11:00:00Z") }), now)).toBe(false);
  });
});
