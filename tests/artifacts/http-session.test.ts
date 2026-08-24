import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { json, withSession } from "@/modules/artifacts/api/http";
import { signToken } from "@/lib/auth-token";
import type { SessionContext } from "@/lib/session";

// Regressão gémea do M8/M9: o withSession do artifacts também chamava
// getSession() sem o request. Trava-se aqui o mesmo threading.

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
  const token = signToken(SECRET, { sub: "w1", org: "o1", role: "worker", exp });
  return new Request("http://x/api/runs/r1/artifacts", {
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("artifacts withSession", () => {
  it("passa a sessão derivada do request ao handler", async () => {
    let seen: SessionContext | undefined;
    const res = await withSession(reqWithSession(), async (session) => {
      seen = session;
      return json({ ok: true });
    });
    expect(res.status).toBe(200);
    expect(seen).toEqual({ userId: "w1", orgId: "o1", role: "worker" });
  });

  it("sem token no request devolve 401 e não corre o handler", async () => {
    let ran = false;
    const res = await withSession(new Request("http://x/api/runs/r1/artifacts"), async () => {
      ran = true;
      return json({ ok: true });
    });
    expect(res.status).toBe(401);
    expect(ran).toBe(false);
  });
});
