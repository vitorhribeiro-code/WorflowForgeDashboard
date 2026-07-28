/**
 * InputProvider (porta do M7) que faz a aquisição de dados a montante do
 * handler `email.digest`: obtém um access token do worker (M6) e busca os
 * emails recentes ao Gmail, injetando-os como `input.emails`.
 *
 * Para os restantes runtimes é PASS-THROUGH (devolve o input tal como está),
 * mantendo os handlers puros e o comportamento inalterado. Se o run já trouxer
 * `emails` (ex.: trigger manual com payload de teste), respeita-o e NÃO chama o
 * Gmail — útil para validar sem rede.
 */

import type { InputAcquisitionContext, InputProvider } from "@/modules/runs/service/ports";
import type { WorkerTokenPort } from "@/modules/connections";
import type { AcquiredEmail, GmailFetchOptions } from "./gmail";

export interface GmailInputProviderDeps {
  tokens: WorkerTokenPort;
  fetchRecentEmails(accessToken: string, opts: GmailFetchOptions): Promise<AcquiredEmail[]>;
  now?: () => Date;
}

const EMAIL_DIGEST = "email.digest";

function currentPeriod(now: () => Date): string {
  const d = now();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Lê opções de aquisição da config da atribuição (todas opcionais).
function readOptions(config: Record<string, unknown> | null): GmailFetchOptions {
  const c = config ?? {};
  const opts: GmailFetchOptions = {};
  if (typeof c.maxResults === "number") opts.maxResults = c.maxResults;
  if (typeof c.query === "string") opts.query = c.query;
  if (typeof c.lookbackDays === "number") opts.lookbackDays = c.lookbackDays;
  else opts.lookbackDays = 7; // default: última semana
  return opts;
}

export function createGmailInputProvider(deps: GmailInputProviderDeps): InputProvider {
  const now = deps.now ?? (() => new Date());

  return {
    async resolve(ctx: InputAcquisitionContext): Promise<Record<string, unknown>> {
      if (ctx.runtime !== EMAIL_DIGEST) return ctx.base; // pass-through

      // Override manual: se o input já traz emails, não chama o Gmail.
      if (Array.isArray(ctx.base.emails)) {
        return { period: currentPeriod(now), ...ctx.base };
      }

      const token = await deps.tokens.getAccessToken(ctx.workerId, "google");
      if (!token) {
        // Sem conexão Google ligada → erro permanente (precisa de reautorizar).
        throw new Error("Sem conexão Google ligada para este trabalhador.");
      }

      const emails = await deps.fetchRecentEmails(token, readOptions(ctx.config));
      return {
        period: currentPeriod(now),
        ...ctx.base,
        emails,
      };
    },
  };
}
