/**
 * Executor de runtimes GENERATED (v51).
 *
 * Um runtime `generic` (criado na app a partir de um mapeamento — v50/v52) não
 * tem handler construído em código. Este resolver constrói, em runtime, um
 * RunHandler a partir do `spec` guardado no catálogo (`runtimes.spec`): é um
 * `assistant.generic` PARAMETRIZADO pela instrução do runtime.
 *
 *   · Capacidade de IA: TODOS os generated resolvem o MESMO binding que o
 *     `assistant.generic` (a org configura UM modelo genérico). Sem binding →
 *     scaffold honesto (run verde), igual aos handlers built-in.
 *   · Suporta execute (automáticas) E stream (assistidas) — o dispatch escolhe.
 *   · Só age em runtimes `kind='generic'`; para built-in/inexistentes devolve
 *     null (o dispatch cai no erro "sem handler" de sempre).
 *
 * O motor NÃO é recriado: o runs.service só ganha um fallback async que chama
 * este resolver quando `handlers.get(runtime)` não devolve um handler built-in.
 */

import type { DeliverableDraft, ExecContext, RunEvent, RunHandler } from "./handler";
import { PermanentError } from "../exec-errors";
import type { LlmResolver } from "@/modules/ai/service/resolver";

// Capacidade partilhada por todos os generated (mesmo binding do assistant.generic).
const GENERIC_CAPABILITY = "assistant.generic";

const DEFAULT_GENERIC_SYSTEM =
  "És um assistente que executa a tarefa descrita nas instruções, de forma " +
  "útil, clara e direta, em português europeu, sem preâmbulos nem formatação " +
  "desnecessária.";

/** Spec guardado em `runtimes.spec` (jsonb) para um runtime generated. */
export interface GenericRuntimeSpec {
  instruction: string; // o QUE este runtime faz (do mapeamento). Obrigatório.
  system?: string; // system opcional (sobrepõe o default).
}

/**
 * Fonte consumida — get(runtime) devolve o registo do catálogo com o spec.
 * Estruturalmente compatível com o catálogo Drizzle do M4 (que ganhou `get`).
 */
export interface GenericRuntimeSource {
  get(runtime: string): Promise<{
    taskType: "automation" | "assistant";
    kind: "builtin" | "generic";
    spec: unknown;
  } | null>;
}

type Now = () => Date;

export interface GenericRuntimeResolverDeps {
  source: GenericRuntimeSource;
  // null quando a plataforma não tem ENCRYPTION_KEY (sem IA) — sempre scaffold.
  resolver: LlmResolver | null;
  now?: Now;
}

export interface GenericRuntimeResolver {
  /** Handler para um runtime GENERATED; null se for built-in ou não existir. */
  resolve(runtime: string): Promise<RunHandler | null>;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** Valida/normaliza o spec. instruction em falta → null (config inválida). */
export function parseGenericSpec(raw: unknown): GenericRuntimeSpec | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const instruction = (asString(rec.instruction) ?? "").trim();
  if (!instruction) return null;
  const system = asString(rec.system)?.trim() || undefined;
  return { instruction, system };
}

/** Prompt: a instrução do runtime + (se houver) o input do run como contexto. */
export function buildGenericRuntimePrompt(
  spec: GenericRuntimeSpec,
  input: Record<string, unknown>,
): string {
  const parts = [spec.instruction];
  const userPrompt = (asString(input.prompt) ?? "").trim();
  if (userPrompt) parts.push(`Pedido:\n${userPrompt}`);

  // Contexto: `payload` explícito, ou o resto do input (sem o `prompt` já usado).
  const payload = asRecord(input.payload);
  const context = payload ?? (Object.keys(input).length > 0 ? { ...input } : null);
  if (context) {
    delete (context as Record<string, unknown>).prompt;
    if (Object.keys(context).length > 0) {
      parts.push(`Contexto (dados):\n${JSON.stringify(context, null, 2)}`);
    }
  }
  return parts.join("\n\n");
}

function scaffold(reason: string): string {
  return (
    "[runtime genérico: a IA não está configurada para esta organização. O " +
    "super-utilizador precisa de ligar um modelo à capacidade " +
    `"assistant.generic" na consola de IA. (motivo: ${reason})]`
  );
}

/* ----------------------------- entregável (v54) --------------------------- */
// O output de um generic ({ text, ai, runtime, generatedAt }) aterra na cloud do
// worker como um .md (tier work_document), tal como os built-in email.digest /
// report.monthly. É uma função PURA do output — testável sem rede. O pipeline de
// deliverable (runs.service) é agnóstico ao handler: basta declarar isto.

/** "custom.resumo" → "custom-resumo" (nome de ficheiro seguro). */
function slugifyRuntime(runtime: string): string {
  const s = runtime
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "runtime";
}

/** ISO → "2026-09-13-1435" (UTC, determinístico). Sem data válida → "sem-data". */
function stampOf(iso: string | null): string {
  if (!iso) return "sem-data";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "sem-data";
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `-${p(d.getUTCHours())}${p(d.getUTCMinutes())}`
  );
}

