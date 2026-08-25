// POST /api/maintenance/archives/rebuild — endpoint de manutenção (Bearer/CRON_SECRET).
// Reconstrói os arquivos "success" cujo folderRef ficou em formato-memória
// (arch:…) e que, por isso, nunca foram escritos no R2 (o download dava
// NoSuchKey). Recomputa o manifesto e reescreve no store atual (S3/R2),
// atualizando o folderRef para "archives/…". Idempotente e por-item não-fatal.
//
// Uso:
//   curl -i -X POST .../api/maintenance/archives/rebuild -H "Authorization: Bearer <CRON_SECRET>"
//   -> { ok, scanned, rebuilt, failed }
import { assertCron } from "@/platform/config/cron";
import { getArchiveContainer } from "@/modules/archives/container";
import { toHttp } from "@/lib/errors";

export async function POST(req: Request): Promise<Response> {
  try {
    assertCron(req);
  } catch (r) {
    // assertCron lança uma Response (403) diretamente.
    return r as Response;
  }

  try {
    const service = getArchiveContainer().service;
    const result = await service.rebuildBrokenArchives();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error("[maintenance] rebuild de arquivos partidos falhou:", err);
    const { status, body } = toHttp(err);
    return Response.json({ ok: false, ...body }, { status });
  }
}
