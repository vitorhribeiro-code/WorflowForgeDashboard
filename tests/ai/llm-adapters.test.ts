import { describe, expect, it, vi } from "vitest";
import { createClaudeAdapter } from "@/platform/ai/claude";
import { createMistralAdapter } from "@/platform/ai/mistral";
import { parseSummaries } from "@/platform/ai/summarize";

/**
 * §5.2 fase 2 — adapters de IA. Sem rede: injeta-se um `fetch` fake que devolve
 * respostas canónicas de cada provider e valida-se a forma do request + o parse.
 */

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("adapter Claude", () => {
  it("faz POST à Messages API com headers e corpo corretos e parseia o texto", async () => {
    const fetchFn = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(
        okResponse({ content: [{ type: "text", text: "olá " }, { type: "text", text: "mundo" }] }),
      ),
    );
    const claude = createClaudeAdapter({
      apiKey: "sk-claude",
      model: "claude-sonnet-4-5",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const out = await claude.complete({ prompt: "diz olá", system: "és breve", maxTokens: 50 });
    expect(out.text).toBe("olá mundo");

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = init!.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-claude");
    expect(headers["anthropic-version"]).toBeTruthy();
    const body = JSON.parse(init!.body as string);
    expect(body.model).toBe("claude-sonnet-4-5");
    expect(body.max_tokens).toBe(50);
    expect(body.system).toBe("és breve");
    expect(body.messages).toEqual([{ role: "user", content: "diz olá" }]);
    expect(claude.provider).toBe("claude");
  });

  it("mapeia 500 como transitório e 401 como permanente", async () => {
    const c500 = createClaudeAdapter({
      apiKey: "k",
      model: "m",
      fetchFn: (async () => new Response("", { status: 500 })) as unknown as typeof fetch,
    });
    await expect(c500.complete({ prompt: "x" })).rejects.toMatchObject({ transient: true });

    const c401 = createClaudeAdapter({
      apiKey: "k",
      model: "m",
      fetchFn: (async () => new Response("", { status: 401 })) as unknown as typeof fetch,
    });
    await expect(c401.complete({ prompt: "x" })).rejects.toMatchObject({
      status: 401,
      transient: false,
    });
  });
});

describe("adapter Mistral", () => {
  it("faz POST a chat/completions com Bearer e parseia choices[0].message.content", async () => {
    const fetchFn = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(
        okResponse({ choices: [{ message: { role: "assistant", content: "bonjour" } }] }),
      ),
    );
    const mistral = createMistralAdapter({
      apiKey: "sk-mistral",
      model: "mistral-small",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const out = await mistral.complete({ prompt: "salut", system: "sois bref" });
    expect(out.text).toBe("bonjour");

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("https://api.mistral.ai/v1/chat/completions");
    const headers = init!.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sk-mistral");
    const body = JSON.parse(init!.body as string);
    expect(body.model).toBe("mistral-small");
    expect(body.messages).toEqual([
      { role: "system", content: "sois bref" },
      { role: "user", content: "salut" },
    ]);
    expect(mistral.provider).toBe("mistral");
  });
});

describe("summarizeBatch (partilhado)", () => {
  it("uma só chamada, mapeia resumos por id (tolera ```-fences)", async () => {
    const fetchFn = vi.fn(async () =>
      okResponse({
        content: [
          {
            type: "text",
            text: '```json\n[{"id":"a","summary":"resumo A"},{"id":"b","summary":"resumo B"}]\n```',
          },
        ],
      }),
    );
    const claude = createClaudeAdapter({
      apiKey: "k",
      model: "m",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const res = await claude.summarizeBatch([
      { id: "a", text: "email A" },
      { id: "b", text: "email B" },
    ]);
    expect(fetchFn).toHaveBeenCalledTimes(1); // batch = 1 chamada
    expect(res).toEqual([
      { id: "a", summary: "resumo A" },
      { id: "b", summary: "resumo B" },
    ]);
  });

  it("lista vazia não chama o modelo", async () => {
    const fetchFn = vi.fn(async () => okResponse({ content: [] }));
    const claude = createClaudeAdapter({
      apiKey: "k",
      model: "m",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(await claude.summarizeBatch([])).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("parseSummaries lança em resposta não-parseável e ignora ids não pedidos", () => {
    const items = [{ id: "a", text: "x" }];
    expect(() => parseSummaries("sem json aqui", items)).toThrow();
    // id "z" não foi pedido → descartado; "a" fica.
    const ok = parseSummaries('[{"id":"a","summary":"ok"},{"id":"z","summary":"lixo"}]', items);
    expect(ok).toEqual([{ id: "a", summary: "ok" }]);
  });
});
