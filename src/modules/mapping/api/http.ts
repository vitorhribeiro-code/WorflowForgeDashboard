import type { ZodType } from "zod";
import { DomainError, toHttp } from "@/lib/errors";
import { getSession, type SessionContext } from "@/lib/session";

// (padrão) Uma cópia por módulo; fundir numa só no repo real (handoff §9).

export function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

// parse com código de erro configurável (ex.: UNRECOGNIZED_FORMAT no /parse).
export function parseWith<T>(schema: ZodType<T>, data: unknown, code = "BAD_INPUT"): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new DomainError(code, "Formato não reconhecido", 400, r.error.flatten());
  }
  return r.data;
}

export async function rawJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new DomainError("BAD_INPUT", "Corpo JSON inválido", 400);
  }
}

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
