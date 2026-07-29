// Handlers built-in do M7, um por runtime conhecido (ver KNOWN_RUNTIMES no
// composition root). Seguem o contrato de handler.ts:
//   - automáticas: `execute(ctx)` devolve o output do run;
//   - assistidas:  `stream(ctx)` emite eventos em direto.
// São transformações PURAS sobre ctx.input/ctx.config (a aquisição de dados —
// ex.: buscar emails ao Gmail — é a montante, não aqui). Input inválido =>
// PermanentError (não se repete); falhas de serviços externos (quando existirem)
// => TransientError.
import type { DeliverableDraft, ExecContext, RunEvent, RunHandler } from "./handler";
import { PermanentError } from "../exec-errors";

type Now = () => Date;
const defaultNow: Now = () => new Date();

/* ----------------------------- coerção segura ---------------------------- */
// ctx.input/ctx.config são Record<string, unknown>: validamos à entrada.

function asArray(v: unknown): unknown[] | null {
  return Array.isArray(v) ? v : null;
}
function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/* ------------------------------ email.digest ----------------------------- */
// input:  { emails: Array<{ from, subject?, receivedAt?, snippet? }>, period? }
// config: { maxSubjectsPerSender?: number }
// output: { period, total, senders: [{ sender, count, subjects }], generatedAt }

interface EmailItem {
  from: string;
  subject: string;
  receivedAt?: string;
  snippet?: string;
}

function toEmailItem(v: unknown): EmailItem | null {
  const r = asRecord(v);
  if (!r) return null;
  const from = asString(r.from);
  if (!from) return null;
  return {
    from,
    subject: asString(r.subject) ?? "(sem assunto)",
    receivedAt: asString(r.receivedAt),
    snippet: asString(r.snippet),
  };
}

/**
 * Renderiza o output do email.digest num documento Markdown legível — o
 * entregável que vai para a cloud do trabalhador. PURO (output → bytes).
 */
export function renderEmailDigestMarkdown(result: Record<string, unknown>): DeliverableDraft {
  const period = asString(result.period) ?? null;
  const total = typeof result.total === "number" ? result.total : 0;
  const sendersRaw = asArray(result.senders) ?? [];
  const senders = sendersRaw
    .map((s) => {
      const r = asRecord(s);
      if (!r) return null;
      const sender = asString(r.sender);
      if (!sender) return null;
      const count = typeof r.count === "number" ? r.count : 0;
      const subjects = (asArray(r.subjects) ?? [])
        .map(asString)
        .filter((x): x is string => x !== undefined);
      return { sender, count, subjects };
    })
    .filter((x): x is { sender: string; count: number; subjects: string[] } => x !== null);

  const lines: string[] = [];
  lines.push(`# Resumo de emails${period ? ` — ${period}` : ""}`);
  lines.push("");
  lines.push(`**${total}** emails de **${senders.length}** remetentes.`);
  lines.push("");
  for (const s of senders) {
    lines.push(`## ${s.sender} (${s.count})`);
    if (s.subjects.length === 0) {
      lines.push("_sem assuntos registados_");
    } else {
      for (const subj of s.subjects) lines.push(`- ${subj}`);
    }
    lines.push("");
  }
  const generatedAt = asString(result.generatedAt);
  if (generatedAt) lines.push(`_Gerado em ${generatedAt}._`);

  const stamp = (period ?? generatedAt ?? "").slice(0, 10) || "sem-data";
  return {
    filename: `resumo-emails-${stamp}.md`,
    mimeType: "text/markdown",
    bytes: new TextEncoder().encode(lines.join("\n")),
  };
}

export function createEmailDigestHandler(now: Now = defaultNow): RunHandler {
  return {
    runtime: "email.digest",
    deliverable: renderEmailDigestMarkdown,
    async execute(ctx: ExecContext) {
      const rawEmails = asArray(ctx.input.emails);
      if (!rawEmails) {
        throw new PermanentError("email.digest: 'emails' tem de ser um array.");
      }
      ctx.emit({ type: "progress", data: { stage: "parsing", received: rawEmails.length } });

      const items = rawEmails
        .map(toEmailItem)
        .filter((x): x is EmailItem => x !== null);

      const cfg = asRecord(ctx.config) ?? {};
      const maxSubjects =
        typeof cfg.maxSubjectsPerSender === "number" && cfg.maxSubjectsPerSender > 0
          ? cfg.maxSubjectsPerSender
          : 5;

      const bySender = new Map<string, { count: number; subjects: string[] }>();
      for (const it of items) {
        const g = bySender.get(it.from) ?? { count: 0, subjects: [] };
        g.count += 1;
        if (g.subjects.length < maxSubjects) g.subjects.push(it.subject);
        bySender.set(it.from, g);
      }

      const senders = [...bySender.entries()]
        .map(([sender, g]) => ({ sender, count: g.count, subjects: g.subjects }))
        .sort((a, b) => b.count - a.count || a.sender.localeCompare(b.sender));

      ctx.emit({
        type: "log",
        data: { message: `${items.length} emails de ${senders.length} remetentes` },
      });

      return {
        period: asString(ctx.input.period) ?? null,
        total: items.length,
        senders,
        generatedAt: now().toISOString(),
      };
    },
  };
}

