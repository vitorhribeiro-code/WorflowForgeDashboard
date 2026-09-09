// -------------------------------------------------------------------------- //
//  Geração do cartão (v43) — compõe a APRESENTAÇÃO via LLM. Puro, sem IO.      //
//                                                                             //
//  O LLM produz só DADOS: um objeto { blurb, blocks } (a `presentation`). O   //
//  código junta `template` + `status:"draft"` e passa TUDO por `validateCard` //
//  (o harness anti-vazamento do v41/v42). O modelo nunca escolhe o tamanho,   //
//  nunca inventa tipos de bloco nem ícones fora do registo — o que não valida //
//  é rejeitado e re-tentado. A saída é sempre um cartão VÁLIDO ou uma falha    //
//  explícita (nunca lança: devolve um resultado discriminado).                //
//                                                                             //
//  `generateCard` recebe `complete` INJETADO (uma completude de LLM) — como o //
//  `summarizeViaComplete` da plataforma —, o que o mantém testável sem rede.  //
// -------------------------------------------------------------------------- //

import type { TaskType } from "./types";
import {
  CARD_ENVELOPES,
  ICON_NAMES,
  validateCard,
  type CardPresentation,
  type CardTemplate,
  type TaskCard,
} from "./card";

/* -------------------------------------------------------------------------- */
/*  Contrato do LLM (estrutural — igual a LlmPort.complete, sem o importar)     */
/* -------------------------------------------------------------------------- */

export type CardCompleteFn = (input: {
  prompt: string;
  system?: string;
  maxTokens?: number;
}) => Promise<{ text: string }>;

export interface CardGenDeps {
  complete: CardCompleteFn;
  /** Injetável para testes; default: setTimeout real. */
  sleep?: (ms: number) => Promise<void>;
}

export type CardGenInput = {
  name: string;
  description: string | null;
  runtime: string;
  type: TaskType;
};

export type CardGenOptions = {
  maxAttempts?: number; // default 3
  maxTokens?: number; // default 700
  baseDelayMs?: number; // default 300 (backoff exponencial)
};

// Resultado discriminado — nunca lança (a validação é o gate, como validateCard).
export type CardGenResult =
  | { ok: true; card: TaskCard; attempts: number }
  | {
      ok: false;
      reason: "invalid" | "no-json" | "llm-error";
      attempts: number;
      errors?: string[]; // erros do validateCard (reason=invalid)
      message?: string; // razão do erro do modelo (reason=llm-error)
    };

/* -------------------------------------------------------------------------- */
/*  Template derivado do tipo (mesma regra do preview do catálogo)             */
/* -------------------------------------------------------------------------- */

export function deriveTemplate(type: TaskType): CardTemplate {
  // Automáticas mostram menos (nascem pequenas); assistidas têm consola no miolo
  // e ganham com o tamanho médio. É só o DEFAULT — o super-utilizador troca.
  return type === "automation" ? "size-s" : "size-m";
}

/* -------------------------------------------------------------------------- */
/*  Few-shot: cartões VÁLIDOS, um por template (RECUPERAÇÃO, não treino).       */
/*  Poucos e compactos de propósito: gastam INPUT mas ancoram o formato.       */
/*  Um teste garante que TODOS passam `validateCard` (anti-drift).             */
/* -------------------------------------------------------------------------- */

export const CARD_FEWSHOT: Record<CardTemplate, CardPresentation> = {
  "size-s": {
    blurb: "Resumo diário dos emails recebidos, agrupados por remetente.",
    blocks: [
      { type: "kv", icon: "clock", label: "Cadência", value: "Todos os dias às 8h" },
      { type: "note", icon: "mail", text: "Chega à tua inbox pronto a ler." },
    ],
  },
  "size-m": {
    blurb:
      "Compõe um rascunho de texto a partir de um objetivo teu — no teu tom e estilo — para reveres e enviares.",
    blocks: [
      { type: "kv", icon: "pen", label: "Modo", value: "Escrita assistida" },
      { type: "note", icon: "sparkles", text: "Dás o objetivo; devolve um rascunho editável." },
      { type: "emphasis", text: "Tu tens sempre a última palavra." },
    ],
  },
  "size-l": {
    blurb:
      "Consolida a atividade do mês num relatório único — execuções, ficheiros e totais — pronto a arquivar e partilhar.",
    blocks: [
      { type: "kv", icon: "calendar", label: "Período", value: "Fecho mensal" },
      { type: "note", icon: "file-text", text: "Um pacote por trabalhador, com logs e anexos." },
    ],
  },
};

/* -------------------------------------------------------------------------- */
/*  Prompt (o harness em texto): envelope + catálogo + ícones + few-shot        */
/* -------------------------------------------------------------------------- */

const SYSTEM =
  "És um assistente que compõe a APRESENTAÇÃO de um cartão de tarefa numa dashboard, " +
  "em português de Portugal. Escreves de forma clara, concreta e útil para quem vai USAR a tarefa. " +
  "Respondes SEMPRE e SÓ com um objeto JSON válido — sem texto à volta, sem blocos de código, sem comentários.";

