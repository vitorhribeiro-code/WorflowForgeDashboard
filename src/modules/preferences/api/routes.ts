import { DomainError } from "@/lib/errors";
import { getPreferencesService } from "../container";
import { setBackgroundSchema } from "../validation/preferences.schema";
import { json, readJson, withSession } from "./http";

// GET /api/me/preferences — as preferências do próprio utilizador.
export const preferencesGET = withSession(async (session) => {
  return json(await getPreferencesService().get(session));
});

// GET /api/workers/:id/preferences — leitura admin do fundo escolhido por um
// trabalhador (consola «Trabalhadores»). Só super_admin; só leitura.
export const workerPreferencesGET = withSession(async (session, _req, ctx) => {
  const workerId = ctx.params.id;
  if (!workerId) throw new DomainError("BAD_INPUT", "id em falta", 400);
  return json(await getPreferencesService().getForWorker(session, workerId));
});

// PUT /api/me/preferences — define o fundo do painel do próprio utilizador.
export const preferencesPUT = withSession(async (session, req) => {
  const { background } = await readJson(req, setBackgroundSchema);
  return json(await getPreferencesService().setBackground(session, background));
});
