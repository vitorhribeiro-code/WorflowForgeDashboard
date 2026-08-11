import { describe, it, expect, beforeEach } from "vitest";
import { randomBytes } from "node:crypto";
import { createConnectionsService } from "@/modules/connections/service/connections.service";
import { createCipher, credsCodec } from "@/modules/connections/service/crypto";
import { createStateSigner } from "@/modules/connections/service/oauth.provider";
import type { OAuthCredentials } from "@/modules/connections/domain/connection.types";
import type { SessionContext } from "@/lib/session";
import { DomainError } from "@/lib/errors";
import { FakeAudit, FakeProvider, FakeRegistry, FakeRepo } from "../fakes/fakes";

const WORKER: SessionContext = { userId: "w1", orgId: "o1", role: "worker" };
const ADMIN: SessionContext = { userId: "a1", orgId: "o1", role: "super_admin" };

const cipher = createCipher(randomBytes(32).toString("base64"));
const state = createStateSigner("test-secret");
const redirectUri = "https://app.test/api/connections/callback";

function setup() {
  const repo = new FakeRepo();
  const provider = new FakeProvider();
  const audit = new FakeAudit();
  const providers = new FakeRegistry({ google: provider });

  repo.tools.set("t-google", {
    id: "t-google",
    key: "google",
    name: "Google",
    authType: "oauth",
    availableScopes: ["drive.read", "drive.write", "gmail.send"],
  });
  repo.tools.set("t-none", {
    id: "t-none",
    key: "none-tool",
    name: "Sem auth",
    authType: "none",
    availableScopes: [],
  });

  const service = createConnectionsService({
    repo,
    providers,
    cipher,
    state,
    audit,
    redirectUri,
    now: () => new Date("2026-07-22T00:00:00Z"),
  });

  return { repo, provider, audit, service };
}

