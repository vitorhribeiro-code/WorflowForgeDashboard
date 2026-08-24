import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { json, withSession } from "@/modules/archives/api/http";
import { signToken } from "@/lib/auth-token";
import type { SessionContext } from "@/lib/session";

// Regressão: o withSession do M9 chamava getSession() SEM o request, por isso
// o token (cookie/Authorization) nunca era lido e todas as rotas davam 401.
// Estes testes travam o threading do req -> getSession.

const SECRET = "test-secret-with-at-least-32-characters!!";
const prev = process.env.AUTH_SECRET;

beforeAll(() => {
  process.env.AUTH_SECRET = SECRET;
});
afterAll(() => {
  process.env.AUTH_SECRET = prev;
});

function reqWithSession(): Request {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = signToken(SECRET, { sub: "u1", org: "o1", role: "worker", exp });
  return new Request("http://x/api/archives", {
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("archives withSession", () => {
  it("passa a sessão derivada do request ao handler", async () => {
    let seen: SessionContext | undefined;
    const res = await withSession(reqWithSession(), async (session) => {
      seen = session;
      return json({ ok: true });
    });
    expect(res.status).toBe(200);
    expect(seen).toEqual({ userId: "u1", orgId: "o1", role: "worker" });
  });

  it("sem token no request devolve 401 e não corre o handler", async () => {
    let ran = false;
    const res = await withSession(new Request("http://x/api/archives"), async () => {
      ran = true;
      return json({ ok: true });
    });
    expect(res.status).toBe(401);
    expect(ran).toBe(false);
  });
});
