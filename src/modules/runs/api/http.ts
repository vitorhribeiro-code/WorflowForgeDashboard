// Helper HTTP do M7. `badInput` devolve uma Response 400 (a route SSE usa-o
// diretamente, fora do withSession, por causa do streaming).
export function badInput(details: unknown): Response {
  return new Response(JSON.stringify({ error: { code: "BAD_INPUT", details } }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
}
