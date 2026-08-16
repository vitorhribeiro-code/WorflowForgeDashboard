import { DomainError } from "@/lib/errors";
import { getPreferencesService } from "../container";
import { setPreferencesSchema } from "../validation/preferences.schema";
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

// PUT /api/me/preferences — define o fundo e/ou o modo do painel do próprio
// utilizador. O corpo pode trazer `background`, `mode`, ou ambos.
export const preferencesPUT = withSession(async (session, req) => {
  const { background, mode, customBackground, customTokens } = await readJson(
    req,
    setPreferencesSchema,
  );
  const svc = getPreferencesService();
  let prefs = await svc.get(session);
  if (mode !== undefined) prefs = await svc.setMode(session, mode);
  if (background !== undefined) prefs = await svc.setBackground(session, background);
  // Por último: definir a imagem seleciona "custom", pelo que ganha se o corpo
  // (invulgarmente) trouxer também um background. Os tokens derivados seguem
  // junto (só relevantes ao definir a imagem; ao limpar são descartados).
  if (customBackground !== undefined) {
    prefs = await svc.setCustomBackground(session, customBackground, customTokens);
  }
  return json(prefs);
});
