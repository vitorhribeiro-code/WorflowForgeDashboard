import { describe, it, expect, vi } from "vitest";
import { createGmailInputProvider } from "@/platform/acquisition/gmail-input-provider";
import type { WorkerTokenPort } from "@/modules/connections";

const NOW = () => new Date("2026-07-15T00:00:00Z");

function tokenPort(token: string | null): WorkerTokenPort {
  return { getAccessToken: async () => token };
}

describe("createGmailInputProvider.resolve", () => {
  it("pass-through para runtimes que não são email.digest", async () => {
    const fetchEmails = vi.fn();
    const p = createGmailInputProvider({ tokens: tokenPort("tok"), fetchRecentEmails: fetchEmails, now: NOW });
    const base = { period: "2026-07", sections: [] };
    expect(await p.resolve({ runtime: "report.monthly", workerId: "w1", config: null, base })).toBe(base);
    expect(fetchEmails).not.toHaveBeenCalled();
  });

  it("respeita emails do input (override manual) e não chama o Gmail", async () => {
    const fetchEmails = vi.fn();
    const p = createGmailInputProvider({ tokens: tokenPort("tok"), fetchRecentEmails: fetchEmails, now: NOW });
    const base = { emails: [{ from: "a@x.pt" }] };
    const out = await p.resolve({ runtime: "email.digest", workerId: "w1", config: null, base });
    expect(out.emails).toBe(base.emails);
    expect(out.period).toBe("2026-07");
    expect(fetchEmails).not.toHaveBeenCalled();
  });

  it("busca ao Gmail quando não há emails no input", async () => {
    const emails = [{ from: "cliente@x.pt", subject: "Fatura" }];
    const fetchEmails = vi.fn(async () => emails);
    const p = createGmailInputProvider({ tokens: tokenPort("tok"), fetchRecentEmails: fetchEmails, now: NOW });
    const out = await p.resolve({ runtime: "email.digest", workerId: "w1", config: { lookbackDays: 3 }, base: {} });
    expect(out.emails).toBe(emails);
    expect(out.period).toBe("2026-07");
    expect(fetchEmails).toHaveBeenCalledWith("tok", { lookbackDays: 3 });
  });

  it("lança (permanente) quando o worker não tem conexão Google", async () => {
    const p = createGmailInputProvider({ tokens: tokenPort(null), fetchRecentEmails: vi.fn(), now: NOW });
    await expect(
      p.resolve({ runtime: "email.digest", workerId: "w1", config: null, base: {} }),
    ).rejects.toThrow(/Google/);
  });
});
