import { describe, expect, it } from "vitest";
import {
  assertPeriod,
  currentPeriod,
  isValidPeriod,
  periodBounds,
} from "@/modules/archives/domain/period";

describe("period", () => {
  it("valida o formato YYYY-MM", () => {
    expect(isValidPeriod("2026-07")).toBe(true);
    expect(isValidPeriod("2026-13")).toBe(false);
    expect(isValidPeriod("2026-00")).toBe(false);
    expect(isValidPeriod("26-07")).toBe(false);
    expect(isValidPeriod("2026/07")).toBe(false);
  });

  it("assertPeriod lança INVALID_PERIOD", () => {
    expect(() => assertPeriod("2026-99")).toThrowError(/Período inválido/);
  });

  it("periodBounds devolve [1º dia, 1º do mês seguinte)", () => {
    const { start, end } = periodBounds("2026-07");
    expect(start.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("periodBounds trata a passagem de ano (dezembro)", () => {
    const { start, end } = periodBounds("2026-12");
    expect(start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("currentPeriod formata em UTC", () => {
    expect(currentPeriod(new Date("2026-07-23T10:00:00Z"))).toBe("2026-07");
    expect(currentPeriod(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
  });
});
