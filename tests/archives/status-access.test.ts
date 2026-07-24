import { describe, expect, it } from "vitest";
import {
  canTransition,
  isBuildable,
  isReprocessable,
  isTerminal,
} from "@/modules/archives/domain/status";
import { canViewArchive, isAdmin } from "@/modules/archives/domain/access";
import type { SessionContext } from "@/lib/session";

describe("status", () => {
  it("transições válidas", () => {
    expect(canTransition("pending", "running")).toBe(true);
    expect(canTransition("running", "success")).toBe(true);
    expect(canTransition("running", "error")).toBe(true);
    expect(canTransition("error", "running")).toBe(true);
  });
  it("transições inválidas", () => {
    expect(canTransition("success", "running")).toBe(false);
    expect(canTransition("pending", "success")).toBe(false);
  });
  it("success é terminal", () => {
    expect(isTerminal("success")).toBe(true);
    expect(isTerminal("error")).toBe(false);
  });
  it("buildable = pending|error; reprocessable = error|running", () => {
    expect(isBuildable("pending")).toBe(true);
    expect(isBuildable("error")).toBe(true);
    expect(isBuildable("running")).toBe(false);
    expect(isReprocessable("error")).toBe(true);
    expect(isReprocessable("running")).toBe(true);
    expect(isReprocessable("success")).toBe(false);
  });
});

describe("access", () => {
  const w = (p: Partial<SessionContext>): SessionContext => ({
    userId: "w1",
    orgId: "o1",
    role: "worker",
    ...p,
  });

  it("isAdmin", () => {
    expect(isAdmin(w({ role: "super_admin" }))).toBe(true);
    expect(isAdmin(w({}))).toBe(false);
  });
  it("worker vê só o seu", () => {
    expect(canViewArchive(w({ userId: "w1" }), "o1", "w1")).toBe(true);
    expect(canViewArchive(w({ userId: "w1" }), "o1", "w2")).toBe(false);
  });
  it("admin vê a org toda", () => {
    expect(canViewArchive(w({ role: "super_admin" }), "o1", "w2")).toBe(true);
  });
  it("noutra org ninguém vê", () => {
    expect(canViewArchive(w({ role: "super_admin", orgId: "o2" }), "o1", "w1")).toBe(false);
  });
});
