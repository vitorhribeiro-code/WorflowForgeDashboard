import { describe, it, expect } from "vitest";
import { createAuthService } from "@/modules/auth/service/auth.service";
import type {
  CredentialStorePort,
  MailerPort,
  ResetTokenStorePort,
  TokenIssuerPort,
  UserDirectoryPort,
} from "@/modules/auth/service/ports";
import type { AuthUser } from "@/modules/auth/domain/types";
import type { ResetRecord } from "@/modules/auth/domain/reset";
import type { SessionContext } from "@/lib/session";
import { FakeAudit } from "../fakes/fakes";

/* --- Fakes locais dos ports do M1 ---------------------------------------- */

class FakeUsers implements UserDirectoryPort {
  map = new Map<string, AuthUser>();
  add(u: AuthUser) {
    this.map.set(u.id, u);
    return u;
  }
  async findByEmail(): Promise<AuthUser | null> {
    return null;
  }
  async findById(id: string): Promise<AuthUser | null> {
    return this.map.get(id) ?? null;
  }
}

class FakeResets implements ResetTokenStorePort {
  rows: Array<{ id: string; userId: string; tokenHash: string; expiresAt: Date; usedAt: Date | null }> =
    [];
  private seq = 0;
  async save(rec: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void> {
    this.rows.push({ id: `r${++this.seq}`, usedAt: null, ...rec });
  }
  async findByHash(tokenHash: string): Promise<ResetRecord | null> {
    const r = this.rows.find((x) => x.tokenHash === tokenHash);
    return r
      ? { id: r.id, userId: r.userId, tokenHash: r.tokenHash, expiresAt: r.expiresAt, usedAt: r.usedAt }
      : null;
  }
  async markUsed(id: string, usedAt: Date): Promise<void> {
    const r = this.rows.find((x) => x.id === id);
    if (r) r.usedAt = usedAt;
  }
}

class FakeCreds implements CredentialStorePort {
  map = new Map<string, string>();
  async getHash(userId: string): Promise<string | null> {
    return this.map.get(userId) ?? null;
  }
  async setHash(userId: string, hash: string): Promise<void> {
    this.map.set(userId, hash);
  }
}

const fakeMailer: MailerPort = { async sendResetLink() {} };
const fakeIssuer: TokenIssuerPort = { issue: () => "session-token" };

const ADMIN: SessionContext = { userId: "a1", orgId: "o1", role: "super_admin" };
const WORKER: SessionContext = { userId: "w9", orgId: "o1", role: "worker" };
const NOW_ISO = "2026-07-26T00:00:00Z";

function setup() {
  const users = new FakeUsers();
  const resets = new FakeResets();
  const credentials = new FakeCreds();
  const audit = new FakeAudit();
  const service = createAuthService({
    users,
    credentials,
    resets,
    tokenIssuer: fakeIssuer,
    mailer: fakeMailer,
    audit,
    now: () => new Date(NOW_ISO),
    inviteTtlMinutes: 7 * 24 * 60, // 7 dias
  });
  return { users, resets, credentials, audit, service };
}

describe("issueSetPasswordToken", () => {
  it("admin gera token para um worker da mesma org e regista auditoria", async () => {
    const { users, resets, audit, service } = setup();
    users.add({ id: "w1", orgId: "o1", role: "worker", suspended: false });

    const { token, expiresAt } = await service.issueSetPasswordToken(ADMIN, "w1");

    expect(token.length).toBeGreaterThan(10);
    expect(resets.rows).toHaveLength(1);
    expect(resets.rows[0]?.userId).toBe("w1");
    // Usa o TTL de convite (7 dias), não o de reset (30 min).
    const days = (expiresAt.getTime() - new Date(NOW_ISO).getTime()) / 86_400_000;
    expect(days).toBeCloseTo(7, 5);
    expect(audit.actions()).toContain("user.set_password_link_issued");
  });

  it("recusa quando quem pede não é admin (403)", async () => {
    const { users, service } = setup();
    users.add({ id: "w1", orgId: "o1", role: "worker", suspended: false });
    await expect(service.issueSetPasswordToken(WORKER, "w1")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("trata um utilizador de outra org como inexistente (404, isolamento tenant)", async () => {
    const { users, service } = setup();
    users.add({ id: "x1", orgId: "OUTRA", role: "worker", suspended: false });
    await expect(service.issueSetPasswordToken(ADMIN, "x1")).rejects.toMatchObject({
      code: "USER_NOT_FOUND",
      status: 404,
    });
  });

  it("404 quando o utilizador não existe", async () => {
    const { service } = setup();
    await expect(service.issueSetPasswordToken(ADMIN, "nao-existe")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("o token emitido define a password (round-trip) e é de uso único", async () => {
    const { users, credentials, service } = setup();
    users.add({ id: "w1", orgId: "o1", role: "worker", suspended: false });

    const { token } = await service.issueSetPasswordToken(ADMIN, "w1");
    await service.resetPassword(token, "segredo-forte");
    expect(credentials.map.get("w1")).toBeTruthy();

    // Reutilizar o mesmo token falha.
    await expect(service.resetPassword(token, "outra-coisa")).rejects.toMatchObject({
      code: "INVALID_RESET_TOKEN",
    });
  });
});
