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
import type { LlmResolver } from "@/modules/ai/service/resolver";

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
// output: { period, total, senders: [{ sender, count, subjects, lastReceivedAt? }], generatedAt }

interface EmailItem {
  from: string;
  subject: string;
  receivedAt?: string;
  snippet?: string;
  resumo?: string;
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
    resumo: asString(r.resumo),
  };
}

/* --------------------------- presentação (puro) -------------------------- */
// Meses PT para datas determinísticas em UTC (sem depender de locale/fuso do
// runtime — o mesmo output tem de dar sempre o mesmo Markdown).

const MONTHS_PT_ABBR = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];
const MONTHS_PT_FULL = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** "1 email" / "2 emails" — plural simples (o plural PT aqui é só +s). */
function plural(n: number, singular: string): string {
  return `${n} ${n === 1 ? singular : `${singular}s`}`;
}

/** ISO → "29 jul 2026" (UTC). null se a data não parsear. */
function fmtDatePt(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCDate()} ${MONTHS_PT_ABBR[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "2026-07" → "julho 2026"; qualquer outra coisa devolve-se tal e qual. */
function prettyPeriod(period: string | null): string | null {
  if (!period) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return period;
  const month = Number(m[2]) - 1;
  if (month < 0 || month > 11) return period;
  return `${MONTHS_PT_FULL[month]} ${m[1]}`;
}

/**
 * Extrai um nome legível de um cabeçalho From.
 *   'João Silva <joao@x.pt>'   → 'João Silva'
 *   '"Silva, João" <j@x.pt>'   → 'Silva, João'  (tira aspas envolventes)
 *   '<joao@x.pt>' / 'joao@x.pt' → 'joao@x.pt'    (sem nome → o email)
 */
function displayName(from: string): string {
  const trimmed = from.trim();
  const m = /^(.*?)<([^>]+)>\s*$/.exec(trimmed);
  if (m) {
    const email = (m[2] ?? "").trim();
    const name = (m[1] ?? "").trim().replace(/^"(.*)"$/, "$1").trim();
    return name || email;
  }
  return trimmed;
}

/**
 * Renderiza o output do email.digest num documento Markdown legível — o
 * entregável que vai para a cloud do trabalhador. PURO (output → bytes).
 *
 * Layout A: cabeçalho com período legível + subtítulo com totais e data; um
 * bloco compacto por remetente (nome legível · nº · data do mais recente) com
 * os assuntos numa só linha separados por " · ".
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
      const resumos = (asArray(r.resumos) ?? [])
        .map(asString)
        .filter((x): x is string => x !== undefined);
      const lastReceivedAt = asString(r.lastReceivedAt);
      return { sender, count, subjects, resumos, lastReceivedAt };
    })
    .filter(
      (
        x,
      ): x is {
        sender: string;
        count: number;
        subjects: string[];
        resumos: string[];
        lastReceivedAt: string | undefined;
      } => x !== null,
    );

  const generatedAt = asString(result.generatedAt);
  const headerDate = fmtDatePt(generatedAt);

  const lines: string[] = [];
  lines.push(`# Resumo de emails${period ? ` — ${prettyPeriod(period)}` : ""}`);
  lines.push("");
  // Subtítulo compacto: totais · data (a data só entra se parseável).
  const meta = [plural(total, "email"), plural(senders.length, "remetente")];
  if (headerDate) meta.push(headerDate);
  lines.push(meta.join(" · "));
  lines.push("");

  for (const s of senders) {
    const name = displayName(s.sender);
    const date = fmtDatePt(s.lastReceivedAt);
    const head = [`${name} — ${s.count}`, date].filter(Boolean).join(" · ");
    lines.push(`## ${head}`);
    if (s.resumos.length > 0) {
      // Resumos por IA: um por linha (mais informativo que os assuntos).
      for (const r of s.resumos) lines.push(`- ${r}`);
      if (s.count > s.resumos.length) lines.push("- …");
    } else if (s.subjects.length === 0) {
      lines.push("_sem assuntos_");
    } else {
      // "…" honesto: houve mais emails do que assuntos listados (cap por config).
      const more = s.count > s.subjects.length ? " · …" : "";
      lines.push(s.subjects.join(" · ") + more);
    }
    lines.push("");
  }

  // Rodapé RGPD: quando os resumos vieram de IA, deixa rasto do provider/modelo
  // (a escolha de provider — ex.: Mistral EU — é a alavanca de residência de dados).
  const ai = asRecord(result.ai);
  if (ai && ai.used === true) {
    const provider = asString(ai.provider);
    const model = asString(ai.model);
    const label = [provider, model].filter(Boolean).join(" · ");
    lines.push(label ? `_Resumos por IA — ${label}._` : "_Resumos por IA._");
  }

  if (generatedAt) lines.push(`_Gerado em ${generatedAt}._`);

  const stamp = (period ?? generatedAt ?? "").slice(0, 10) || "sem-data";
  return {
    filename: `resumo-emails-${stamp}.md`,
    mimeType: "text/markdown",
    bytes: new TextEncoder().encode(lines.join("\n")),
    // Mesmo período → mesmo documento: o storage reescreve em vez de duplicar.
    idempotencyKey: `email.digest:${period ?? "sem-periodo"}`,
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

      const bySender = new Map<
        string,
        { count: number; subjects: string[]; resumos: string[]; lastReceivedAt?: string }
      >();
      for (const it of items) {
        const g = bySender.get(it.from) ?? { count: 0, subjects: [], resumos: [] };
        g.count += 1;
        if (g.subjects.length < maxSubjects) g.subjects.push(it.subject);
        if (it.resumo && g.resumos.length < maxSubjects) g.resumos.push(it.resumo);
        // ISO em UTC compara lexicograficamente = cronologicamente → max simples.
        if (it.receivedAt && (!g.lastReceivedAt || it.receivedAt > g.lastReceivedAt)) {
          g.lastReceivedAt = it.receivedAt;
        }
        bySender.set(it.from, g);
      }

      const senders = [...bySender.entries()]
        .map(([sender, g]) => ({
          sender,
          count: g.count,
          subjects: g.subjects,
          // Aditivo: só inclui `resumos` quando algum email trouxe resumo, para
          // manter o output idêntico ao anterior quando não há IA a montante.
          ...(g.resumos.length > 0 ? { resumos: g.resumos } : {}),
          lastReceivedAt: g.lastReceivedAt,
        }))
        .sort((a, b) => b.count - a.count || a.sender.localeCompare(b.sender));

      ctx.emit({
        type: "log",
        data: { message: `${items.length} emails de ${senders.length} remetentes` },
      });

      // Meta de IA (se o enriquecimento a montante correu) — carregado para o
      // output para o renderer o mostrar e o processRun o auditar. Passthrough puro.
      const ai = asRecord(ctx.input.aiSummary);

      return {
        period: asString(ctx.input.period) ?? null,
        total: items.length,
        // Lista por email (para a vista tipo caixa de entrada). Aditivo: o
        // `senders` agregado e o entregável .md continuam iguais. Teto para não
        // inflar o output guardado do run.
        emails: items.slice(0, 200).map((e) => ({
          from: e.from,
          subject: e.subject,
          receivedAt: e.receivedAt ?? null,
          resumo: e.resumo ?? e.snippet ?? null,
        })),
        senders,
        ...(ai ? { ai } : {}),
        generatedAt: now().toISOString(),
      };
    },
  };
}

/* ----------------------------- report.monthly ---------------------------- */
// input:  { period: "YYYY-MM", sections?: Array<{ title, metrics: Record }> }
// output: { period, sections, summary, narrative, ai:{ used, provider?, model?, reason? }, generatedAt }
//
// Automática (v47). Mantém a AGREGAÇÃO determinística (period, sections, summary)
// como base factual e ACRESCENTA uma narrativa composta por IA (capacidade
// `report.compose`) a partir dessa base — em vez de devolver só a agregação crua.
// Mesmo contrato dos assistidos (§5.3, nota de coerência):
//   - sem adapter (org sem binding/modelo, ou plataforma sem ENCRYPTION_KEY) →
//     narrativa-scaffold honesta, `ai:{used:false, reason}`, run VERDE;
//   - com adapter → `complete(...)` → narrativa real, `ai:{used:true, provider, model}`;
//   - erro do modelo (401/5xx) → RE-LANÇA (não mascara com scaffold).
// A narrativa NÃO inventa números: o prompt só transporta as métricas agregadas.

const PERIOD_RE = /^\d{4}-\d{2}$/;
const REPORT_CAPABILITY = "report.compose";

const REPORT_SYSTEM =
  "És um analista que redige relatórios mensais. A partir das métricas fornecidas, " +
  "escreves um resumo executivo claro e conciso em português europeu: um parágrafo de " +
  "visão geral seguido de uma linha por secção com o que se destaca. Usas apenas os " +
  "dados dados — não inventas números nem secções. Sem preâmbulos nem formatação supérflua.";

// Mês corrente em UTC (YYYY-MM), determinístico com o `now` injetado.
function periodOf(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

interface ReportSection {
  title: string;
  metrics: Record<string, unknown>;
}

// Verte o período + as secções/métricas agregadas para texto legível — a ÚNICA
// fonte de factos que o modelo vê (não inventa números fora daqui).
function buildReportPrompt(period: string, sections: ReportSection[]): string {
  const lines = [`Período: ${period}`, ""];
  if (sections.length === 0) {
    lines.push("(sem secções com dados neste período)");
  } else {
    for (const s of sections) {
      lines.push(`Secção: ${s.title}`);
      const entries = Object.entries(s.metrics);
      if (entries.length === 0) lines.push("  (sem métricas)");
      for (const [k, v] of entries) lines.push(`  - ${k}: ${String(v)}`);
      lines.push("");
    }
  }
  lines.push("Redige o relatório mensal a partir destes dados.");
  return lines.join("\n");
}

// Narrativa honesta quando não há IA configurada — mantém o run verde e diz o
// que falta, sem fingir um relatório real (a agregação segue no output).
function reportScaffold(period: string, reason: string): string {
  return (
    `[relatório mensal (${period}): a IA não está configurada para esta organização. ` +
    "O super-utilizador precisa de ligar um modelo à capacidade " +
    `\"report.compose\" na consola de IA. Segue a agregação de métricas em bruto. ` +
    `(motivo: ${reason})]`
  );
}

/**
 * Renderiza o output do report.monthly num documento Markdown — o entregável
 * (work_document) que aterra na cloud do trabalhador (Dropbox/Drive via M6/M8).
 * PURO (output → bytes). A narrativa por IA abre o documento; a agregação
 * determinística (secções + métricas) segue por baixo como base auditável.
 */
export function renderReportMonthlyMarkdown(result: Record<string, unknown>): DeliverableDraft {
  const period = asString(result.period) ?? null;
  const narrative = asString(result.narrative) ?? "";
  const sectionsRaw = asArray(result.sections) ?? [];
  const sections = sectionsRaw
    .map((s) => {
      const r = asRecord(s);
      if (!r) return null;
      const title = asString(r.title) ?? "(secção)";
      const metrics = asRecord(r.metrics) ?? {};
      return { title, metrics };
    })
    .filter((x): x is { title: string; metrics: Record<string, unknown> } => x !== null);

  const summary = asRecord(result.summary);
  const nSections = summary && typeof summary.sections === "number" ? summary.sections : sections.length;
  const nMetrics =
    summary && typeof summary.metrics === "number"
      ? summary.metrics
      : sections.reduce((n, s) => n + Object.keys(s.metrics).length, 0);

  const generatedAt = asString(result.generatedAt);
  const headerDate = fmtDatePt(generatedAt);

  const lines: string[] = [];
  lines.push(`# Relatório mensal${period ? ` — ${prettyPeriod(period)}` : ""}`);
  lines.push("");
  // "secção" pluraliza para "secções" (irregular), por isso não usa o plural()
  // simples (que só acrescenta "s"). "métrica" → "métricas" é regular.
  const meta = [`${nSections} ${nSections === 1 ? "secção" : "secções"}`, plural(nMetrics, "métrica")];
  if (headerDate) meta.push(headerDate);
  lines.push(meta.join(" · "));
  lines.push("");

  if (narrative.trim().length > 0) {
    lines.push(narrative.trim());
    lines.push("");
  }

  for (const s of sections) {
    lines.push(`## ${s.title}`);
    const entries = Object.entries(s.metrics);
    if (entries.length === 0) {
      lines.push("_sem métricas_");
    } else {
      for (const [k, v] of entries) lines.push(`- ${k}: ${String(v)}`);
    }
    lines.push("");
  }

  // Rodapé de proveniência: quando a narrativa veio de IA, deixa rasto do
  // provider/modelo (a escolha de provider é a alavanca de residência de dados).
  const ai = asRecord(result.ai);
  if (ai && ai.used === true) {
    const provider = asString(ai.provider);
    const model = asString(ai.model);
    const label = [provider, model].filter(Boolean).join(" · ");
    lines.push(label ? `_Narrativa por IA — ${label}._` : "_Narrativa por IA._");
  }
  if (generatedAt) lines.push(`_Gerado em ${generatedAt}._`);

  const stamp = period ?? ((generatedAt ?? "").slice(0, 7) || "sem-periodo");
  return {
    filename: `relatorio-mensal-${stamp}.md`,
    mimeType: "text/markdown",
    bytes: new TextEncoder().encode(lines.join("\n")),
    // Mesmo período → mesmo documento: o storage reescreve em vez de duplicar.
    idempotencyKey: `report.monthly:${period ?? "sem-periodo"}`,
  };
}

export interface ReportMonthlyDeps {
  // null quando a plataforma não tem ENCRYPTION_KEY (sem IA) — sempre fallback.
  resolver: LlmResolver | null;
  now?: Now;
}

export function createReportMonthlyHandler(deps: ReportMonthlyDeps): RunHandler {
  const now = deps.now ?? defaultNow;

  return {
    runtime: "report.monthly",
    // Entregável final (work_document): narrativa + agregação num .md que aterra
    // na cloud do worker (Dropbox/Drive, M6/M8). Como o email.digest, o
    // deliverable é o objetivo — se não houver cloud ligada, o motor classifica
    // o run (o gate de prontidão do M5 garante a conexão antes de ativar).
    deliverable: renderReportMonthlyMarkdown,
    async execute(ctx: ExecContext) {
      // 'period' em falta ⇒ usa o mês corrente (deixa a automática ficar verde
      // sem exigir config). Presente mas malformado ⇒ erro permanente.
      const rawPeriod = asString(ctx.input.period);
      const period = rawPeriod && rawPeriod.length > 0 ? rawPeriod : periodOf(now());
      if (!PERIOD_RE.test(period)) {
        throw new PermanentError("report.monthly: 'period' deve ter o formato YYYY-MM.");
      }
      const rawSections = asArray(ctx.input.sections) ?? [];
      ctx.emit({ type: "progress", data: { stage: "agregando", sections: rawSections.length } });

      const sections: ReportSection[] = rawSections.map((s) => {
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

      // Base determinística: preservada tal e qual (o narrativa/ai é aditivo).
      const base = {
        period,
        sections,
        summary: { sections: sections.length, metrics: metricCount },
      };

      // Composição por IA a partir da agregação. Resolve o adapter da org; null → scaffold.
      let adapter = null;
      if (deps.resolver) {
        try {
          adapter = await deps.resolver.resolve(ctx.orgId, REPORT_CAPABILITY);
        } catch {
          adapter = null;
        }
      }

      if (!adapter) {
        const reason = deps.resolver ? "no-provider" : "no-resolver";
        console.warn(
          `[report.monthly] sem provider para "${REPORT_CAPABILITY}" (org ${ctx.orgId}) — scaffold.`,
        );
        return {
          ...base,
          narrative: reportScaffold(period, reason),
          ai: { used: false, reason },
          generatedAt: now().toISOString(),
        };
      }

      // Erro do modelo propaga-se (transient/permanent via classify do motor).
      ctx.emit({ type: "progress", data: { stage: "compondo" } });
      const out = await adapter.complete({
        system: REPORT_SYSTEM,
        prompt: buildReportPrompt(period, sections),
        maxTokens: 1200,
      });
      console.info(
        `[report.monthly] narrativa via ${adapter.provider} · ${adapter.model} (org ${ctx.orgId}).`,
      );
      return {
        ...base,
        narrative: out.text,
        ai: { used: true, provider: adapter.provider, model: adapter.model },
        generatedAt: now().toISOString(),
      };
    },
  };
}

/* --------------------------- assistant.generic --------------------------- */
// Tarefa assistida genérica (v46). A "inteligência" é DENTRO do handler: resolve
// o adapter da org para a capacidade `assistant.generic` e chama `complete`. É o
// gémeo do assistant.writing (§5.4 opção a), sem os modos/tons de escrita: recebe
// um prompt livre do trabalhador e devolve o texto do modelo.
//   input:  { prompt: string, payload?: Record }  // payload = contexto opcional
//   output: { text, ai:{ used, provider?, model?, reason? }, generatedAt }
//
// Fallback: sem adapter (org sem binding/modelo) → texto-scaffold honesto que diz
// que a IA não está configurada, e o run fica verde (o worker vê a nota). Erro do
// modelo (401/5xx) → RE-LANÇA (não mascara com scaffold — igual ao writing).

const GENERIC_CAPABILITY = "assistant.generic";

const GENERIC_SYSTEM =
  "És um assistente genérico. Respondes de forma útil, clara e direta, em " +
  "português europeu, sem preâmbulos nem formatação desnecessária.";

// Prompt do utilizador: o pedido livre + (se houver) o payload como contexto.
function buildGenericPrompt(input: Record<string, unknown>): string {
  const prompt = (asString(input.prompt) ?? "").trim();
  const payload = asRecord(input.payload);
  if (payload && Object.keys(payload).length > 0) {
    return `${prompt}\n\nContexto (dados):\n${JSON.stringify(payload, null, 2)}`;
  }
  return prompt;
}

// Scaffold honesto quando não há IA configurada — mantém o run verde e diz o que
// falta, em vez de fingir uma resposta real.
function genericScaffold(reason: string): string {
  return (
    "[assistente genérico: a IA não está configurada para esta organização. " +
    "O super-utilizador precisa de ligar um modelo à capacidade " +
    `\"assistant.generic\" na consola de IA. (motivo: ${reason})]`
  );
}

export interface AssistantGenericDeps {
  // null quando a plataforma não tem ENCRYPTION_KEY (sem IA) — sempre fallback.
  resolver: LlmResolver | null;
  now?: Now;
}

export function createAssistantGenericHandler(deps: AssistantGenericDeps): RunHandler {
  const now = deps.now ?? defaultNow;

  async function run(ctx: ExecContext): Promise<Record<string, unknown>> {
    // Validação de input → PermanentError (não se repete).
    if (!(asString(ctx.input.prompt) ?? "").trim()) {
      throw new PermanentError("assistant.generic: 'prompt' é obrigatório.");
    }

    const prompt = buildGenericPrompt(ctx.input);

    // Resolve o adapter da org para a capacidade genérica. null → scaffold.
    let adapter = null;
    if (deps.resolver) {
      try {
        adapter = await deps.resolver.resolve(ctx.orgId, GENERIC_CAPABILITY);
      } catch {
        adapter = null;
      }
    }

    if (!adapter) {
      const reason = deps.resolver ? "no-provider" : "no-resolver";
      console.warn(
        `[assistant.generic] sem provider para "${GENERIC_CAPABILITY}" (org ${ctx.orgId}) — scaffold.`,
      );
      return {
        text: genericScaffold(reason),
        ai: { used: false, reason },
        generatedAt: now().toISOString(),
      };
    }

    // Erro do modelo propaga-se (transient/permanent via classify do motor).
    const out = await adapter.complete({ system: GENERIC_SYSTEM, prompt, maxTokens: 1500 });
    console.info(
      `[assistant.generic] resposta via ${adapter.provider} · ${adapter.model} (org ${ctx.orgId}).`,
    );
    return {
      text: out.text,
      ai: { used: true, provider: adapter.provider, model: adapter.model },
      generatedAt: now().toISOString(),
    };
  }

  return {
    runtime: "assistant.generic",
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

/* --------------------------- assistant.writing --------------------------- */
// Agente de escrita assistido (§5.4, opção a). A "inteligência" é DENTRO do
// handler: resolve o adapter da org e chama `complete`. Dois modos e um tom.
//   input: {
//     mode: "fim" | "resposta",
//     tone: "formal" | "informal" | "familiar" | "meu",
//     brief?: string,        // mode=fim: assunto/objetivo
//     sourceText?: string,   // mode=resposta: texto a que se responde
//     instruction?: string,  // mode=resposta: como responder (opcional)
//     style?: string,        // conteúdo do .md do utilizador (injetado a
//                            //   montante na Fatia 3; ausente na Fatia 1)
//   }
//   output: { text, mode, tone, ai:{ used, provider?, model?, reason? }, generatedAt }
//
// Fallback: sem adapter (org sem binding/modelo) → texto-scaffold honesto que
// diz que a IA não está configurada, e o run fica verde (o worker vê a nota).
// Erro do modelo (401/5xx) → RE-LANÇA: um erro real deve ser visível/retentado,
// não mascarado por um scaffold que o worker poderia enviar como se fosse texto.

const WRITING_CAPABILITY = "assistant.writing";
const WRITING_MODES = ["fim", "resposta"] as const;
const WRITING_TONES = ["formal", "informal", "familiar", "meu"] as const;
type WritingMode = (typeof WRITING_MODES)[number];
type WritingTone = (typeof WRITING_TONES)[number];

const SYSTEM_BASE =
  "És um assistente de escrita. Produzes apenas o texto final pedido, em " +
  "português europeu, sem preâmbulos, sem explicações e sem marcas de formatação.";

const TONE_INSTRUCTION: Record<Exclude<WritingTone, "meu">, string> = {
  formal:
    "Escreve num registo formal e profissional: frases claras e corteses, sem gíria.",
  informal:
    "Escreve num registo informal mas cuidado: tom próximo e natural, sem ser demasiado coloquial.",
  familiar:
    "Escreve num registo familiar e coloquial, como quem fala com alguém próximo.",
};

function coerceMode(v: unknown): WritingMode {
  return WRITING_MODES.includes(v as WritingMode) ? (v as WritingMode) : "fim";
}

// Tom "meu" só é válido se houver estilo; senão cai para "informal" (a UI já
// bloqueia esta escolha, mas o handler não confia no cliente).
function coerceTone(v: unknown, hasStyle: boolean): WritingTone {
  const t = WRITING_TONES.includes(v as WritingTone) ? (v as WritingTone) : "informal";
  return t === "meu" && !hasStyle ? "informal" : t;
}

function buildSystemPrompt(tone: WritingTone, style: string | undefined): string {
  if (tone === "meu" && style) {
    return (
      `${SYSTEM_BASE} Imita fielmente a voz do utilizador descrita abaixo — ` +
      `vocabulário, ritmo e expressões características.\n\n` +
      `--- ESTILO DO UTILIZADOR ---\n${style}\n--- FIM DO ESTILO ---`
    );
  }
  const key = (tone === "meu" ? "informal" : tone) as Exclude<WritingTone, "meu">;
  return `${SYSTEM_BASE} ${TONE_INSTRUCTION[key]}`;
}

function buildUserPrompt(
  mode: WritingMode,
  input: Record<string, unknown>,
): string {
  if (mode === "resposta") {
    const source = (asString(input.sourceText) ?? "").trim();
    const instruction = (asString(input.instruction) ?? "").trim();
    const parts = [`Texto recebido:\n"""\n${source}\n"""`];
    if (instruction) parts.push(`Instrução para a resposta: ${instruction}`);
    parts.push("Escreve a resposta.");
    return parts.join("\n\n");
  }
  const brief = (asString(input.brief) ?? "").trim();
  return `Objetivo do texto:\n${brief}`;
}

// Scaffold honesto quando não há IA configurada — mantém o run verde e diz o
// que falta, em vez de fingir texto real.
function writingScaffold(reason: string): string {
  return (
    "[assistente de escrita: a IA não está configurada para esta organização. " +
    "O super-utilizador precisa de ligar um modelo à capacidade " +
    `\"assistant.writing\" na consola de IA. (motivo: ${reason})]`
  );
}

export interface AssistantWritingDeps {
  // null quando a plataforma não tem ENCRYPTION_KEY (sem IA) — sempre fallback.
  resolver: LlmResolver | null;
  now?: Now;
}

export function createAssistantWritingHandler(deps: AssistantWritingDeps): RunHandler {
  const now = deps.now ?? defaultNow;

  async function run(ctx: ExecContext): Promise<Record<string, unknown>> {
    const mode = coerceMode(ctx.input.mode);
    const style = asString(ctx.input.style);
    const tone = coerceTone(ctx.input.tone, style !== undefined && style.length > 0);

    // Validação de input → PermanentError (não se repete).
    if (mode === "fim" && !(asString(ctx.input.brief) ?? "").trim()) {
      throw new PermanentError("assistant.writing: 'brief' é obrigatório no modo 'fim'.");
    }
    if (mode === "resposta" && !(asString(ctx.input.sourceText) ?? "").trim()) {
      throw new PermanentError(
        "assistant.writing: 'sourceText' é obrigatório no modo 'resposta'.",
      );
    }

    const system = buildSystemPrompt(tone, style);
    const prompt = buildUserPrompt(mode, ctx.input);

    // Resolve o adapter da org para a capacidade de escrita. null → scaffold.
    let adapter = null;
    if (deps.resolver) {
      try {
        adapter = await deps.resolver.resolve(ctx.orgId, WRITING_CAPABILITY);
      } catch {
        adapter = null;
      }
    }

    if (!adapter) {
      const reason = deps.resolver ? "no-provider" : "no-resolver";
      console.warn(
        `[assistant.writing] sem provider para "${WRITING_CAPABILITY}" (org ${ctx.orgId}) — scaffold.`,
      );
      return {
        text: writingScaffold(reason),
        mode,
        tone,
        ai: { used: false, reason },
        generatedAt: now().toISOString(),
      };
    }

    // Erro do modelo propaga-se (transient/permanent via classify do motor).
    const out = await adapter.complete({ system, prompt, maxTokens: 1500 });
    console.info(
      `[assistant.writing] texto via ${adapter.provider} · ${adapter.model} (org ${ctx.orgId}, modo ${mode}, tom ${tone}).`,
    );
    return {
      text: out.text,
      mode,
      tone,
      ai: { used: true, provider: adapter.provider, model: adapter.model },
      generatedAt: now().toISOString(),
    };
  }

  return {
    runtime: "assistant.writing",
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

/* ------------------------------- instâncias ------------------------------ */
// Só os handlers PUROS (sem deps) são instanciados aqui. O report.monthly (v47),
// o assistant.generic (v46) e o assistant.writing recebem o resolver de IA e são
// montados no container (M7) com deps.
export const emailDigestHandler = createEmailDigestHandler();

/** Registo por defeito (handlers puros), na ordem dos runtimes conhecidos. */
export const builtinHandlers: RunHandler[] = [
  emailDigestHandler,
];
