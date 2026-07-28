// Helpers HTTP do M7. Segue o padrão por-módulo do resto do repo (uma cópia por
// módulo; fundir numa só no repo real — handoff §9). `badInput` fica exposto à
// parte porque a rota SSE assistida o usa fora do withSession (por streaming).
import type { ZodType } from "zod";
import { DomainError, toHttp } from "@/lib/errors";
import { getSession, type SessionContext } from "@/lib/session";

export type RouteCtx = { params: Record<string, string> };

export function badInput(details: unknown): Response {
  return new Response(JSON.stringify({ error: { code: "BAD_INPUT", details } }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
}

export function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new DomainError("BAD_INPUT", "Parâmetros inválidos", 400, r.error.flatten());
  }
  return r.data;
}

export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    // Corpo vazio é aceitável para triggers sem payload: valida {}.
    body = {};
  }
  return parse(schema, body);
}

/** Lê um parâmetro de rota obrigatório do ctx (ex.: [id], [assignmentId]). */
export function param(ctx: RouteCtx, key: string): string {
  const v = ctx.params[key];
  if (!v) throw new DomainError("BAD_INPUT", `${key} em falta`, 400);
  return v;
}

export function withSession(
  fn: (session: SessionContext, req: Request, ctx: RouteCtx) => Promise<Response>,
) {
  return async (req: Request, ctx: RouteCtx = { params: {} }): Promise<Response> => {
    try {
      const session = await getSession(req);
      return await fn(session, req, ctx);
    } catch (err) {
      const { status, body } = toHttp(err);
      // 5xx eram engolidos (handoff §4): logamos a causa real para os runtime logs.
      if (status >= 500) console.error("[runs] 5xx:", err);
      return Response.json(body, { status });
    }
  };
}
