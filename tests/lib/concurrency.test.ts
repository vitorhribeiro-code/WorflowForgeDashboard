import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "@/lib/concurrency";

describe("mapWithConcurrency", () => {
  it("preserva a ordem dos resultados", async () => {
    const out = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => n * 10);
    expect(out).toEqual([10, 20, 30, 40, 50]);
  });

  it("nunca excede o limite de tarefas em curso, mas corre em paralelo", async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);
    await mapWithConcurrency(items, 4, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    });
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1); // prova que houve paralelismo real
  });

  it("processa todos os itens", async () => {
    const seen: number[] = [];
    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      seen.push(n);
    });
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("lida com lista vazia sem chamar fn", async () => {
    let called = false;
    const out = await mapWithConcurrency([], 4, async (x) => {
      called = true;
      return x;
    });
    expect(out).toEqual([]);
    expect(called).toBe(false);
  });

  it("limite maior que a lista não rebenta (clampa)", async () => {
    const out = await mapWithConcurrency([1, 2], 100, async (n) => n + 1);
    expect(out).toEqual([2, 3]);
  });

  it("propaga a primeira rejeição", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }),
    ).rejects.toThrow("boom");
  });
});
