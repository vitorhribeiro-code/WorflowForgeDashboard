import type { ZodType } from "zod";
import { DomainError, toHttp } from "@/lib/errors";

// M1 é o produtor de sessões — não usa withSession (essas rotas são públicas).
// Envolve o handler e mapeia erros de domínio num só sítio.

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

export function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      return await fn(req);
    } catch (err) {
      const { status, body } = toHttp(err);
      return Response.json(body, { status });
    }
  };
}

// Cookie de sessão HttpOnly (o token nunca é acessível ao JS do browser).
export function sessionCookie(token: string, maxAgeSeconds: number): string {
  const parts = [
    `session=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(): string {
  return "session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0";
}
