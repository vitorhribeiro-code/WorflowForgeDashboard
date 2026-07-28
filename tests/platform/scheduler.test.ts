import { describe, it, expect, vi } from "vitest";
import { createScheduler } from "@/platform/scheduler/scheduler";
import { DomainError } from "@/lib/errors";
import type { ScheduledAssignment } from "@/modules/assignments/domain/schedule";

const NOW = () => new Date("2026-07-28T12:02:00Z");

function scheduler(opts: {
  items: ScheduledAssignment[];
  enqueue: (cmd: { assignmentId: string; windowKey: string }) => Promise<void>;
  lookbackMinutes?: number;
}) {
  return createScheduler({
    listScheduled: async () => opts.items,
    enqueue: opts.enqueue,
    now: NOW,
    lookbackMinutes: opts.lookbackMinutes ?? 3, // janela [12:00, 12:02]
  });
}

describe("scheduler.tick", () => {
  it("enfileira um Run por minuto devido na janela de catch-up", async () => {
    const enqueue = vi.fn(async () => {});
    const s = scheduler({ items: [{ assignmentId: "a1", schedule: "* * * * *" }], enqueue });

    const r = await s.tick();

    expect(r.considered).toBe(1);
    expect(r.due).toBe(3); // 12:00, 12:01, 12:02
    expect(r.enqueued).toBe(3);
    expect(r.skipped).toBe(0);
    expect(r.errors).toEqual([]);
    expect(r.window).toEqual({ from: "2026-07-28T12:00", to: "2026-07-28T12:02" });
    expect(enqueue).toHaveBeenCalledTimes(3);
    expect(enqueue).toHaveBeenCalledWith({ assignmentId: "a1", windowKey: "2026-07-28T12:00" });
  });

  it("não enfileira quando nada é devido", async () => {
    const enqueue = vi.fn(async () => {});
    const s = scheduler({ items: [{ assignmentId: "a1", schedule: "0 3 * * *" }], enqueue });
    const r = await s.tick();
    expect(r.due).toBe(0);
    expect(r.enqueued).toBe(0);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("not_ready/conflict contam como ignorados, não erros", async () => {
    const enqueue = vi.fn(async ({ windowKey }: { windowKey: string }) => {
      if (windowKey.endsWith("12:00")) throw new DomainError("not_ready", "sem conexão", 409);
      if (windowKey.endsWith("12:01")) throw new DomainError("conflict", "desativada", 409);
      // 12:02 passa
    });
    const s = scheduler({ items: [{ assignmentId: "a1", schedule: "* * * * *" }], enqueue });
    const r = await s.tick();
    expect(r.skipped).toBe(2);
    expect(r.enqueued).toBe(1);
    expect(r.errors).toEqual([]);
  });

  it("um erro inesperado é registado e NÃO aborta o tick", async () => {
    const enqueue = vi.fn(async ({ windowKey }: { windowKey: string }) => {
      if (windowKey.endsWith("12:01")) throw new Error("BD em baixo");
    });
    const s = scheduler({ items: [{ assignmentId: "a1", schedule: "* * * * *" }], enqueue });
    const r = await s.tick();
    expect(r.enqueued).toBe(2); // 12:00 e 12:02
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({ assignmentId: "a1", windowKey: "2026-07-28T12:01" });
    expect(enqueue).toHaveBeenCalledTimes(3); // não parou no erro
  });

  it("lookback é limitado a 1..60", async () => {
    const enqueue = vi.fn(async () => {});
    // lookback 1000 → cap 60 min de catch-up. Com '* * * * *' → 60 dues.
    const s = scheduler({
      items: [{ assignmentId: "a1", schedule: "* * * * *" }],
      enqueue,
      lookbackMinutes: 1000,
    });
    const r = await s.tick();
    expect(r.due).toBe(60);
  });
});
