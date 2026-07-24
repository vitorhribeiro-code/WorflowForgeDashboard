import { describe, expect, it } from "vitest";
import { evaluateReadiness } from "@/platform/readiness/readiness";

describe("evaluateReadiness", () => {
  const required = [{ toolId: "t1", scopes: ["read", "write"] }];

  it("pronto quando a conexão está connected com scopes suficientes", () => {
    const r = evaluateReadiness(required, [
      { toolId: "t1", status: "connected", grantedScopes: ["read", "write", "extra"] },
    ]);
    expect(r.ready).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it("sem conexão → no_connection", () => {
    const r = evaluateReadiness(required, []);
    expect(r.ready).toBe(false);
    expect(r.missing).toEqual([{ toolId: "t1", reason: "no_connection" }]);
  });

  it("conexão expirada/revogada → not_connected", () => {
    const r = evaluateReadiness(required, [
      { toolId: "t1", status: "expired", grantedScopes: ["read", "write"] },
    ]);
    expect(r.missing[0]).toMatchObject({ reason: "not_connected" });
  });

  it("scopes insuficientes → missing_scopes com o que falta", () => {
    const r = evaluateReadiness(required, [
      { toolId: "t1", status: "connected", grantedScopes: ["read"] },
    ]);
    expect(r.missing[0]).toEqual({ toolId: "t1", reason: "missing_scopes", missingScopes: ["write"] });
  });

  it("sem required → pronto", () => {
    expect(evaluateReadiness([], []).ready).toBe(true);
  });
});
