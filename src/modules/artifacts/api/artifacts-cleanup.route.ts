// POST /api/maintenance/artifacts/cleanup -> apaga intermédios expirados E arquivados.
// Endpoint de sistema: proteger por segredo de cron / IP interno, não por sessão de utilizador.
import { getArtifactContainer } from "../container";
import { errorResponse, json } from "./http";

export async function POST(req: Request): Promise<Response> {
  // Autorização simples de cron (substituir pelo mecanismo do teu scheduler).
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return json({ code: "FORBIDDEN", message: "Cron não autorizado" }, 403);
  }
  try {
    const service = getArtifactContainer().service;
    const result = await service.cleanupExpiredIntermediates();
    return json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
