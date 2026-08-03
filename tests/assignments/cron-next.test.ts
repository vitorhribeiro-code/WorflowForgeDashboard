import { describe, it, expect } from "vitest";
import { nextRunAfter } from "@/modules/assignments/domain/cron";

describe("nextRunAfter", () => {
  it("diária às 08:00 UTC → a próxima 08:00 depois do instante", () => {
    const at = nextRunAfter("0 8 * * *", new Date("2026-08-03T07:30:00Z"));
    expect(at?.toISOString()).toBe("2026-08-03T08:00:00.000Z");
  });

  it("se já passou a hora hoje, salta para o dia seguinte", () => {
    const at = nextRunAfter("0 8 * * *", new Date("2026-08-03T09:00:00Z"));
    expect(at?.toISOString()).toBe("2026-08-04T08:00:00.000Z");
  });

  it("é estritamente APÓS `from` (não devolve o próprio minuto)", () => {
    const at = nextRunAfter("0 8 * * *", new Date("2026-08-03T08:00:00Z"));
    expect(at?.toISOString()).toBe("2026-08-04T08:00:00.000Z");
  });

  it("a cada 15 min → o próximo múltiplo", () => {
    const at = nextRunAfter("*/15 * * * *", new Date("2026-08-03T10:07:00Z"));
    expect(at?.toISOString()).toBe("2026-08-03T10:15:00.000Z");
  });

  it("semanal (segundas às 09:00) → a próxima segunda", () => {
    // 2026-08-03 é uma segunda-feira; a partir das 10:00 salta para a seguinte.
    const at = nextRunAfter("0 9 * * 1", new Date("2026-08-03T10:00:00Z"));
    expect(at?.toISOString()).toBe("2026-08-10T09:00:00.000Z");
  });

  it("nada casa no horizonte pedido → null", () => {
    // Dia 15 de cada mês, a partir do dia 16, com horizonte de só 3 dias.
    const at = nextRunAfter("0 8 15 * *", new Date("2026-08-16T00:00:00Z"), 3 * 24 * 60);
    expect(at).toBeNull();
  });

  it("cron inválido → null", () => {
    expect(nextRunAfter("isto não é cron", new Date("2026-08-03T00:00:00Z"))).toBeNull();
  });
});
