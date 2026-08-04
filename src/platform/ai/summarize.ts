/**
 * Resumo em batch, partilhado pelos adapters (§5.2 fase 2).
 *
 * Ambos os providers implementam só `complete`; o `summarizeBatch` é genérico:
 * uma única chamada que pede ao modelo um array JSON [{id, summary}] e mapeia
 * de volta por id. Parse robusto (tolera ```-fences e texto à volta). Se não
 * for parseável, lança — o consumidor (Fase 3) faz fallback ao assunto/snippet.
 */

import type {
  LlmCompleteInput,
  LlmCompleteResult,
  LlmSummarizeItem,
  LlmSummarizeOptions,
  LlmSummary,
} from "./port";

const SYSTEM =
  "És um assistente que resume emails de forma concisa e factual, em português de Portugal. " +
  "Respondes SEMPRE e SÓ com um array JSON válido, sem texto à volta nem blocos de código.";

export function buildSummarizePrompt(
  items: LlmSummarizeItem[],
  opts?: LlmSummarizeOptions,
): string {
  const maxWords = opts?.maxWords && opts.maxWords > 0 ? opts.maxWords : 25;
  const payload = items.map((it) => ({ id: it.id, text: it.text }));
  return [
    `Resume cada item em no máximo ${maxWords} palavras.`,
    `Devolve um array JSON com exatamente um objeto por item, no formato`,
    `[{"id": "<id>", "summary": "<resumo>"}], preservando os ids recebidos.`,
    `Itens:`,
    JSON.stringify(payload),
  ].join("\n");
}

/** Extrai o primeiro array JSON de um texto (tolera ```-fences e ruído). */
export function parseSummaries(text: string, items: LlmSummarizeItem[]): LlmSummary[] {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Resumo: resposta do modelo sem array JSON.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new Error("Resumo: array JSON inválido na resposta do modelo.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Resumo: esperado um array JSON.");
  }

  // Mapeia por id; só devolve entradas que casam com um item pedido.
  const byId = new Map<string, string>();
  for (const row of parsed) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id : undefined;
    const summary = typeof r.summary === "string" ? r.summary : undefined;
    if (id && summary) byId.set(id, summary.trim());
  }
  const wanted = new Set(items.map((i) => i.id));
  return [...byId.entries()]
    .filter(([id]) => wanted.has(id))
    .map(([id, summary]) => ({ id, summary }));
}

/**
 * Implementação genérica de summarizeBatch em cima de um `complete`. Cada
 * adapter reusa isto passando o seu próprio `complete`.
 */
export async function summarizeViaComplete(
  complete: (input: LlmCompleteInput) => Promise<LlmCompleteResult>,
  items: LlmSummarizeItem[],
  opts?: LlmSummarizeOptions,
): Promise<LlmSummary[]> {
  if (items.length === 0) return [];
  const { text } = await complete({
    system: SYSTEM,
    prompt: buildSummarizePrompt(items, opts),
    maxTokens: opts?.maxTokens,
  });
  return parseSummaries(text, items);
}
