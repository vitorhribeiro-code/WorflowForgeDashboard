/**
 * Camada de IA (§5.2 fase 2) — porto agnóstico de LLM.
 *
 * Um LlmPort é um provider de IA já configurado (chave + modelo). O resolver
 * (módulo ai) constrói o adapter certo a partir do binding da org; os handlers
 * do M7 consomem este porto sem saber qual o provider por trás.
 *
 * Erros: seguem a convenção da plataforma (ver gmail.ts) — marcados com
 * `.transient` (rede/429/5xx → retry) ou `.status` (4xx → permanente), sem
 * importar as classes de erro do M7 (mantém a plataforma desacoplada). O
 * classify() do motor entende ambos.
 */

export interface LlmCompleteInput {
  prompt: string;
  system?: string;
  maxTokens?: number;
}

export interface LlmCompleteResult {
  text: string;
}

export interface LlmSummarizeItem {
  id: string;
  text: string;
}

export interface LlmSummary {
  id: string;
  summary: string;
}

export interface LlmSummarizeOptions {
  /** Teto de palavras por resumo (dica para o modelo). */
  maxWords?: number;
  /** Modelo a usar nesta chamada (default: o modelo do adapter). */
  maxTokens?: number;
}

export interface LlmPort {
  readonly provider: string;
  readonly model: string;
  /** Uma completude simples (system opcional). */
  complete(input: LlmCompleteInput): Promise<LlmCompleteResult>;
  /**
   * Resume vários itens NUMA só chamada (batch). Devolve um resumo por id.
   * Se a resposta do modelo não for parseável, lança (o consumidor faz fallback).
   */
  summarizeBatch(items: LlmSummarizeItem[], opts?: LlmSummarizeOptions): Promise<LlmSummary[]>;
}

/** Configuração de um adapter concreto (chave já decifrada + modelo resolvido). */
export interface LlmAdapterConfig {
  apiKey: string;
  model: string;
  /** Injetável para testes; default globalThis.fetch. */
  fetchFn?: typeof fetch;
}

/* ------------------------------- erros ----------------------------------- */

/** Falha de rede/serviço → transitório (o motor faz retry). */
export function llmTransient(message: string): Error {
  return Object.assign(new Error(message), { transient: true });
}

/** Erro com status HTTP → 429/5xx transitório, restantes permanentes. */
export function llmHttpError(message: string, status: number): Error {
  const transient = status === 429 || status >= 500;
  return Object.assign(new Error(message), { status, transient });
}
