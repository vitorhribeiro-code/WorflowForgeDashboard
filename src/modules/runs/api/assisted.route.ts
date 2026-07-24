/**
 * POST /api/assignments/:assignmentId/assisted
 * → inicia um Run assistido e transmite os eventos como SSE (text/event-stream).
 *
 * Consome o async generator do serviço e escreve frames `data: <json>`.
 * O cliente lê via fetch + ReadableStream (ver useRunStream). Usamos POST (não
 * EventSource) para poder enviar o input no corpo; o cancelamento do lado do
 * cliente aborta o fetch, que propaga para o AbortSignal do serviço.
 */

import { getRunsService } from "@/modules/runs/container";
import {
  assignmentIdParamSchema,
  assistedStartSchema,
} from "@/modules/runs/validation/runs.schema";
import { badInput } from "@/modules/runs/api/http";
import { getSession, UnauthenticatedError } from "@/lib/session";
import { toHttp } from "@/lib/errors";

export async function POST(
  req: Request,
  { params }: { params: { assignmentId: string } },
) {
  const p = assignmentIdParamSchema.safeParse(params);
  if (!p.success) return badInput(p.error.flatten());

  let session;
  try {
    session = await getSession(req);
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      return new Response(JSON.stringify({ error: { code: "unauthenticated" } }), {
        status: 401,
      });
    }
    throw err;
  }

  const body = assistedStartSchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return badInput(body.error.flatten());

  const service = getRunsService();
  const encoder = new TextEncoder();
  const abort = new AbortController();
  // Se o cliente fechar a ligação, aborta a execução assistida.
  req.signal.addEventListener("abort", () => abort.abort());

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        for await (const event of service.runAssisted(
          session,
          p.data.assignmentId,
          body.data.input,
          abort.signal,
        )) {
          send(event);
        }
      } catch (err) {
        const { body: errBody } = toHttp(err);
        send({ type: "error", data: errBody.error });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
