import type { ZodType } from "zod";
import { DomainError, toHttp } from "@/lib/errors";
import { getSession, type SessionContext } from "@/lib/session";

// (padrão) Uma cópia por módulo; fundir numa só no repo real (handoff §9).

export type RouteCtx = { params: Record<string, string> };

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
    throw new DomainError("BAD_INPUT", "Corpo JSON inválido", 400);
  }
  return parse(schema, body);
}

/** Lê a query string de um pedido e valida-a contra um schema Zod. */
export function readQuery<T>(req: Request, schema: ZodType<T>): T {
  const url = new URL(req.url);
  return parse(schema, Object.fromEntries(url.searchParams.entries()));
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
      return Response.json(body, { status });
    }
  };
}
