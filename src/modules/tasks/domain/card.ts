// -------------------------------------------------------------------------- //
//  Cartão da Task (v41) — APRESENTAÇÃO apenas. Puro, sem IO.                   //
//                                                                             //
//  A MECÂNICA do cartão (consolas assistidas, botão de run, cron, pills)      //
//  deriva do `runtime` e é invocada pelo código no render — NUNCA vive aqui.  //
//  Este módulo modela só a camada apresentacional que o super-utilizador      //
//  compõe/edita (e que o LLM gera, no v43): um blurb + blocos tipados de um    //
//  CATÁLOGO FECHADO + ícones de um REGISTO FECHADO.                           //
//                                                                             //
//  Garantia anti-vazamento: o LLM produz DADOS (blocos), nunca markup; a      //
//  validação abaixo é determinística (catálogo + envelope do template +       //
//  registo de ícones). O que não valida, rejeita-se.                          //
// -------------------------------------------------------------------------- //

// Os 3 tamanhos são templates fixos (a escolha do super-utilizador). Espelham
// as classes `.wf-tc-mid.size-*` do cartão real (só diferem em min-height).
export type CardTemplate = "size-s" | "size-m" | "size-l";

export const CARD_TEMPLATES: readonly CardTemplate[] = [
  "size-s",
  "size-m",
  "size-l",
] as const;

// Estado do CARTÃO (distinto do `published` da TAREFA — ver ERD/handoff v42).
//  - draft: em construção; só o super-utilizador o vê (no preview do catálogo).
//           O trabalhador NUNCA vê a apresentação de um cartão em draft.
//  - ready: validado pelo super-utilizador ("disponível para publicação"); a
//           sua apresentação passa a ser mostrada ao trabalhador (quando a
//           tarefa está publicada). O flip draft→ready é ato do super-utilizador
//           (aterra no v44, junto do editor). No v42, os cartões nascem draft.
export type CardStatus = "draft" | "ready";

export const CARD_STATUSES: readonly CardStatus[] = ["draft", "ready"] as const;

