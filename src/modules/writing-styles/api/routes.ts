import { getWritingStyleService } from "../container";
import { uploadStyleSchema } from "../validation/writing-style.schema";
import { json, readJson, withSession } from "./http";

// GET /api/workers/:id/writing-style — estilo atual do trabalhador (ou null).
export const writingStyleGET = withSession(async (session, _req, ctx) => {
  const workerId = ctx.params.id!;
  return json({ style: await getWritingStyleService().get(session, workerId) });
});

// PUT /api/workers/:id/writing-style — carrega/substitui o .md de estilo.
export const writingStylePUT = withSession(async (session, req, ctx) => {
  const workerId = ctx.params.id!;
  const { filename, contentMd } = await readJson(req, uploadStyleSchema);
  return json({
    style: await getWritingStyleService().upload(session, workerId, { filename, contentMd }),
  });
});
