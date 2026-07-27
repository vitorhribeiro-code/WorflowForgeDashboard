import { describe, it, expect } from "vitest";
import {
  computeReady,
  connectionAction,
  connectionTone,
} from "@/modules/connections/domain/connection.types";

describe("connectionTone", () => {
  it("ligada e sem scopes em falta → green", () => {
    expect(connectionTone("connected", [])).toBe("green");
  });

  it("ligada mas com scopes em falta → amber", () => {
    expect(connectionTone("connected", ["drive.write"])).toBe("amber");
  });

  it("expirada → amber (recuperável por renovação)", () => {
    expect(connectionTone("expired", [])).toBe("amber");
  });

  it("revogada → red", () => {
    expect(connectionTone("revoked", [])).toBe("red");
  });

  it("por ligar → grey", () => {
    expect(connectionTone("pending", ["drive.read"])).toBe("grey");
  });
});

describe("connectionAction", () => {
  it("ligada e pronta → revogar", () => {
    const ready = computeReady("connected", []);
    expect(connectionAction("connected", ready)).toBe("revoke");
  });

  it("ligada mas incompleta (faltam scopes) → ligar (completar consentimento)", () => {
    const ready = computeReady("connected", ["gmail.send"]);
    expect(connectionAction("connected", ready)).toBe("connect");
  });

  it("expirada → renovar", () => {
    expect(connectionAction("expired", false)).toBe("renew");
  });

  it("revogada → religar", () => {
    expect(connectionAction("revoked", false)).toBe("reconnect");
  });

  it("por ligar → ligar", () => {
    expect(connectionAction("pending", false)).toBe("connect");
  });
});
