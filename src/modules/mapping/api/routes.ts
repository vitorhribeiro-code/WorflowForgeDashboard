import { mappingService, runtimeMatcher } from "../container";
import { convertSchema, mappingDocumentSchema } from "../validation/schemas";
import { matchSchema } from "../validation/match.schema";
import { json, parseWith, rawJson, withSession } from "./http";

// POST /api/mapping/parse — documento → candidatos (nada é persistido).
export const parsePOST = withSession(async (session, req) => {
  const doc = parseWith(mappingDocumentSchema, await rawJson(req), "UNRECOGNIZED_FORMAT");
  return json(mappingService.parse(session, doc));
});

// POST /api/mapping/convert — candidato (+ overrides + decisão) → Task no M4.
// Desfecho: created (201) · reused (200) · needs_decision (200, nada persistido).
export const convertPOST = withSession(async (session, req) => {
  const input = parseWith(convertSchema, await rawJson(req));
  const outcome = await mappingService.convert(session, {
    candidate: input.candidate,
    overrides: input.overrides,
    decision: input.decision,
  });
  return json(outcome, { status: outcome.status === "created" ? 201 : 200 });
});

// POST /api/mapping/match — candidatos → propostas de runtime (reuse-first, IA).
// Não persiste nada; o admin aceita/rejeita e depois converte com o override.
export const matchPOST = withSession(async (session, req) => {
  const input = parseWith(matchSchema, await rawJson(req));
  const proposals = await runtimeMatcher.match(session, input.candidates);
  return json({ proposals });
});
