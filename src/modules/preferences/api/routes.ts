import { getPreferencesService } from "../container";
import { setBackgroundSchema } from "../validation/preferences.schema";
import { json, readJson, withSession } from "./http";

// GET /api/me/preferences — as preferências do próprio utilizador.
export const preferencesGET = withSession(async (session) => {
  return json(await getPreferencesService().get(session));
});

// PUT /api/me/preferences — define o fundo do painel do próprio utilizador.
export const preferencesPUT = withSession(async (session, req) => {
  const { background } = await readJson(req, setBackgroundSchema);
  return json(await getPreferencesService().setBackground(session, background));
});
