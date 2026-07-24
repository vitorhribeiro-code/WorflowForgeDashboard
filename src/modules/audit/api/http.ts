import type { ZodType } from "zod";
import { DomainError, toHttp } from "@/lib/errors";
import { getSession, type SessionContext } from "@/lib/session";

// (padrão) Uma cópia por módulo no output; fundir numa só no repo real (§9).

export function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

// Valida a forma; erro de forma → BAD_INPUT (400) com detalhes do Zod.
export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new DomainError("BAD_INPUT", "Parâmetros inválidos", 400, r.error.flatten());
  }
  return r.data;
}

// Extrai os query params como objeto simples para o Zod coagir.
export function queryOf(req: Request): Record<string, string> {
  return Object.fromEntries(new URL(req.url).searchParams);
}

// Controlador fino: resolve sessão, corre o handler, mapeia erros num só sítio.
export function withSession(
  fn: (session: SessionContext, req: Request) => Promise<Response>,
) {
  return async (req: Request): Promise<Response> => {
    try {
      const session = await getSession(req);
      return await fn(session, req);
    } catch (err) {
      const { status, body } = toHttp(err);
      return Response.json(body, { status });
    }
  };
}
