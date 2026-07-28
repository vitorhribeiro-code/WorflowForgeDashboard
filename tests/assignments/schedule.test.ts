import { describe, it, expect } from "vitest";
import { computeDue, type ScheduledAssignment } from "@/modules/assignments/domain/schedule";

const d = (iso: string) => new Date(iso);

describe("computeDue", () => {
  it("emite um par por minuto que casa, com windowKey ao minuto", () => {
    const items: ScheduledAssignment[] = [{ assignmentId: "a1", schedule: "* * * * *" }];
    // janela [18:04, 18:06] → 3 minutos → 3 dues, windowKeys distintas.
    const out = computeDue(items, d("2026-07-28T18:04:00Z"), d("2026-07-28T18:06:00Z"));
    expect(out).toEqual([
      { assignmentId: "a1", windowKey: "2026-07-28T18:04" },
      { assignmentId: "a1", windowKey: "2026-07-28T18:05" },
      { assignmentId: "a1", windowKey: "2026-07-28T18:06" },
    ]);
  });

  it("só o minuto que satisfaz o cron produz due", () => {
    const items: ScheduledAssignment[] = [{ assignmentId: "a1", schedule: "*/5 * * * *" }];
    // [18:02, 18:06] → só 18:05 casa */5.
    const out = computeDue(items, d("2026-07-28T18:02:00Z"), d("2026-07-28T18:06:00Z"));
    expect(out).toEqual([{ assignmentId: "a1", windowKey: "2026-07-28T18:05" }]);
  });

  it("nenhum minuto casa → vazio", () => {
    const items: ScheduledAssignment[] = [{ assignmentId: "a1", schedule: "30 3 * * *" }];
    const out = computeDue(items, d("2026-07-28T18:00:00Z"), d("2026-07-28T18:05:00Z"));
    expect(out).toEqual([]);
  });

  it("múltiplas atribuições no mesmo minuto", () => {
    const items: ScheduledAssignment[] = [
      { assignmentId: "a1", schedule: "0 * * * *" },
      { assignmentId: "a2", schedule: "* * * * *" },
    ];
    const out = computeDue(items, d("2026-07-28T12:00:00Z"), d("2026-07-28T12:00:00Z"));
    expect(out).toEqual([
      { assignmentId: "a1", windowKey: "2026-07-28T12:00" },
      { assignmentId: "a2", windowKey: "2026-07-28T12:00" },
    ]);
  });

  it("trunca ao minuto (segundos/millis ignorados)", () => {
    const items: ScheduledAssignment[] = [{ assignmentId: "a1", schedule: "* * * * *" }];
    const out = computeDue(items, d("2026-07-28T12:00:59.900Z"), d("2026-07-28T12:00:12.000Z"));
    expect(out).toEqual([{ assignmentId: "a1", windowKey: "2026-07-28T12:00" }]);
  });

  it("from depois de to → vazio", () => {
    const items: ScheduledAssignment[] = [{ assignmentId: "a1", schedule: "* * * * *" }];
    expect(computeDue(items, d("2026-07-28T12:05:00Z"), d("2026-07-28T12:00:00Z"))).toEqual([]);
  });

  it("limita a janela de catch-up (maxWindowMinutes)", () => {
    const items: ScheduledAssignment[] = [{ assignmentId: "a1", schedule: "* * * * *" }];
    // pediu 100 min mas cap=2 → só os 2 últimos minutos (12:04, 12:05).
    const out = computeDue(items, d("2026-07-28T10:00:00Z"), d("2026-07-28T12:05:00Z"), 2);
    expect(out.map((x) => x.windowKey)).toEqual(["2026-07-28T12:04", "2026-07-28T12:05"]);
  });
});
