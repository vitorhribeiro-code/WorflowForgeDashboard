import { mappingService } from "../container";
import { convertSchema, mappingDocumentSchema } from "../validation/schemas";
import { json, parseWith, rawJson, withSession } from "./http";

// POST /api/mapping/parse — documento → candidatos (nada é persistido).
export const parsePOST = withSession(async (session, req) => {
  const doc = parseWith(mappingDocumentSchema, await rawJson(req), "UNRECOGNIZED_FORMAT");
  return json(mappingService.parse(session, doc));
});

// POST /api/mapping/convert — candidato (+ overrides) → Task no M4.
export const convertPOST = withSession(async (session, req) => {
  const input = parseWith(convertSchema, await rawJson(req));
  const task = await mappingService.convert(session, {
    candidate: input.candidate,
    overrides: input.overrides,
  });
  return json(task, { status: 201 });
});
