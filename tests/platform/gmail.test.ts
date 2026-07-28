import { describe, it, expect, vi } from "vitest";
import { createGmailAcquisition } from "@/platform/acquisition/gmail";

function jsonRes(data: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    json: async () => data,
  } as unknown as Response;
}

describe("createGmailAcquisition.fetchRecentEmails", () => {
  it("lista mensagens e mapeia headers + snippet + receivedAt", async () => {
    const fetchFake = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/messages/")) {
        const id = u.split("/messages/")[1]!.split("?")[0];
        return jsonRes({
          internalDate: "1753747200000",
          snippet: `resumo ${id}`,
          payload: {
            headers: [
              { name: "From", value: `cliente${id}@x.pt` },
              { name: "Subject", value: `Fatura ${id}` },
              { name: "Date", value: "Mon, 28 Jul 2026 10:00:00 +0000" },
            ],
          },
        });
      }
      return jsonRes({ messages: [{ id: "1" }, { id: "2" }] });
    });

    const gmail = createGmailAcquisition(fetchFake as unknown as typeof fetch);
    const emails = await gmail.fetchRecentEmails("tok", { lookbackDays: 7 });

    expect(emails).toHaveLength(2);
    expect(emails[0]).toMatchObject({ from: "cliente1@x.pt", subject: "Fatura 1", snippet: "resumo 1" });
    expect(emails[0]!.receivedAt).toBe(new Date(1753747200000).toISOString());
    // A query deve incluir newer_than:7d.
    const listCall = fetchFake.mock.calls.find((c) => !String(c[0]).includes("/messages/"));
    expect(String(listCall![0])).toContain("newer_than%3A7d"); // "newer_than:7d" url-encoded
  });

  it("ignora mensagens sem remetente (From)", async () => {
    const fetchFake = async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/messages/")) {
        return jsonRes({ payload: { headers: [{ name: "Subject", value: "sem from" }] } });
      }
      return jsonRes({ messages: [{ id: "1" }] });
    };
    const gmail = createGmailAcquisition(fetchFake as unknown as typeof fetch);
    expect(await gmail.fetchRecentEmails("tok")).toHaveLength(0);
  });

  it("erro 500 na listagem propaga com status (transitório via classify)", async () => {
    const fetchFake = async () => jsonRes({}, 500);
    const gmail = createGmailAcquisition(fetchFake as unknown as typeof fetch);
    await expect(gmail.fetchRecentEmails("tok")).rejects.toMatchObject({ status: 500 });
  });

  it("falha de rede propaga como transitória", async () => {
    const fetchFake = async () => {
      throw new Error("network down");
    };
    const gmail = createGmailAcquisition(fetchFake as unknown as typeof fetch);
    await expect(gmail.fetchRecentEmails("tok")).rejects.toMatchObject({ transient: true });
  });
});
