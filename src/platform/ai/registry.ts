/**
 * Registry de adapters de IA (§5.2 fase 2). Mapeia o provider key (o mesmo
 * texto guardado em ai_providers.provider) para o construtor do adapter.
 * Provider desconhecido → null (o resolver devolve null → o consumidor faz
 * fallback). Extensível: acrescentar aqui uma entrada por novo provider.
 */

import { createClaudeAdapter } from "./claude";
import { createMistralAdapter } from "./mistral";
import type { LlmAdapterConfig, LlmPort } from "./port";

export type AdapterFactory = (cfg: LlmAdapterConfig) => LlmPort;

const ADAPTERS: Record<string, AdapterFactory> = {
  claude: createClaudeAdapter,
  mistral: createMistralAdapter,
};

export function createAdapter(provider: string, cfg: LlmAdapterConfig): LlmPort | null {
  const factory = ADAPTERS[provider];
  return factory ? factory(cfg) : null;
}

export function isKnownAiProvider(provider: string): boolean {
  return provider in ADAPTERS;
}
