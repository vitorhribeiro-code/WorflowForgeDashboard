/**
 * Aquisição de emails via Gmail REST API (a montante do handler email.digest).
 *
 * Só LEITURA de metadados (From/Subject/Date + snippet) — alinhado ao scope
 * gmail.readonly do M6. Mapeia para a shape que o email.digest espera:
 *   { from, subject, receivedAt?, snippet? }
 *
 * Erros: HTTP 429/5xx e falhas de rede propagam como TRANSITÓRIOS (o motor faz
 * retry — ver classify()); 401/403 e outros propagam como PERMANENTES (exigem
 * reautorizar/intervenção). Não importamos as classes de erro do M7 para não
 * acoplar a plataforma ao módulo: marcamos os erros com `.status`/`.transient`,
 * que o classify() do motor entende.
 */

export interface AcquiredEmail {
  from: string;
  subject: string;
  receivedAt?: string;
  snippet?: string;
}

export interface GmailFetchOptions {
  /** Máximo de mensagens a trazer (default 25, teto 100). */
  maxResults?: number;
  /** Query Gmail (ex.: "is:unread", "from:cliente@x.pt"). */
  query?: string;
  /** Janela para trás em dias → adiciona `newer_than:Nd` à query. */
  lookbackDays?: number;
}

type FetchLike = typeof fetch;

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

function transient(message: string): Error {
  return Object.assign(new Error(message), { transient: true });
}

function withStatus(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
}

async function call(
  httpFetch: FetchLike,
  accessToken: string,
  url: string,
): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await httpFetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  } catch {
    // Falha de rede → transitório (retry).
    throw transient("Gmail inacessível.");
  }
  if (!res.ok) {
    // 429/5xx → transitório; 401/403/outros → permanente (via classify).
    throw withStatus(`Gmail respondeu ${res.status}.`, res.status);
  }
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

function buildQuery(opts: GmailFetchOptions): string {
  const parts: string[] = [];
  if (opts.query) parts.push(opts.query);
  if (opts.lookbackDays && opts.lookbackDays > 0) parts.push(`newer_than:${opts.lookbackDays}d`);
  return parts.join(" ").trim();
}

function headerValue(headers: unknown, name: string): string | undefined {
  if (!Array.isArray(headers)) return undefined;
  const lower = name.toLowerCase();
  for (const h of headers) {
    const rec = h as { name?: unknown; value?: unknown };
    if (typeof rec?.name === "string" && rec.name.toLowerCase() === lower) {
      return typeof rec.value === "string" ? rec.value : undefined;
    }
  }
  return undefined;
}

/** Converte o `internalDate` (ms epoch, string) do Gmail em ISO, se presente. */
function toReceivedAt(internalDate: unknown, dateHeader?: string): string | undefined {
  if (typeof internalDate === "string" && /^\d+$/.test(internalDate)) {
    return new Date(Number(internalDate)).toISOString();
  }
  return dateHeader;
}

export function createGmailAcquisition(httpFetch: FetchLike = fetch) {
  return {
    async fetchRecentEmails(
      accessToken: string,
      opts: GmailFetchOptions = {},
    ): Promise<AcquiredEmail[]> {
      const max = Math.min(Math.max(opts.maxResults ?? 25, 1), 100);
      const q = buildQuery(opts);

      const listUrl = new URL(`${GMAIL_BASE}/messages`);
      listUrl.searchParams.set("maxResults", String(max));
      if (q) listUrl.searchParams.set("q", q);

      const list = await call(httpFetch, accessToken, listUrl.toString());
      const ids = Array.isArray(list.messages)
        ? (list.messages as Array<{ id?: unknown }>)
            .map((m) => (typeof m.id === "string" ? m.id : null))
            .filter((x): x is string => x !== null)
        : [];

      const emails: AcquiredEmail[] = [];
      for (const id of ids) {
        const getUrl = new URL(`${GMAIL_BASE}/messages/${id}`);
        getUrl.searchParams.set("format", "metadata");
        for (const h of ["From", "Subject", "Date"]) {
          getUrl.searchParams.append("metadataHeaders", h);
        }
        const msg = await call(httpFetch, accessToken, getUrl.toString());
        const payload = (msg.payload as { headers?: unknown } | undefined) ?? {};
        const from = headerValue(payload.headers, "From");
        if (!from) continue; // sem remetente não é útil para o digest
        emails.push({
          from,
          subject: headerValue(payload.headers, "Subject") ?? "(sem assunto)",
          receivedAt: toReceivedAt(msg.internalDate, headerValue(payload.headers, "Date")),
          snippet: typeof msg.snippet === "string" ? msg.snippet : undefined,
        });
      }
      return emails;
    },
  };
}

export type GmailAcquisition = ReturnType<typeof createGmailAcquisition>;
