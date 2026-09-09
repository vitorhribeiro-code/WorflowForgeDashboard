import { describe, expect, it } from "vitest";
import { CARD_ENVELOPES, validateCard, type CardTemplate } from "@/modules/tasks/domain/card";
import {
  CARD_FEWSHOT,
  buildCardPrompt,
  deriveTemplate,
  generateCard,
  parseCardPresentation,
  type CardCompleteFn,
  type CardGenInput,
} from "@/modules/tasks/domain/card-generation";

const TEMPLATES: CardTemplate[] = ["size-s", "size-m", "size-l"];

const input: CardGenInput = {
  name: "Resumo diário de emails",
  description: "Agrupa os emails recebidos por remetente.",
  runtime: "email.digest",
  type: "automation",
};

// `complete` programável: devolve as respostas por ordem (repete a última);
// funções permitem simular erros do modelo. Regista os inputs recebidos.
function scripted(responses: Array<string | (() => Promise<{ text: string }>)>) {
  const calls: Array<{ system?: string; prompt: string; maxTokens?: number }> = [];
  let i = 0;
  const complete: CardCompleteFn = async (inp) => {
    calls.push(inp);
    const idx = Math.min(i, responses.length - 1);
    const r = responses[idx];
    i += 1;
    if (typeof r === "function") return r();
    return { text: r ?? "" };
  };
  return { complete, calls };
}

function spySleep() {
  const ms: number[] = [];
  return { sleep: async (n: number) => void ms.push(n), ms };
}

function llmError(transient: boolean): Error {
  return Object.assign(new Error(transient ? "429" : "401"), { transient });
}

describe("CARD_FEWSHOT — os exemplos são todos válidos (anti-drift)", () => {
  for (const t of TEMPLATES) {
    it(`few-shot de ${t} passa validateCard como draft`, () => {
      const card = { template: t, status: "draft" as const, presentation: CARD_FEWSHOT[t] };
      const r = validateCard(card);
      expect(r.valid).toBe(true);
      expect(r.errors).toEqual([]);
    });
  }
});

describe("deriveTemplate", () => {
  it("automation → size-s, assistant → size-m", () => {
    expect(deriveTemplate("automation")).toBe("size-s");
    expect(deriveTemplate("assistant")).toBe("size-m");
  });
});

describe("parseCardPresentation", () => {
  it("extrai o objeto de texto limpo", () => {
    const p = parseCardPresentation('{"blurb":"ola","blocks":[]}');
    expect(p).toEqual({ blurb: "ola", blocks: [] });
  });

  it("tolera ```json fences e texto à volta", () => {
    const p = parseCardPresentation('Aqui tens:\n```json\n{"blurb":"x","blocks":[]}\n``` pronto');
    expect(p).toMatchObject({ blurb: "x" });
  });

  it("devolve null quando não há objeto JSON", () => {
    expect(parseCardPresentation("desculpa, não consigo")).toBeNull();
  });

  it("devolve null para um array (não é um objeto de apresentação)", () => {
    expect(parseCardPresentation("[1,2,3]")).toBeNull();
  });
});

describe("buildCardPrompt — o harness em texto", () => {
  it("injeta o envelope do template e a lista de ícones", () => {
    const { system, prompt } = buildCardPrompt(input, "size-s");
    expect(system).toContain("JSON");
    expect(prompt).toContain(String(CARD_ENVELOPES["size-s"].maxBlurb));
    expect(prompt).toContain(String(CARD_ENVELOPES["size-s"].maxBlocks));
    expect(prompt).toContain("sparkles"); // um dos ícones do registo
    expect(prompt).toContain(input.name);
  });

  it("inclui os erros anteriores quando é uma re-tentativa", () => {
    const { prompt } = buildCardPrompt(input, "size-s", ["blurb > 90 (template size-s)"]);
    expect(prompt).toContain("REJEITADA");
    expect(prompt).toContain("blurb > 90");
  });
});

describe("generateCard — orquestração (retry + validação)", () => {
  const validM = '{"blurb":"Compõe um rascunho no teu tom.","blocks":[{"type":"note","icon":"pen","text":"Dás o objetivo."}]}';
  const invalid = '{"blurb":"ok","blocks":[{"type":"bogus","text":"x"}]}';

  it("sucesso à primeira: devolve um cartão draft válido", async () => {
    const { complete, calls } = scripted([validM]);
    const { sleep, ms } = spySleep();
    const res = await generateCard({ complete, sleep }, input, "size-m");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.attempts).toBe(1);
      expect(res.card.template).toBe("size-m");
      expect(res.card.status).toBe("draft");
      expect(validateCard(res.card).valid).toBe(true);
    }
    expect(calls).toHaveLength(1);
    expect(ms).toHaveLength(0); // sem backoff quando acerta logo
  });

  it("re-tenta após inválido e acerta à segunda (backoff 1x)", async () => {
    const { complete, calls } = scripted([invalid, validM]);
    const { sleep, ms } = spySleep();
    const res = await generateCard({ complete, sleep }, input, "size-m", { baseDelayMs: 10 });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.attempts).toBe(2);
    expect(calls).toHaveLength(2);
    expect(ms).toHaveLength(1); // um backoff entre as duas tentativas
    // A 2.ª chamada recebeu os erros da 1.ª no prompt.
    expect(calls[1]?.prompt).toContain("REJEITADA");
  });

  it("falha após esgotar as tentativas: reason=invalid com erros", async () => {
    const { complete, calls } = scripted([invalid]);
    const { sleep, ms } = spySleep();
    const res = await generateCard({ complete, sleep }, input, "size-m", {
      maxAttempts: 3,
      baseDelayMs: 5,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("invalid");
      expect(res.attempts).toBe(3);
      expect(res.errors && res.errors.length).toBeGreaterThan(0);
    }
    expect(calls).toHaveLength(3);
    expect(ms).toHaveLength(2); // backoff entre tentativas (N-1)
  });

  it("sem JSON parseável → reason=no-json após esgotar", async () => {
    const { complete } = scripted(["não sei fazer isso"]);
    const { sleep } = spySleep();
    const res = await generateCard({ complete, sleep }, input, "size-s", {
      maxAttempts: 2,
      baseDelayMs: 1,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("no-json");
  });

  it("erro PERMANENTE do modelo (401) não re-tenta", async () => {
    const { complete, calls } = scripted([
      () => Promise.reject(llmError(false)),
      validM, // não deve chegar aqui
    ]);
    const { sleep, ms } = spySleep();
    const res = await generateCard({ complete, sleep }, input, "size-m");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("llm-error");
      expect(res.attempts).toBe(1);
      expect(res.message).toContain("401");
    }
    expect(calls).toHaveLength(1);
    expect(ms).toHaveLength(0);
  });

  it("erro TRANSITÓRIO do modelo re-tenta e pode acertar", async () => {
    const { complete, calls } = scripted([() => Promise.reject(llmError(true)), validM]);
    const { sleep, ms } = spySleep();
    const res = await generateCard({ complete, sleep }, input, "size-m", { baseDelayMs: 3 });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.attempts).toBe(2);
    expect(calls).toHaveLength(2);
    expect(ms).toHaveLength(1);
  });
});