export function buildCardPrompt(
  input: CardGenInput,
  template: CardTemplate,
  prevErrors?: string[],
): { system: string; prompt: string } {
  const env = CARD_ENVELOPES[template];
  const fewshot = CARD_FEWSHOT[template];

  const lines: string[] = [
    `Compõe a apresentação do cartão da tarefa abaixo, para o template "${template}".`,
    "",
    "TAREFA:",
    `- Nome: ${input.name}`,
    `- Descrição: ${input.description?.trim() || "(sem descrição)"}`,
    `- Tipo: ${input.type === "automation" ? "automática (corre sozinha)" : "assistida (o trabalhador aciona)"}`,
    `- Runtime técnico: ${input.runtime}`,
    "",
    "FORMATO DE SAÍDA — um objeto JSON com exatamente estas chaves:",
    `{ "blurb": "<frase curta>", "blocks": [ <bloco>, ... ] }`,
    "",
    "LIMITES (obrigatórios):",
    `- "blurb": string, no máximo ${env.maxBlurb} caracteres. Descreve o VALOR da tarefa para o trabalhador.`,
    `- "blocks": array com no máximo ${env.maxBlocks} blocos. Podem ser menos (ou zero). Não repitas informação do blurb.`,
    "",
    "TIPOS DE BLOCO permitidos (só estes três):",
    `- { "type": "note", "icon"?: "<ícone>", "text": "<texto>" } — uma nota curta.`,
    `- { "type": "kv", "icon"?: "<ícone>", "label": "<rótulo>", "value": "<valor>" } — um par rótulo/valor (ex.: cadência, modo).`,
    `- { "type": "emphasis", "text": "<texto>" } — uma frase em destaque (NÃO aceita ícone).`,
    "",
    `ÍCONES permitidos (o campo "icon" é opcional; se o usares, TEM de ser um destes):`,
    ICON_NAMES.join(", "),
    "",
    "EXEMPLO de uma resposta bem formada para este template:",
    JSON.stringify(fewshot),
  ];

  if (prevErrors && prevErrors.length > 0) {
    lines.push(
      "",
      "A tua tentativa anterior foi REJEITADA pela validação. Corrige EXATAMENTE isto e responde de novo:",
      ...prevErrors.map((e) => `- ${e}`),
    );
  }

  lines.push("", "Responde agora só com o objeto JSON.");

  return { system: SYSTEM, prompt: lines.join("\n") };
}

/* -------------------------------------------------------------------------- */
/*  Parse tolerante: extrai o primeiro objeto JSON (aguenta ```-fences e ruído) */
/* -------------------------------------------------------------------------- */

export function parseCardPresentation(text: string): { blurb?: unknown; blocks?: unknown } | null {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as { blurb?: unknown; blocks?: unknown };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Orquestrador: gera → valida → retry com backoff. Nunca lança.               */
/* -------------------------------------------------------------------------- */

const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// Erro permanente do LLM (ex.: 401/400) traz `.transient === false` (ver
// platform/ai/port). Nesse caso não vale a pena re-tentar — falha já.
function isPermanentLlmError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "transient" in err &&
    (err as { transient?: unknown }).transient === false
  );
}

export async function generateCard(
  deps: CardGenDeps,
  input: CardGenInput,
  template: CardTemplate,
  opts: CardGenOptions = {},
): Promise<CardGenResult> {
  const maxAttempts = opts.maxAttempts && opts.maxAttempts > 0 ? opts.maxAttempts : 3;
  const maxTokens = opts.maxTokens && opts.maxTokens > 0 ? opts.maxTokens : 700;
  const baseDelayMs = opts.baseDelayMs ?? 300;
  const sleep = deps.sleep ?? realSleep;

  let lastErrors: string[] = [];
  let lastReason: "invalid" | "no-json" = "no-json";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { system, prompt } = buildCardPrompt(input, template, attempt > 1 ? lastErrors : undefined);

    let text: string;
    try {
      const out = await deps.complete({ system, prompt, maxTokens });
      text = out.text;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Permanente → não re-tenta (poupa tokens). Transitório → backoff e segue.
      if (isPermanentLlmError(err)) {
        return { ok: false, reason: "llm-error", attempts: attempt, message };
      }
      if (attempt >= maxAttempts) {
        return { ok: false, reason: "llm-error", attempts: attempt, message };
      }
      await sleep(baseDelayMs * 2 ** (attempt - 1));
      continue;
    }

    const parsed = parseCardPresentation(text);
    if (!parsed) {
      lastReason = "no-json";
      lastErrors = ["A resposta não continha um objeto JSON válido."];
    } else {
      const card = {
        template,
        status: "draft" as const,
        presentation: parsed as CardPresentation,
      };
      const check = validateCard(card);
      if (check.valid) {
        return { ok: true, card: card as TaskCard, attempts: attempt };
      }
      lastReason = "invalid";
      lastErrors = check.errors;
    }

    if (attempt < maxAttempts) {
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }

  return { ok: false, reason: lastReason, attempts: maxAttempts, errors: lastErrors };
}