/* ----------------------------- report.monthly ---------------------------- */
// input:  { period: "YYYY-MM", sections?: Array<{ title, metrics: Record }> }
// output: { period, sections, summary, generatedAt }

const PERIOD_RE = /^\d{4}-\d{2}$/;

// Mês corrente em UTC (YYYY-MM), determinístico com o `now` injetado.
function periodOf(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function createReportMonthlyHandler(now: Now = defaultNow): RunHandler {
  return {
    runtime: "report.monthly",
    async execute(ctx: ExecContext) {
      // 'period' em falta ⇒ usa o mês corrente (deixa a automática ficar verde
      // sem exigir config). Presente mas malformado ⇒ erro permanente.
      const rawPeriod = asString(ctx.input.period);
      const period = rawPeriod && rawPeriod.length > 0 ? rawPeriod : periodOf(now());
      if (!PERIOD_RE.test(period)) {
        throw new PermanentError("report.monthly: 'period' deve ter o formato YYYY-MM.");
      }
      const rawSections = asArray(ctx.input.sections) ?? [];
      ctx.emit({ type: "progress", data: { stage: "compondo", sections: rawSections.length } });

      const sections = rawSections.map((s) => {
        const r = asRecord(s) ?? {};
        return {
          title: asString(r.title) ?? "(secção)",
          metrics: asRecord(r.metrics) ?? {},
        };
      });

      const metricCount = sections.reduce((n, s) => n + Object.keys(s.metrics).length, 0);
      ctx.emit({
        type: "log",
        data: { message: `${sections.length} secções, ${metricCount} métricas` },
      });

      return {
        period,
        sections,
        summary: { sections: sections.length, metrics: metricCount },
        generatedAt: now().toISOString(),
      };
    },
  };
}

/* --------------------------- assistant.generic --------------------------- */
// Tarefa assistida: sessão interativa com stream. Aqui a "inteligência" é um
// eco estruturado determinístico — é o ponto onde um LLM entra em Tier-2.
// input: { prompt?: string, payload?: Record }

function acknowledge(prompt: string, input: Record<string, unknown>): Record<string, unknown> {
  return {
    received: { prompt, payload: asRecord(input.payload) ?? {} },
    // Placeholder honesto: substituir por uma chamada a um LLM (Tier-2).
    note: "assistant.generic: scaffold determinístico — ligar a um LLM em Tier-2",
  };
}

export function createAssistantGenericHandler(now: Now = defaultNow): RunHandler {
  return {
    runtime: "assistant.generic",
    async execute(ctx: ExecContext) {
      const prompt = asString(ctx.input.prompt) ?? "";
      return { response: acknowledge(prompt, ctx.input), generatedAt: now().toISOString() };
    },
    async *stream(ctx: ExecContext): AsyncIterable<RunEvent> {
      const prompt = asString(ctx.input.prompt) ?? "";
      yield { type: "progress", data: { pct: 10 } };
      yield { type: "log", data: { message: `recebido: ${prompt.slice(0, 80)}` } };
      if (ctx.signal.aborted) {
        yield { type: "error", data: { message: "sessão cancelada" } };
        return;
      }
      yield { type: "progress", data: { pct: 90 } };
      yield { type: "result", data: { response: acknowledge(prompt, ctx.input) } };
    },
  };
}

/* ------------------------------- instâncias ------------------------------ */
export const emailDigestHandler = createEmailDigestHandler();
export const reportMonthlyHandler = createReportMonthlyHandler();
export const assistantGenericHandler = createAssistantGenericHandler();

/** Registo por defeito, na ordem dos runtimes conhecidos. */
export const builtinHandlers: RunHandler[] = [
  emailDigestHandler,
  reportMonthlyHandler,
  assistantGenericHandler,
];
