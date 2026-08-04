/**
 * Adapter Mistral — API chat/completions (§5.2 fase 2).
 * Implementa só `complete`; `summarizeBatch` delega no helper partilhado.
 * Alavanca RGPD: provider EU (ver notas da Fase 3).
 */

import {
  llmHttpError,
  llmTransient,
  type LlmAdapterConfig,
  type LlmCompleteInput,
  type LlmCompleteResult,
  type LlmPort,
  type LlmSummarizeItem,
  type LlmSummarizeOptions,
} from "./port";
import { summarizeViaComplete } from "./summarize";

const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";

// Lê choices[0].message.content (string).
function extractText(data: Record<string, unknown>): string {
  const choices = data.choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const first = choices[0];
  if (typeof first !== "object" || first === null) return "";
  const message = (first as Record<string, unknown>).message;
  if (typeof message !== "object" || message === null) return "";
  const content = (message as Record<string, unknown>).content;
  return typeof content === "string" ? content : "";
}

export function createMistralAdapter(cfg: LlmAdapterConfig): LlmPort {
  const httpFetch = cfg.fetchFn ?? fetch;

  async function complete(input: LlmCompleteInput): Promise<LlmCompleteResult> {
    const messages: Array<{ role: string; content: string }> = [];
    if (input.system) messages.push({ role: "system", content: input.system });
    messages.push({ role: "user", content: input.prompt });

    let res: Response;
    try {
      res = await httpFetch(MISTRAL_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
          messages,
        }),
      });
    } catch {
      throw llmTransient("Mistral inacessível.");
    }
    if (!res.ok) {
      throw llmHttpError(`Mistral respondeu ${res.status}.`, res.status);
    }
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { text: extractText(data) };
  }

  return {
    provider: "mistral",
    model: cfg.model,
    complete,
    summarizeBatch(items: LlmSummarizeItem[], opts?: LlmSummarizeOptions) {
      return summarizeViaComplete(complete, items, opts);
    },
  };
}
