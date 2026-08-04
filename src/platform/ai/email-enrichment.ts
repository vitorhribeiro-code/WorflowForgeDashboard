/**
 * Enriquecimento de emails por IA — a montante do handler `email.digest`
 * (§5.2 fase 3). É um DECORATOR de InputProvider: primeiro delega na aquisição
 * (ex.: Gmail), depois — se o runtime mapeia para uma capacidade de IA e há
 * `emails` — dá a cada email um `resumo`.
 *
 * Contrato:
 *   - UMA chamada ao modelo por corrida (summarizeBatch), com teto de itens.
 *   - FALLBACK sempre garantido: cada email fica com `resumo = snippet ?? subject`
 *     mesmo sem IA; a IA só melhora esse resumo. Uma falha do modelo NÃO parte o
 *     run — cai no fallback.
 *   - O handler continua PURO: só recebe emails já com `resumo`. A escolha de
 *     provider (alavanca RGPD) fica registada em `input.aiSummary` para o
 *     processRun auditar.
 */

import type { InputAcquisitionContext, InputProvider } from "@/modules/runs/service/ports";
import { capabilityForRuntime } from "@/modules/ai/domain/capability";
import type { LlmResolver } from "@/modules/ai/service/resolver";
import type { LlmSummarizeItem } from "./port";

export interface EmailEnrichmentDeps {
  resolver: LlmResolver;
  inner: InputProvider;
  /** Teto de emails a resumir por corrida (custo/latência). Default 50. */
  maxItems?: number;
  /** Teto de palavras por resumo. Default 25. */
  maxWords?: number;
}

type EmailRecord = Record<string, unknown> & {
  from?: unknown;
  subject?: unknown;
  snippet?: unknown;
  resumo?: unknown;
};

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

// Fallback honesto: resumo = resumo existente ?? snippet ?? subject.
function withFallbackResumo(email: EmailRecord): Record<string, unknown> {
  const existing = asString(email.resumo);
  const snippet = asString(email.snippet);
  const subject = asString(email.subject);
  const resumo = existing ?? snippet ?? subject;
  return resumo !== undefined ? { ...email, resumo } : { ...email };
}

// Texto que alimenta o modelo: assunto + snippet (o que há de mais informativo).
function textFor(email: Record<string, unknown>): string {
  const subject = asString(email.subject) ?? "";
  const snippet = asString(email.snippet) ?? "";
  return [subject, snippet].filter(Boolean).join(" — ").slice(0, 2000);
}

export function createEmailEnrichmentProvider(deps: EmailEnrichmentDeps): InputProvider {
  const maxItems = deps.maxItems && deps.maxItems > 0 ? deps.maxItems : 50;
  const maxWords = deps.maxWords && deps.maxWords > 0 ? deps.maxWords : 25;

  return {
    async resolve(ctx: InputAcquisitionContext): Promise<Record<string, unknown>> {
      const input = await deps.inner.resolve(ctx);

      const capability = capabilityForRuntime(ctx.runtime);
      if (!capability) return input; // runtime sem IA → pass-through

      const rawEmails = input.emails;
      if (!Array.isArray(rawEmails) || rawEmails.length === 0) return input;

      // Fallback aplicado a todos, sempre (garante o campo `resumo`).
      const emails = rawEmails.map((e) =>
        withFallbackResumo((e ?? {}) as EmailRecord),
      );

      // Resolve o adapter da org para esta capacidade; null → só fallback.
      let adapter = null;
      try {
        adapter = await deps.resolver.resolve(ctx.orgId, capability);
      } catch {
        adapter = null;
      }
      if (!adapter) {
        console.warn(
          `[ai-enrichment] sem provider para "${capability}" (org ${ctx.orgId}) — fallback ao snippet/assunto.`,
        );
        return { ...input, emails, aiSummary: { used: false, reason: "no-provider" } };
      }

      // Uma só chamada em batch, com teto (os restantes ficam com o fallback).
      const targets = emails.slice(0, maxItems);
      const items: LlmSummarizeItem[] = targets.map((e, i) => ({
        id: String(i),
        text: textFor(e),
      }));

      try {
        const summaries = await adapter.summarizeBatch(items, { maxWords });
        const byId = new Map(summaries.map((s) => [s.id, s.summary]));
        const enriched = emails.map((e, i) => {
          const ai = byId.get(String(i));
          return ai ? { ...e, resumo: ai } : e; // senão fica o fallback
        });
        console.info(
          `[ai-enrichment] ${byId.size}/${items.length} resumos via ${adapter.provider} · ${adapter.model} (org ${ctx.orgId}).`,
        );
        return {
          ...input,
          emails: enriched,
          aiSummary: {
            used: true,
            provider: adapter.provider,
            model: adapter.model,
            count: byId.size,
          },
        };
      } catch (err) {
        // Falha do modelo → fallback (o run continua verde). Loga a razão real
        // (ex.: "Mistral respondeu 401." / id de modelo inválido) para diagnóstico.
        const reason = err instanceof Error ? err.message : String(err);
        console.warn(
          `[ai-enrichment] falha no modelo ${adapter.provider} · ${adapter.model} (org ${ctx.orgId}) — fallback: ${reason}`,
        );
        return { ...input, emails, aiSummary: { used: false, reason: "error" } };
      }
    },
  };
}
