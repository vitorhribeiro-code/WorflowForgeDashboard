// Período no formato "YYYY-MM". Tudo puro e em UTC.
import { DomainError } from "../../../lib/errors";

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidPeriod(p: string): boolean {
  return PERIOD_RE.test(p);
}

export function assertPeriod(p: string): void {
  if (!isValidPeriod(p)) {
    throw new DomainError("INVALID_PERIOD", "Período inválido (esperado YYYY-MM)", { period: p });
  }
}

/** Limites [start, end) do mês em UTC. end é exclusivo (1º dia do mês seguinte). */
export function periodBounds(p: string): { start: Date; end: Date } {
  assertPeriod(p);
  const [y = 0, m = 0] = p.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1)),
    end: new Date(Date.UTC(y, m, 1)),
  };
}

export function currentPeriod(now: Date): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
