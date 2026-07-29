import { describe, it, expect } from "vitest";
import {
  createEmailDigestHandler,
  renderEmailDigestMarkdown,
} from "@/modules/runs/service/handlers/builtin";

describe("renderEmailDigestMarkdown", () => {
  const result = {
    period: "2026-07",
    total: 3,
    senders: [
      { sender: "cliente@x.pt", count: 2, subjects: ["Fatura 1", "Fatura 2"] },
      { sender: "banco@y.pt", count: 1, subjects: [] },
    ],
    generatedAt: "2026-07-28T10:00:00.000Z",
  };

  it("produz um .md com cabeçalho, totais e secções por remetente", () => {
    const d = renderEmailDigestMarkdown(result);
    const md = new TextDecoder().decode(d.bytes);
    expect(d.mimeType).toBe("text/markdown");
    expect(d.filename).toBe("resumo-emails-2026-07.md");
    expect(d.idempotencyKey).toBe("email.digest:2026-07"); // mesmo período → mesmo doc
    expect(md).toContain("# Resumo de emails — 2026-07");
    expect(md).toContain("**3** emails de **2** remetentes.");
    expect(md).toContain("## cliente@x.pt (2)");
    expect(md).toContain("- Fatura 1");
    expect(md).toContain("_sem assuntos registados_"); // banco@y.pt sem subjects
    expect(md).toContain("_Gerado em 2026-07-28T10:00:00.000Z._");
  });

  it("é robusto a output degenerado (sem período nem senders)", () => {
    const d = renderEmailDigestMarkdown({ total: 0, senders: [], generatedAt: "2026-01-02T00:00:00.000Z" });
    const md = new TextDecoder().decode(d.bytes);
    expect(d.filename).toBe("resumo-emails-2026-01-02.md");
    expect(md).toContain("# Resumo de emails");
    expect(md).toContain("**0** emails de **0** remetentes.");
  });

  it("o email.digest handler expõe deliverable ligado ao renderer", () => {
    const h = createEmailDigestHandler();
    expect(typeof h.deliverable).toBe("function");
    const d = h.deliverable!({ total: 1, senders: [], period: "2026-05", generatedAt: "x" });
    expect(d?.filename).toBe("resumo-emails-2026-05.md");
  });
});
