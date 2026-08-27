import { mappingService } from "../container";
import { convertSchema, mappingDocumentSchema } from "../validation/schemas";
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
