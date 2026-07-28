// POST /api/maintenance/runs/schedule — endpoint de cron do scheduler (§6.3).
// Protegido por CRON_SECRET (Authorization: Bearer …). O cron do host (Railway
// cron / Vercel Cron / QStash) chama-o periodicamente; cada tick apura as
// automáticas devidas na janela de catch-up e enfileira-as (idempotente por
// janela). NÃO recebe input do utilizador — é sistema puro.
import { assertCron } from "@/platform/config/cron";
import { getScheduler } from "@/platform/scheduler/container";
import { toHttp } from "@/lib/errors";

export async function POST(req: Request): Promise<Response> {
  try {
    assertCron(req);
  } catch (r) {
    // assertCron lança uma Response (403) diretamente.
    return r as Response;
  }

  try {
    const result = await getScheduler().tick();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    // Uma falha global (ex.: BD em baixo) não deve rebentar o cron do host com
    // um 500 silencioso — devolve-se um corpo diagnosticável e loga-se a causa.
    console.error("[scheduler] tick falhou:", err);
    const { status, body } = toHttp(err);
    return Response.json({ ok: false, ...body }, { status });
  }
}
