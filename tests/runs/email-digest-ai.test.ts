import { describe, expect, it } from "vitest";
import {
  createEmailDigestHandler,
  renderEmailDigestMarkdown,
} from "@/modules/runs/service/handlers/builtin";

/**
 * §5.2 fase 3 — o email.digest continua puro mas passa a transportar `resumo`
 * (quando presente no input) para o output e o entregável. Aditivo: sem resumo,
 * o output/render é idêntico ao anterior (coberto pelos testes existentes).
 */

function ctx(input: Record<string, unknown>) {
  return { input, config: null, signal: new AbortController().signal, emit: () => {} };
}

describe("email.digest com resumos", () => {
  it("recolhe resumos por remetente e carrega o meta ai no output", async () => {
    const h = createEmailDigestHandler(() => new Date("2026-08-01T00:00:00.000Z"));
    const out = await h.execute!(
      ctx({
        period: "2026-08",
        aiSummary: { used: true, provider: "mistral", model: "mistral-small", count: 2 },
        emails: [
          { from: "a@x.pt", subject: "Fatura", resumo: "Fatura de agosto por pagar" },
          { from: "a@x.pt", subject: "Recibo", resumo: "Recibo do mês anterior" },
          { from: "b@x.pt", subject: "Oi" }, // sem resumo
        ],
      }),
    );
    const senders = out.senders as Array<Record<string, unknown>>;
    const a = senders.find((s) => s.sender === "a@x.pt")!;
    const b = senders.find((s) => s.sender === "b@x.pt")!;
    expect(a.resumos).toEqual(["Fatura de agosto por pagar", "Recibo do mês anterior"]);
    // Remetente sem resumos não ganha o campo (aditivo).
    expect(b.resumos).toBeUndefined();
    expect(out.ai).toMatchObject({ used: true, provider: "mistral" });
  });

  it("sem resumos, o output não tem resumos nem ai (idêntico ao anterior)", async () => {
    const h = createEmailDigestHandler(() => new Date("2026-08-01T00:00:00.000Z"));
    const out = await h.execute!(
      ctx({ period: "2026-08", emails: [{ from: "a@x.pt", subject: "S1" }] }),
    );
    const senders = out.senders as Array<Record<string, unknown>>;
    expect(senders[0]!.resumos).toBeUndefined();
    expect(out.ai).toBeUndefined();
  });

  it("o renderer mostra os resumos (um por linha) e o rodapé do provider", () => {
    const md = new TextDecoder().decode(
      renderEmailDigestMarkdown({
        period: "2026-08",
        total: 2,
        senders: [
          {
            sender: "Contas <contas@x.pt>",
            count: 3,
            subjects: ["Fatura", "Recibo"],
            resumos: ["Fatura de agosto por pagar", "Recibo do mês anterior"],
          },
        ],
        ai: { used: true, provider: "mistral", model: "mistral-small" },
        generatedAt: "2026-08-01T00:00:00.000Z",
      }).bytes,
    );
    expect(md).toContain("- Fatura de agosto por pagar");
    expect(md).toContain("- Recibo do mês anterior");
    expect(md).toContain("- …"); // count(3) > resumos(2)
    expect(md).toContain("_Resumos por IA — mistral · mistral-small._");
  });

  it("sem resumos, o renderer usa os assuntos como antes (sem rodapé de IA)", () => {
    const md = new TextDecoder().decode(
      renderEmailDigestMarkdown({
        period: "2026-08",
        total: 1,
        senders: [{ sender: "a@x.pt", count: 1, subjects: ["Só um"] }],
        generatedAt: "2026-08-01T00:00:00.000Z",
      }).bytes,
    );
    expect(md).toContain("Só um");
    expect(md).not.toContain("Resumos por IA");
  });
});
