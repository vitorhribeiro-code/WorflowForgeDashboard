import { describe, expect, it } from "vitest";
import { canAccessRun } from "@/modules/artifacts/domain/access";
import type { SessionContext } from "@/lib/session";
import type { RunContext } from "@/modules/artifacts/service/ports";

const ctx: RunContext = { runId: "r1", workerId: "w1", orgId: "o1" };

function s(p: Partial<SessionContext>): SessionContext {
  return { userId: "w1", orgId: "o1", role: "worker", ...p };
}

describe("canAccessRun", () => {
  it("worker dono acede", () => {
    expect(canAccessRun(s({ userId: "w1" }), ctx)).toBe(true);
  });
  it("worker de outro não acede", () => {
    expect(canAccessRun(s({ userId: "w2" }), ctx)).toBe(false);
  });
  it("super_admin da mesma org acede", () => {
    expect(canAccessRun(s({ userId: "admin", role: "super_admin" }), ctx)).toBe(true);
  });
  it("noutra org ninguém acede", () => {
    expect(canAccessRun(s({ orgId: "o2", role: "super_admin" }), ctx)).toBe(false);
    expect(canAccessRun(s({ userId: "w1", orgId: "o2" }), ctx)).toBe(false);
  });
});
