import { describe, it, expect } from "vitest";
import { computeValidityCountdown } from "@/modules/connections/domain/connection.types";

/**
 * Contador de validade (higiene de conexões). Função pura:
 *   min(connectedAt + 90 dias política, connectedAt + expiração dura conhecida)
 * Só o Google (em Testing) tem expiração dura (7 dias) na tabela de referência;
 * Microsoft/Dropbox/desconhecidos caem na política de 90 dias.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-08-06T12:00:00.000Z");
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

describe("computeValidityCountdown", () => {
  it("sem connectedAt → null", () => {
    expect(computeValidityCountdown("google", null, NOW)).toBeNull();
  });

  it("google acabado de ligar → expira em 7 dias, âmbar", () => {
    const v = computeValidityCountdown("google", ago(0), NOW)!;
    expect(v.kind).toBe("expira");
    expect(v.daysLeft).toBe(7);
    expect(v.severity).toBe("warning");
  });

  it("google a 5 dias de uso → faltam 2 dias, vermelho", () => {
    const v = computeValidityCountdown("google", ago(5), NOW)!;
    expect(v.kind).toBe("expira");
    expect(v.daysLeft).toBe(2);
    expect(v.severity).toBe("danger");
  });

  it("google a 6 dias → falta 1 dia, vermelho", () => {
    const v = computeValidityCountdown("google", ago(6), NOW)!;
    expect(v.daysLeft).toBe(1);
    expect(v.severity).toBe("danger");
  });

  it("google a 3 dias → faltam 4 dias, âmbar (≤7)", () => {
    const v = computeValidityCountdown("google", ago(3), NOW)!;
    expect(v.daysLeft).toBe(4);
    expect(v.severity).toBe("warning");
  });

  it("microsoft acabado de ligar → rever em 90 dias, neutro", () => {
    const v = computeValidityCountdown("microsoft", ago(0), NOW)!;
    expect(v.kind).toBe("rever");
    expect(v.daysLeft).toBe(90);
    expect(v.severity).toBe("neutral");
  });

  it("microsoft a 80 dias → faltam 10 dias para rever, âmbar (≤14)", () => {
    const v = computeValidityCountdown("microsoft", ago(80), NOW)!;
    expect(v.kind).toBe("rever");
    expect(v.daysLeft).toBe(10);
    expect(v.severity).toBe("warning");
  });

  it("dropbox → sem expiração dura, cai na política (rever, neutro)", () => {
    const v = computeValidityCountdown("dropbox", ago(0), NOW)!;
    expect(v.kind).toBe("rever");
    expect(v.severity).toBe("neutral");
  });

  it("ferramenta desconhecida → política de 90 dias (rever)", () => {
    const v = computeValidityCountdown("slack", ago(0), NOW)!;
    expect(v.kind).toBe("rever");
    expect(v.daysLeft).toBe(90);
  });

  it("google já expirado (8 dias) → daysLeft ≤ 0, vermelho", () => {
    const v = computeValidityCountdown("google", ago(8), NOW)!;
    expect(v.daysLeft).toBeLessThanOrEqual(0);
    expect(v.severity).toBe("danger");
  });
});
