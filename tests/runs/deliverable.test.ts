import { describe, it, expect } from "vitest";
import {
  createEmailDigestHandler,
  renderEmailDigestMarkdown,
} from "@/modules/runs/service/handlers/builtin";

describe("renderEmailDigestMarkdown (layout A)", () => {
  const result = {
    period: "2026-07",
    total: 3,
    senders: [
      {
        sender: "João Silva <joao@x.pt>",
        count: 2,
        subjects: ["Fatura 1", "Fatura 2"],
        lastReceivedAt: "2026-07-29T09:00:00.000Z",
      },
      { sender: "banco@y.pt", count: 1, subjects: [] },
    ],
    generatedAt: "2026-07-29T10:00:00.000Z",
  };

  it("cabeçalho com período legível e subtítulo com totais + data", () => {
    const d = renderEmailDigestMarkdown(result);
    const md = new TextDecoder().decode(d.bytes);
    expect(d.mimeType).toBe("text/markdown");
    expect(md).toContain("# Resumo de emails — julho 2026");
    // Subtítulo compacto: N emails · M remetentes · data (UTC)
    expect(md).toContain("3 emails · 2 remetentes · 29 jul 2026");
  });

  it("singular correto: '1 email · 1 remetente'", () => {
    const md = new TextDecoder().decode(
      renderEmailDigestMarkdown({
        period: "2026-07",
        total: 1,
        senders: [{ sender: "a@x.pt", count: 1, subjects: ["Só um"] }],
        generatedAt: "2026-07-29T10:00:00.000Z",
      }).bytes,
    );
    expect(md).toContain("1 email · 1 remetente · 29 jul 2026");
    expect(md).not.toContain("1 emails");
    expect(md).not.toContain("1 remetentes");
  });

  it("filename e idempotencyKey NÃO mudam (idempotência intacta)", () => {
    const d = renderEmailDigestMarkdown(result);
    expect(d.filename).toBe("resumo-emails-2026-07.md");
    expect(d.idempotencyKey).toBe("email.digest:2026-07");
  });

  it("bloco por remetente: nome legível, contagem, data do mais recente", () => {
    const md = new TextDecoder().decode(renderEmailDigestMarkdown(result).bytes);
    // Extrai o nome do From, tira o <email@…>, e mostra a data mais recente.
    expect(md).toContain("## João Silva — 2 · 29 jul 2026");
    // Assuntos numa só linha, separados por " · ".
    expect(md).toContain("Fatura 1 · Fatura 2");
  });

  it("remetente sem assuntos mostra sentinela; sem data não põe data", () => {
    const md = new TextDecoder().decode(renderEmailDigestMarkdown(result).bytes);
    expect(md).toContain("## banco@y.pt — 1");
    expect(md).not.toContain("banco@y.pt — 1 ·"); // sem lastReceivedAt → sem sufixo de data
    expect(md).toContain("_sem assuntos_");
  });

  it("assinala '…' quando há mais emails do que assuntos listados", () => {
    const md = new TextDecoder().decode(
      renderEmailDigestMarkdown({
        period: "2026-07",
        total: 5,
        senders: [{ sender: "a@x.pt", count: 5, subjects: ["S1", "S2"] }],
        generatedAt: "2026-07-29T10:00:00.000Z",
      }).bytes,
    );
    expect(md).toContain("S1 · S2 · …");
  });

  it("é robusto a output degenerado (sem período nem senders)", () => {
    const d = renderEmailDigestMarkdown({
      total: 0,
      senders: [],
      generatedAt: "2026-01-02T00:00:00.000Z",
    });
    const md = new TextDecoder().decode(d.bytes);
    expect(d.filename).toBe("resumo-emails-2026-01-02.md");
    expect(md).toContain("# Resumo de emails");
    expect(md).toContain("0 emails · 0 remetentes · 2 jan 2026");
  });

  it("o email.digest handler expõe deliverable ligado ao renderer", () => {
    const h = createEmailDigestHandler();
    expect(typeof h.deliverable).toBe("function");
    const d = h.deliverable!({ total: 1, senders: [], period: "2026-05", generatedAt: "x" });
    expect(d?.filename).toBe("resumo-emails-2026-05.md");
  });
});

describe("createEmailDigestHandler.execute — lastReceivedAt por remetente", () => {
  function ctx(input: Record<string, unknown>) {
    return {
      input,
      config: null,
      signal: new AbortController().signal,
      emit: () => {},
    };
  }

  it("agrega a data mais recente (máximo) por remetente", async () => {
    const h = createEmailDigestHandler(() => new Date("2026-07-30T00:00:00.000Z"));
    const out = await h.execute!(
      ctx({
        period: "2026-07",
        emails: [
          { from: "a@x.pt", subject: "S1", receivedAt: "2026-07-10T08:00:00.000Z" },
          { from: "a@x.pt", subject: "S2", receivedAt: "2026-07-28T08:00:00.000Z" },
          { from: "b@x.pt", subject: "S3" }, // sem receivedAt
        ],
      }),
    );
    const senders = out.senders as Array<{
      sender: string;
      count: number;
      lastReceivedAt?: string;
    }>;
    const a = senders.find((s) => s.sender === "a@x.pt")!;
    const b = senders.find((s) => s.sender === "b@x.pt")!;
    expect(a.count).toBe(2);
    expect(a.lastReceivedAt).toBe("2026-07-28T08:00:00.000Z"); // o mais recente
    expect(b.lastReceivedAt).toBeUndefined();
  });
});
