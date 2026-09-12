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

import type { ExecContext, RunEvent, RunHandler } from "./handler";
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