describe("startConnection", () => {
  it("devolve URL de consentimento e regista auditoria", async () => {
    const { repo, service, audit } = setup();
    repo.required.set("w1:t-google", ["drive.read", "drive.write"]);

    const { authorizationUrl } = await service.startConnection(WORKER, "t-google");
    expect(authorizationUrl).toContain("state=");
    expect(authorizationUrl).toContain("drive.read");
    expect(audit.events.at(-1)?.action).toBe("connection.oauth_started");
  });

  it("recusa ferramentas que não são OAuth", async () => {
    const { service } = setup();
    await expect(service.startConnection(WORKER, "t-none")).rejects.toMatchObject({
      code: "tool_not_oauth",
    });
  });

  it("recusa se nenhuma tarefa exige a ferramenta", async () => {
    const { service } = setup();
    await expect(service.startConnection(WORKER, "t-google")).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("recusa scopes fora dos declarados pela Tool", async () => {
    const { repo, service } = setup();
    repo.required.set("w1:t-google", ["drive.read", "scope.inexistente"]);
    await expect(service.startConnection(WORKER, "t-google")).rejects.toMatchObject({
      code: "invalid_scopes",
    });
  });

  it("bloqueia o admin (só o worker gere as suas conexões)", async () => {
    const { service } = setup();
    await expect(service.startConnection(ADMIN, "t-google")).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

describe("completeConnection", () => {
  it("guarda a conexão ligada com credenciais cifradas", async () => {
    const { repo, service, audit } = setup();
    repo.required.set("w1:t-google", ["drive.read"]);
    const stateToken = state.sign({ workerId: "w1", toolId: "t-google" });

    const view = await service.completeConnection({ state: stateToken, code: "code" });

    expect(view.status).toBe("connected");
    expect(view.ready).toBe(true);
    const row = await repo.getConnection("w1", "t-google");
    // Nunca guardamos o token em claro.
    expect(row?.credentialsEncrypted).toBeTruthy();
    expect(row?.credentialsEncrypted).not.toContain("at");
    const creds = credsCodec.deserialize<OAuthCredentials>(
      cipher.decrypt(row!.credentialsEncrypted!),
    );
    expect(creds.accessToken).toBe("at");
    expect(audit.events.at(-1)?.action).toBe("connection.linked");
  });

  it("rejeita state adulterado", async () => {
    const { service } = setup();
    await expect(
      service.completeConnection({ state: "lixo.forjado", code: "c" }),
    ).rejects.toBeInstanceOf(DomainError);
  });
});

describe("renewConnection", () => {
  it("faz refresh silencioso quando há refresh token", async () => {
    const { repo, service } = setup();
    const enc = cipher.encrypt(
      credsCodec.serialize({ accessToken: "old", refreshToken: "rt" }),
    );
    await repo.upsertConnection({
      workerId: "w1",
      toolId: "t-google",
      grantedScopes: ["drive.read"],
      credentialsEncrypted: enc,
      status: "expired",
      connectedAt: new Date(),
    });

    const res = await service.renewConnection(WORKER, "t-google");
    expect(res).toEqual({ status: "renewed" });
  });

  it("pede reautorização quando o refresh falha", async () => {
    const { repo, provider, service } = setup();
    provider.refreshShouldThrow = true;
    const enc = cipher.encrypt(
      credsCodec.serialize({ accessToken: "old", refreshToken: "rt" }),
    );
    await repo.upsertConnection({
      workerId: "w1",
      toolId: "t-google",
      grantedScopes: ["drive.read"],
      credentialsEncrypted: enc,
      status: "connected",
      connectedAt: new Date(),
    });

    const res = await service.renewConnection(WORKER, "t-google");
    expect(res.status).toBe("reauth_required");
    const row = await repo.getConnection("w1", "t-google");
    expect(row?.status).toBe("expired");
  });

  it("pede reautorização quando não há refresh token", async () => {
    const { repo, service } = setup();
    const enc = cipher.encrypt(credsCodec.serialize({ accessToken: "only" }));
    await repo.upsertConnection({
      workerId: "w1",
      toolId: "t-google",
      grantedScopes: ["drive.read"],
      credentialsEncrypted: enc,
      status: "connected",
      connectedAt: new Date(),
    });

    const res = await service.renewConnection(WORKER, "t-google");
    expect(res.status).toBe("reauth_required");
  });
});

describe("revokeConnection", () => {
  it("marca revoked, chama o provider e suspende atribuições", async () => {
    const { repo, provider, service, audit } = setup();
    const enc = cipher.encrypt(
      credsCodec.serialize({ accessToken: "at", refreshToken: "rt" }),
    );
    await repo.upsertConnection({
      workerId: "w1",
      toolId: "t-google",
      grantedScopes: ["drive.read"],
      credentialsEncrypted: enc,
      status: "connected",
      connectedAt: new Date(),
    });

    const res = await service.revokeConnection(WORKER, "t-google");

    expect(res.suspendedAssignments).toBe(2);
    expect(provider.revoked).toContain("rt");
    expect((await repo.getConnection("w1", "t-google"))?.status).toBe("revoked");
    expect(repo.suspendCalls).toEqual([{ workerId: "w1", toolId: "t-google" }]);
    expect(audit.events.at(-1)?.action).toBe("connection.revoked");
  });
});

describe("listMyConnections", () => {
  it("deriva prontidão e scopes em falta", async () => {
    const { repo, service } = setup();
    repo.requiredTools.set("w1", [
      {
        tool: {
          id: "t-google",
          key: "google",
          name: "Google",
          authType: "oauth",
          availableScopes: ["drive.read", "drive.write"],
        },
        requiredScopes: ["drive.read", "drive.write"],
      },
    ]);
    await repo.upsertConnection({
      workerId: "w1",
      toolId: "t-google",
      grantedScopes: ["drive.read"], // falta drive.write
      credentialsEncrypted: cipher.encrypt("{}"),
      status: "connected",
      connectedAt: new Date(),
    });

    const [view] = await service.listMyConnections(WORKER);
    expect(view!.ready).toBe(false);
    expect(view!.missingScopes).toEqual(["drive.write"]);
  });
});

describe("listWorkerConnections (leitura admin)", () => {
  function seedWorkerWithConn(repo: FakeRepo) {
    repo.requiredTools.set("w1", [
      {
        tool: {
          id: "t-google",
          key: "google",
          name: "Google",
          authType: "oauth",
          availableScopes: ["drive.read", "drive.write"],
        },
        requiredScopes: ["drive.read", "drive.write"],
      },
    ]);
  }

  it("admin vê o estado das conexões de um worker da sua org (prontidão + scopes)", async () => {
    const { repo, service } = setup();
    repo.membership.add("o1:w1");
    seedWorkerWithConn(repo);
    await repo.upsertConnection({
      workerId: "w1",
      toolId: "t-google",
      grantedScopes: ["drive.read"], // falta drive.write
      credentialsEncrypted: cipher.encrypt("{}"),
      status: "connected",
      connectedAt: new Date("2026-07-01T00:00:00Z"),
    });

    const views = await service.listWorkerConnections(ADMIN, "w1");
    expect(views).toHaveLength(1);
    const v = views[0]!;
    expect(v.toolKey).toBe("google");
    expect(v.ready).toBe(false);
    expect(v.missingScopes).toEqual(["drive.write"]);
    // Nunca expõe credenciais — a projeção é ConnectionView (sem tokens).
    expect(Object.keys(v)).not.toContain("credentialsEncrypted");
  });

  it("bloqueia o worker (não é leitura de worker)", async () => {
    const { repo, service } = setup();
    repo.membership.add("o1:w1");
    await expect(service.listWorkerConnections(WORKER, "w1")).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("nega (not_found) um worker fora da org do admin — isolamento tenant", async () => {
    const { service } = setup();
    // Sem membership → worker não pertence à org da sessão.
    await expect(service.listWorkerConnections(ADMIN, "intruso")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("worker sem ferramentas exigidas devolve lista vazia", async () => {
    const { repo, service } = setup();
    repo.membership.add("o1:w1");
    const views = await service.listWorkerConnections(ADMIN, "w1");
    expect(views).toEqual([]);
  });
});
