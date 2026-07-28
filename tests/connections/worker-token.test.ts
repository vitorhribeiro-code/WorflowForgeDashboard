import { describe, it, expect, vi } from "vitest";
import { createWorkerTokenAdapter } from "@/modules/connections/service/worker-token";
import type { ConnectionsRepository, ConnectionRow } from "@/modules/connections/data/connections.repository";
import type { OAuthCredentials } from "@/modules/connections/domain/connection.types";

// Cifra identidade (o teste não valida a cifra em si).
const cipher = { encrypt: (s: string) => s, decrypt: (s: string) => s };

function mkConn(creds: OAuthCredentials): ConnectionRow {
  return {
    id: "c1",
    workerId: "w1",
    toolId: "google-id",
    grantedScopes: ["gmail.readonly"],
    credentialsEncrypted: JSON.stringify(creds),
    status: "connected",
    connectedAt: new Date(),
  };
}

function repoWith(conn: ConnectionRow | null) {
  const upsert = vi.fn(async (i: any) => ({ ...mkConn({ accessToken: "x" }), ...i }));
  const repo = {
    async getConnection() {
      return conn;
    },
    upsertConnection: upsert,
  } as unknown as ConnectionsRepository;
  return { repo, upsert };
}

const NOW = () => new Date("2026-07-28T10:00:00Z");

describe("WorkerTokenPort.getAccessToken", () => {
  it("devolve null quando a tool não resolve", async () => {
    const { repo } = repoWith(null);
    const port = createWorkerTokenAdapter({
      repo,
      cipher,
      providers: { get: () => undefined },
      resolveToolIdByKey: async () => null,
      now: NOW,
    });
    expect(await port.getAccessToken("w1", "google")).toBeNull();
  });

  it("devolve o access token quando ainda válido (sem refresh)", async () => {
    const { repo, upsert } = repoWith(
      mkConn({ accessToken: "valido", refreshToken: "r", expiresAt: new Date("2026-07-28T11:00:00Z") }),
    );
    const port = createWorkerTokenAdapter({
      repo,
      cipher,
      providers: { get: () => undefined },
      resolveToolIdByKey: async () => "google-id",
      now: NOW,
    });
    expect(await port.getAccessToken("w1", "google")).toBe("valido");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("faz refresh e persiste quando o token está a expirar", async () => {
    const { repo, upsert } = repoWith(
      mkConn({ accessToken: "velho", refreshToken: "r1", expiresAt: new Date("2026-07-28T10:00:30Z") }),
    );
    const provider = {
      authorizationUrl: () => "",
      exchangeCode: async () => ({ accessToken: "" }),
      revoke: async () => {},
      refresh: vi.fn(async () => ({ accessToken: "novo", refreshToken: "r1" })),
    };
    const port = createWorkerTokenAdapter({
      repo,
      cipher,
      providers: { get: () => provider },
      resolveToolIdByKey: async () => "google-id",
      now: NOW,
    });
    expect(await port.getAccessToken("w1", "google")).toBe("novo");
    expect(provider.refresh).toHaveBeenCalledWith("r1");
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("devolve null quando não há conexão ligada", async () => {
    const { repo } = repoWith({ ...mkConn({ accessToken: "x" }), status: "revoked" });
    const port = createWorkerTokenAdapter({
      repo,
      cipher,
      providers: { get: () => undefined },
      resolveToolIdByKey: async () => "google-id",
      now: NOW,
    });
    expect(await port.getAccessToken("w1", "google")).toBeNull();
  });
});
