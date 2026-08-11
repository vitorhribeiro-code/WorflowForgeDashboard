import { describe, it, expect } from "vitest";
import { bossOptions } from "@/platform/queue/run-queue";

const URL = "postgres://u:p@db.internal:5432/wff";

describe("bossOptions — política de ligações do pg-boss", () => {
  it("web: teto baixo e supervise/schedule OFF (só enfileira)", () => {
    const o = bossOptions(URL, "web");
    expect(o.connectionString).toBe(URL);
    expect(o.max).toBe(2);
    expect(o.supervise).toBe(false);
    expect(o.schedule).toBe(false);
    expect(o.application_name).toBe("wff-web-boss");
  });

  it("worker: teto modesto; supervisão/agendamento por defeito (não desligados)", () => {
    const o = bossOptions(URL, "worker");
    expect(o.connectionString).toBe(URL);
    expect(o.max).toBe(5);
    // O worker é que supervisiona/agenda — não forçamos esses flags a false.
    expect(o.supervise).toBeUndefined();
    expect(o.schedule).toBeUndefined();
    expect(o.application_name).toBe("wff-worker-boss");
  });

  it("os dois papéis capam o pool (nunca ilimitado / default do pg-boss)", () => {
    for (const role of ["web", "worker"] as const) {
      const { max } = bossOptions(URL, role);
      expect(typeof max).toBe("number");
      expect(max).toBeGreaterThan(0);
      expect(max).toBeLessThanOrEqual(5);
    }
  });

  it("não define SSL aqui (resolve-se pela connection string)", () => {
    expect(bossOptions(URL, "web").ssl).toBeUndefined();
    expect(bossOptions(URL, "worker").ssl).toBeUndefined();
  });
});
