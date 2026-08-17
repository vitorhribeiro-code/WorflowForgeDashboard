// POST /api/maintenance/artifacts/cleanup — endpoint de cron (§cron / M8).
// Apaga os intermédios efémeros expirados E já arquivados. Protegido por
// CRON_SECRET (Authorization: Bearer …), igual ao /api/maintenance/runs/schedule
// — assim o cron do host já configurado chama-o sem um segundo segredo/header.
// Sistema puro: não recebe input do utilizador. Idempotente (o service só apaga
// o que já é limpável: tier=intermediate, expirado E archived=true).
import { assertCron } from "@/platform/config/cron";
import { getArtifactContainer } from "@/modules/artifacts/container";
import { toHttp } from "@/lib/errors";

export async function POST(req: Request): Promise<Response> {
  try {
    assertCron(req);
  } catch (r) {
    // assertCron lança uma Response (403) diretamente.
    return r as Response;
  }

  try {
    const result = await getArtifactContainer().service.cleanupExpiredIntermediates();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    // Uma falha global (ex.: BD em baixo) não deve rebentar o cron do host com
    // um 500 opaco — devolve-se um corpo diagnosticável e loga-se a causa.
    console.error("[maintenance] cleanup de artefactos falhou:", err);
    const { status, body } = toHttp(err);
    return Response.json({ ok: false, ...body }, { status });
  }
}