/**
 * Renderiza o output de um runtime GENERATED num .md — o entregável final
 * (work_document) que vai para a cloud do trabalhador. PURO (output → bytes).
 *
 * Devolve `null` quando não há nada útil a entregar — run em scaffold (a IA da
 * org não está configurada) ou texto vazio. Não polui a cloud com um placeholder.
 * O run continua verde; só não gera documento.
 *
 * SEM idempotencyKey de propósito: um generic não tem identidade estável de
 * documento (ao contrário do `report.monthly:<período>`), por isso cada run cria
 * o seu próprio ficheiro — o storage "cria sempre" e não sobrescreve histórico.
 */
export function renderGenericMarkdown(
  result: Record<string, unknown>,
): DeliverableDraft | null {
  const text = (asString(result.text) ?? "").trim();
  const ai = asRecord(result.ai);
  const usedAi = ai?.used === true;
  // Scaffold (IA não configurada) ou sem texto → nada a entregar.
  if (!text || !usedAi) return null;

  const runtime = asString(result.runtime) ?? "runtime";
  const generatedAt = asString(result.generatedAt) ?? null;

  const lines: string[] = [];
  lines.push(`# Resultado — ${runtime}`);
  lines.push("");
  lines.push(text);
  lines.push("");

  // Rodapé de proveniência: provider/modelo (a escolha de provider é a alavanca
  // de residência de dados — mesmo padrão do report.monthly).
  const provider = asString(ai?.provider);
  const model = asString(ai?.model);
  const label = [provider, model].filter(Boolean).join(" · ");
  lines.push(label ? `_Gerado por IA — ${label}._` : "_Gerado por IA._");
  if (generatedAt) lines.push(`_Gerado em ${generatedAt}._`);

  return {
    filename: `${slugifyRuntime(runtime)}-${stampOf(generatedAt)}.md`,
    mimeType: "text/markdown",
    bytes: new TextEncoder().encode(lines.join("\n")),
  };
}

/** Constrói o RunHandler de um runtime generated concreto (com o seu spec). */
function makeHandler(
  runtime: string,
  spec: GenericRuntimeSpec,
  resolver: LlmResolver | null,
  now: Now,
): RunHandler {
  async function run(ctx: ExecContext): Promise<Record<string, unknown>> {
    const prompt = buildGenericRuntimePrompt(spec, ctx.input);

    let adapter = null;
    if (resolver) {
      try {
        adapter = await resolver.resolve(ctx.orgId, GENERIC_CAPABILITY);
      } catch {
        adapter = null;
      }
    }

    if (!adapter) {
      const reason = resolver ? "no-provider" : "no-resolver";
      console.warn(
        `[generic:${runtime}] sem provider para "${GENERIC_CAPABILITY}" (org ${ctx.orgId}) — scaffold.`,
      );
      return {
        text: scaffold(reason),
        ai: { used: false, reason },
        runtime,
        generatedAt: now().toISOString(),
      };
    }

    // Erro do modelo (401/5xx) propaga-se — o classify() do motor decide
    // transitório/permanente (não mascara com scaffold, igual ao writing/generic).
    const out = await adapter.complete({
      system: spec.system ?? DEFAULT_GENERIC_SYSTEM,
      prompt,
      maxTokens: 1500,
    });
    console.info(
      `[generic:${runtime}] via ${adapter.provider} · ${adapter.model} (org ${ctx.orgId}).`,
    );
    return {
      text: out.text,
      ai: { used: true, provider: adapter.provider, model: adapter.model },
      runtime,
      generatedAt: now().toISOString(),
    };
  }

  return {
    runtime,
    // v54: aterra o output num .md na cloud do worker (automáticas via execute,
    // assistidas via stream — ambos os paths do runs.service chamam isto). Em
    // scaffold devolve null (não entrega placeholder).
    deliverable: renderGenericMarkdown,
    execute: run,
    async *stream(ctx: ExecContext): AsyncIterable<RunEvent> {
      yield { type: "progress", data: { pct: 10 } };
      if (ctx.signal.aborted) {
        yield { type: "error", data: { message: "sessão cancelada" } };
        return;
      }
      const result = await run(ctx);
      yield { type: "progress", data: { pct: 90 } };
      yield { type: "result", data: result };
    },
  };
}

/** Handler que falha PERMANENTE quando o spec de um generated é inválido. */
function invalidSpecHandler(runtime: string): RunHandler {
  const msg = `runtime generated "${runtime}" sem 'instruction' no spec.`;
  return {
    runtime,
    async execute(): Promise<Record<string, unknown>> {
      throw new PermanentError(msg);
    },
    async *stream(): AsyncIterable<RunEvent> {
      yield { type: "error", data: { message: msg } };
    },
  };
}

export function createGenericRuntimeResolver(
  deps: GenericRuntimeResolverDeps,
): GenericRuntimeResolver {
  const now = deps.now ?? (() => new Date());
  return {
    async resolve(runtime: string): Promise<RunHandler | null> {
      const entry = await deps.source.get(runtime);
      if (!entry || entry.kind !== "generic") return null; // só generated
      const spec = parseGenericSpec(entry.spec);
      if (!spec) return invalidSpecHandler(runtime);
      return makeHandler(runtime, spec, deps.resolver, now);
    },
  };
}
