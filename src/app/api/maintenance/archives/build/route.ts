// POST /api/maintenance/archives/build — endpoint de cron (§cron / M9).
// Consolida o arquivo mensal. Protegido por CRON_SECRET (Authorization: Bearer …),
// igual ao /api/maintenance/runs/schedule.
//
// Body OPCIONAL (JSON):
//   { period?: "YYYY-MM", workerId?: uuid, orgId?: uuid }
//     • sem period   → assume o MÊS ANTERIOR (o fecho corre no início do mês a fechar)
//     • com workerId → consolida só esse worker
//     • sem workerId → consolida todos os workers (opcionalmente de uma org)
//
// Idempotente: o M9 é único por (worker, period) e não reconsolida um arquivo
// em success/running. O fecho de mês pode assim ser re-disparado sem duplicar.
import { z } from "zod";
import { assertCron } from "@/platform/config/cron";
import { getArchiveContainer } from "@/modules/archives/container";
import { assertPeriod, previousPeriod } from "@/modules/archives/domain/period";
import { badInput, toHttp } from "@/lib/errors";

const bodySchema = z
  .object({
    period: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Período inválido (YYYY-MM)")
      .optional(),
    workerId: z.string().uuid().optional(),
    orgId: z.string().uuid().optional(),
  })
  .default({});

/** Lê o body tolerando corpo vazio (o cron pode POSTar sem payload). */
async function readBody(req: Request): Promise<unknown> {
  const raw = await req.text();
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw badInput("Body JSON inválido");
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    assertCron(req);
  } catch (r) {
    // assertCron lança uma Response (403) diretamente.
    return r as Response;
  }

  try {
    const parsed = bodySchema.safeParse(await readBody(req));
    if (!parsed.success) {
      throw badInput("Input inválido", { issues: parsed.error.issues });
    }

    const period = parsed.data.period ?? previousPeriod(new Date());
    assertPeriod(period);

    const service = getArchiveContainer().service;

    if (parsed.data.workerId) {
      const archive = await service.buildArchive({ workerId: parsed.data.workerId, period });
      return Response.json({ ok: true, period, archive });
    }

    const results = await service.buildAllForPeriod(period, parsed.data.orgId);
    return Response.json({
      ok: true,
      period,
      total: results.length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (err) {
    console.error("[maintenance] build de arquivos falhou:", err);
    const { status, body } = toHttp(err);
    return Response.json({ ok: false, ...body }, { status });
  }
}