// Registo FECHADO de ícones (curado de Lucide, MIT). O render mapeia nome→SVG
// inline. Alargar é decisão deliberada (schema + render), nunca do LLM.
export const ICON_NAMES = [
  // runtimes
  "mail",
  "pen",
  "bar-chart",
  "cloud-download",
  "file-text",
  // agenda / cron
  "calendar",
  "clock",
  "repeat",
  // estados
  "check",
  "alert-triangle",
  "x",
  "bell",
  "zap",
  // conexões
  "plug",
  "link",
  "key",
  // genéricos
  "folder",
  "tag",
  "info",
  "sparkles",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

// Catálogo FECHADO de blocos — SÓ apresentação. Nunca `run-button`/`console`
// (isso é mecânica, injetada pelo runtime).
export type PresentationBlock =
  | { type: "note"; icon?: IconName; text: string }
  | { type: "kv"; icon?: IconName; label: string; value: string }
  | { type: "emphasis"; text: string };

export type BlockType = PresentationBlock["type"];

export const BLOCK_TYPES: readonly BlockType[] = ["note", "kv", "emphasis"] as const;

export type CardPresentation = {
  blurb: string;
  blocks: PresentationBlock[];
};

export type TaskCard = {
  template: CardTemplate;
  status: CardStatus;
  presentation: CardPresentation;
};

// -------------------------------------------------------------------------- //
//  Envelope por template (o "harness"): teto conservador; afinar no preview.  //
//  size-l tem mais ALTURA mas MENOS orçamento de blocos (a consola de escrita //
//  já ocupa o miolo; os blocos sentam-se ACIMA da mecânica).                  //
// -------------------------------------------------------------------------- //
export type CardEnvelope = { maxBlocks: number; maxBlurb: number };

export const CARD_ENVELOPES: Record<CardTemplate, CardEnvelope> = {
  "size-s": { maxBlocks: 3, maxBlurb: 90 },
  "size-m": { maxBlocks: 3, maxBlurb: 140 },
  "size-l": { maxBlocks: 2, maxBlurb: 180 },
};

// Limites de campo (defensivos; o LLM não deve encostar-lhes, mas o editor
// manual também passa por aqui).
const MAX_TEXT = 240;
const MAX_LABEL = 40;
const MAX_VALUE = 80;

export type CardValidation = { valid: boolean; errors: string[] };

const ICON_SET: ReadonlySet<string> = new Set(ICON_NAMES);

function validateBlock(b: unknown, i: number, errors: string[]): void {
  if (typeof b !== "object" || b === null) {
    errors.push(`blocks[${i}]: não é um objeto`);
    return;
  }
  const block = b as Record<string, unknown>;
  const type = block.type;
  if (type !== "note" && type !== "kv" && type !== "emphasis") {
    errors.push(`blocks[${i}]: type inválido (${String(type)})`);
    return;
  }

  // icon opcional, mas se presente tem de estar no registo (note/kv só).
  if ("icon" in block && block.icon !== undefined) {
    if (type === "emphasis") {
      errors.push(`blocks[${i}]: 'emphasis' não aceita icon`);
    } else if (typeof block.icon !== "string" || !ICON_SET.has(block.icon)) {
      errors.push(`blocks[${i}]: icon fora do registo (${String(block.icon)})`);
    }
  }

  if (type === "note") {
    if (typeof block.text !== "string" || block.text.trim() === "") {
      errors.push(`blocks[${i}]: 'note' exige text não-vazio`);
    } else if (block.text.length > MAX_TEXT) {
      errors.push(`blocks[${i}]: text > ${MAX_TEXT}`);
    }
  } else if (type === "kv") {
    if (typeof block.label !== "string" || block.label.trim() === "") {
      errors.push(`blocks[${i}]: 'kv' exige label não-vazio`);
    } else if (block.label.length > MAX_LABEL) {
      errors.push(`blocks[${i}]: label > ${MAX_LABEL}`);
    }
    if (typeof block.value !== "string" || block.value.trim() === "") {
      errors.push(`blocks[${i}]: 'kv' exige value não-vazio`);
    } else if (block.value.length > MAX_VALUE) {
      errors.push(`blocks[${i}]: value > ${MAX_VALUE}`);
    }
  } else if (type === "emphasis") {
    if (typeof block.text !== "string" || block.text.trim() === "") {
      errors.push(`blocks[${i}]: 'emphasis' exige text não-vazio`);
    } else if (block.text.length > MAX_TEXT) {
      errors.push(`blocks[${i}]: text > ${MAX_TEXT}`);
    }
  }
}

// Validação determinística de um TaskCard contra o catálogo + envelope do
// template. Devolve todas as falhas (não lança).
export function validateCard(input: unknown): CardValidation {
  const errors: string[] = [];

  if (typeof input !== "object" || input === null) {
    return { valid: false, errors: ["card: não é um objeto"] };
  }
  const card = input as Record<string, unknown>;

  const template = card.template;
  if (
    template !== "size-s" &&
    template !== "size-m" &&
    template !== "size-l"
  ) {
    return { valid: false, errors: [`template inválido (${String(template)})`] };
  }
  const envelope = CARD_ENVELOPES[template];

  const status = card.status;
  if (status !== "draft" && status !== "ready") {
    errors.push(`status inválido (${String(status)})`);
  }

  const presentation = card.presentation;
  if (typeof presentation !== "object" || presentation === null) {
    return { valid: false, errors: ["presentation: em falta ou inválida"] };
  }
  const pres = presentation as Record<string, unknown>;

  if (typeof pres.blurb !== "string") {
    errors.push("blurb: em falta ou não-string");
  } else if (pres.blurb.length > envelope.maxBlurb) {
    errors.push(`blurb > ${envelope.maxBlurb} (template ${template})`);
  }

  if (!Array.isArray(pres.blocks)) {
    errors.push("blocks: não é um array");
  } else {
    if (pres.blocks.length > envelope.maxBlocks) {
      errors.push(
        `blocks: ${pres.blocks.length} > ${envelope.maxBlocks} (template ${template})`,
      );
    }
    pres.blocks.forEach((b, i) => validateBlock(b, i, errors));
  }

  return { valid: errors.length === 0, errors };
}

// Type guard conveniente (usa a validação acima).
export function isValidCard(input: unknown): input is TaskCard {
  return validateCard(input).valid;
}

// Cartão-semente para um template (v42): fixa o TAMANHO (a decisão do
// super-utilizador antes do editor), em estado `draft`, com uma apresentação
// mínima VÁLIDA (blurb vazio + zero blocos — o render degrada com placeholder).
// O editor do v44 preenche este esqueleto e valida (draft→ready). Fixar o
// template primeiro dá ao gerador/editor o envelope certo à partida.
export function seedCard(template: CardTemplate): TaskCard {
  return {
    template,
    status: "draft",
    presentation: { blurb: "", blocks: [] },
  };
}
