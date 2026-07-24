import { loadEnv } from "@/platform/config/env";

// Protege os endpoints de cron com um segredo partilhado (header Authorization).
// O scheduler (cron do host / Vercel Cron / QStash) envia `Bearer <CRON_SECRET>`.
export function assertCron(req: Request): void {
  const secret = loadEnv().CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    throw new Response("forbidden", { status: 403 });
  }
}

// Os handlers ligam-se aos endpoints/serviços já existentes (idempotentes):
//   (a) execuções agendadas → M7  POST /api/runs { trigger: "schedule" }
//   (b) fecho de mês        → M9  POST /api/maintenance/archives/build { period }
//   (c) limpeza de efémeros → M8  POST /api/maintenance/artifacts/cleanup
//
// Exemplo de handler (a ligar ao serviço do módulo respetivo):
//
//   export const POST = async (req: Request) => {
//     try { assertCron(req); } catch (r) { return r as Response; }
//     await scheduleDueRuns();      // itera assignments enabled+automation, enfileira
//     return Response.json({ ok: true });
//   };
//
// Nota: manter tudo idempotente (o M7 deduplica por janela; o M9 é único por
// (worker, period); o cleanup do M8 só apaga intermédios expirados E arquivados).
export const CRON_JOBS = {
  scheduleRuns: "POST /api/maintenance/runs/schedule",
  buildArchives: "POST /api/maintenance/archives/build",
  cleanupArtifacts: "POST /api/maintenance/artifacts/cleanup",
} as const;
