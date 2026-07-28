import { describe, it, expect } from "vitest";
import { buildCron, parseCron, type Recurrence } from "@/modules/assignments/domain/recurrence";

describe("buildCron", () => {
  it("minutes", () => {
    expect(buildCron({ freq: "minutes", interval: 5 })).toBe("*/5 * * * *");
  });
  it("daily", () => {
    expect(buildCron({ freq: "daily", hour: 9, minute: 0 })).toBe("0 9 * * *");
  });
  it("weekly ordena e deduplica os dias", () => {
    expect(buildCron({ freq: "weekly", hour: 8, minute: 30, days: [5, 1, 3, 1] })).toBe(
      "30 8 * * 1,3,5",
    );
  });
  it("weekly sem dias cai em '*'", () => {
    expect(buildCron({ freq: "weekly", hour: 8, minute: 0, days: [] })).toBe("0 8 * * *");
  });
  it("monthly", () => {
    expect(buildCron({ freq: "monthly", hour: 6, minute: 15, dom: 1 })).toBe("15 6 1 * *");
  });
  it("advanced passa o cru tal e qual", () => {
    expect(buildCron({ freq: "advanced", expr: "0 */2 9-17 * *" })).toBe("0 */2 9-17 * *");
  });
  it("clampa valores fora dos limites", () => {
    expect(buildCron({ freq: "daily", hour: 99, minute: -3 })).toBe("0 23 * * *");
    expect(buildCron({ freq: "minutes", interval: 0 })).toBe("*/1 * * * *");
  });
});

describe("parseCron", () => {
  it("reconhece minutes", () => {
    expect(parseCron("*/5 * * * *")).toEqual({ freq: "minutes", interval: 5 });
  });
  it("reconhece daily", () => {
    expect(parseCron("0 9 * * *")).toEqual({ freq: "daily", hour: 9, minute: 0 });
  });
  it("reconhece weekly com lista de dias", () => {
    expect(parseCron("30 8 * * 1,2,3,4,5")).toEqual({
      freq: "weekly",
      hour: 8,
      minute: 30,
      days: [1, 2, 3, 4, 5],
    });
  });
  it("reconhece monthly", () => {
    expect(parseCron("15 6 1 * *")).toEqual({ freq: "monthly", hour: 6, minute: 15, dom: 1 });
  });

  it("cai em advanced para padrões que não cabem (sem falsificar)", () => {
    for (const expr of ["0 */2 9-17 * *", "0 * * * *", "0 9 1 6 *", "0 9-17 * * *"]) {
      expect(parseCron(expr)).toEqual({ freq: "advanced", expr });
    }
  });

  it("cron inválido → advanced com o cru (não perde o que o utilizador escreveu)", () => {
    expect(parseCron("70 9 * * *")).toEqual({ freq: "advanced", expr: "70 9 * * *" });
    expect(parseCron("nonsense")).toEqual({ freq: "advanced", expr: "nonsense" });
  });

  it("dias repetidos no cron → advanced (não é um input do construtor)", () => {
    expect(parseCron("0 9 * * 1,1")).toEqual({ freq: "advanced", expr: "0 9 * * 1,1" });
  });
});

describe("round-trip build∘parse", () => {
  const cases: Recurrence[] = [
    { freq: "minutes", interval: 15 },
    { freq: "daily", hour: 7, minute: 45 },
    { freq: "weekly", hour: 18, minute: 0, days: [1, 3, 5] },
    { freq: "monthly", hour: 0, minute: 0, dom: 28 },
  ];
  it("parse(build(r)) devolve o mesmo modelo", () => {
    for (const r of cases) {
      expect(parseCron(buildCron(r))).toEqual(r);
    }
  });
});
