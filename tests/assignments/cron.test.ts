import { describe, it, expect } from "vitest";
import { cronMatches, windowKeyOf, isValidCron } from "@/modules/assignments/domain/cron";

// Datas de referência (UTC). Hoje do projeto = ter 28 jul 2026.
const d = (iso: string) => new Date(iso);

describe("cronMatches", () => {
  it("'* * * * *' casa qualquer minuto", () => {
    expect(cronMatches("* * * * *", d("2026-07-28T18:06:00Z"))).toBe(true);
    expect(cronMatches("* * * * *", d("2026-01-01T00:00:00Z"))).toBe(true);
  });

  it("minuto/hora exatos", () => {
    expect(cronMatches("30 9 * * *", d("2026-07-28T09:30:00Z"))).toBe(true);
    expect(cronMatches("30 9 * * *", d("2026-07-28T09:31:00Z"))).toBe(false);
    expect(cronMatches("30 9 * * *", d("2026-07-28T10:30:00Z"))).toBe(false);
  });

  it("steps '*/15' casa 0/15/30/45", () => {
    for (const m of [0, 15, 30, 45]) {
      expect(cronMatches("*/15 * * * *", d(`2026-07-28T12:${String(m).padStart(2, "0")}:00Z`))).toBe(true);
    }
    expect(cronMatches("*/15 * * * *", d("2026-07-28T12:10:00Z"))).toBe(false);
  });

  it("listas e ranges", () => {
    expect(cronMatches("0 8,12,18 * * *", d("2026-07-28T12:00:00Z"))).toBe(true);
    expect(cronMatches("0 9-17 * * *", d("2026-07-28T13:00:00Z"))).toBe(true);
    expect(cronMatches("0 9-17 * * *", d("2026-07-28T18:00:00Z"))).toBe(false);
  });

  it("dia-da-semana (2026-07-27 é segunda-feira, dow=1)", () => {
    expect(cronMatches("0 0 * * 1", d("2026-07-27T00:00:00Z"))).toBe(true);
    expect(cronMatches("0 0 * * 1", d("2026-07-28T00:00:00Z"))).toBe(false); // terça
  });

  it("semântica Vixie: DOM e DOW ambos restritos casam por OU", () => {
    // "0 0 13 * 5" = dia 13 OU sexta-feira. 2026-07-13 é dia 13 (segunda);
    // 2026-07-31 é sexta (dia 31); 2026-07-14 não é nenhum.
    expect(cronMatches("0 0 13 * 5", d("2026-07-13T00:00:00Z"))).toBe(true); // dia 13
    expect(cronMatches("0 0 13 * 5", d("2026-07-31T00:00:00Z"))).toBe(true); // sexta
    expect(cronMatches("0 0 13 * 5", d("2026-07-14T00:00:00Z"))).toBe(false); // nenhum
  });

  it("mês", () => {
    expect(cronMatches("0 0 1 1 *", d("2026-01-01T00:00:00Z"))).toBe(true);
    expect(cronMatches("0 0 1 1 *", d("2026-02-01T00:00:00Z"))).toBe(false);
  });

  it("expressão inválida (≠5 campos) não casa", () => {
    expect(cronMatches("* * * *", d("2026-07-28T00:00:00Z"))).toBe(false);
  });
});

describe("windowKeyOf", () => {
  it("trunca ao minuto em UTC", () => {
    expect(windowKeyOf(d("2026-07-28T18:06:42.123Z"))).toBe("2026-07-28T18:06");
    expect(windowKeyOf(d("2026-01-01T00:00:00Z"))).toBe("2026-01-01T00:00");
  });
});

describe("isValidCron (regressão — inalterado)", () => {
  it("aceita válidos e rejeita inválidos", () => {
    expect(isValidCron("*/5 * * * *")).toBe(true);
    expect(isValidCron("0 9-17 * * 1-5")).toBe(true);
    expect(isValidCron("60 * * * *")).toBe(false); // minuto fora do intervalo
    expect(isValidCron("* * *")).toBe(false);
  });
});
