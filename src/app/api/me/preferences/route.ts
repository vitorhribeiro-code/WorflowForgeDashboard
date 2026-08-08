import { preferencesGET, preferencesPUT } from "@/modules/preferences/api/routes";

// GET /api/me/preferences — lê as preferências do próprio utilizador.
export async function GET(req: Request) {
  return preferencesGET(req, { params: {} });
}

// PUT /api/me/preferences — grava o fundo escolhido pelo próprio utilizador.
export async function PUT(req: Request) {
  return preferencesPUT(req, { params: {} });
}
