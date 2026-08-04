/**
 * Adapter Claude — Anthropic Messages API (§5.2 fase 2).
 * Implementa só `complete`; `summarizeBatch` delega no helper partilhado.
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

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 1024;

// Concatena os blocos de texto da resposta (content: [{type:"text",text}, ...]).
function extractText(data: Record<string, unknown>): string {
  const content = data.content;
  if (!Array.isArray(content)) return "";
  return content
    .map((b) => {
      if (typeof b !== "object" || b === null) return "";
      const r = b as Record<string, unknown>;
      return r.type === "text" && typeof r.text === "string" ? r.text : "";
    })
    .join("");
}

export function createClaudeAdapter(cfg: LlmAdapterConfig): LlmPort {
  const httpFetch = cfg.fetchFn ?? fetch;

  async function complete(input: LlmCompleteInput): Promise<LlmCompleteResult> {
    let res: Response;
    try {
      res = await httpFetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": cfg.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
          ...(input.system ? { system: input.system } : {}),
          messages: [{ role: "user", content: input.prompt }],
        }),
      });
    } catch {
      throw llmTransient("Claude inacessível.");
    }
    if (!res.ok) {
      throw llmHttpError(`Claude respondeu ${res.status}.`, res.status);
    }
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { text: extractText(data) };
  }

  return {
    provider: "claude",
    model: cfg.model,
    complete,
    summarizeBatch(items: LlmSummarizeItem[], opts?: LlmSummarizeOptions) {
      return summarizeViaComplete(complete, items, opts);
    },
  };
}
