// Controladores finos: withSession -> parse Zod -> service -> JSON. Erros num só sítio.
import { z } from "zod";
import { DomainError, toHttp } from "../../../lib/errors";
import { getSession, type SessionContext } from "../../../lib/session";

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function errorResponse(err: unknown): Response {
  const { status, body } = toHttp(err);
  return json(body, status);
}

/** Corre um handler com sessão + tratamento uniforme de erros. */
export async function withSession(
  fn: (session: SessionContext) => Promise<Response>,
): Promise<Response> {
  try {
    const session = await getSession();
    return await fn(session);
  } catch (err) {
    return errorResponse(err);
  }
}

/** Valida params/body com Zod; lança BAD_INPUT (422) em caso de erro. */
export function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw new DomainError("BAD_INPUT", "Input inválido", { issues: r.error.issues });
  }
  return r.data;
}
