/**
 * E2E do M7 (motor de execução) — contra Postgres + pg-boss REAIS.
 *
 * Não é um teste vitest (esses correm com fakes, sem BD). Corre-se à mão contra
 * uma BD descartável para provar a montagem ponta-a-ponta:
 *   enfileirar → worker consome (pg-boss) → processRun → estado terminal →
 *   artefacto de log gravado.
 *
 * Uso (BD local/descartável):
 *   DATABASE_URL=postgres://postgres@127.0.0.1:5432/wf \
 *   AUTH_SECRET=<32+ chars> npx tsx scripts/e2e-m7.ts
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  organizations,
  users,
  tasks,
  taskAssignments,
  runs,
  runArtifacts,
} from "@/db/schema";
import { getRunsService, processRun } from "@/modules/runs";
import { startRunWorker } from "@/platform/queue/run-queue";
import type { SessionContext } from "@/lib/session";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FALHOU: ${msg}`);
}

async function waitTerminal(runId: string, timeoutMs = 20_000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const [row] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
    if (row && (row.status === "success" || row.status === "error")) return row.status;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Run ${runId} não terminou em ${timeoutMs}ms`);
}

async function main() {
  const orgId = randomUUID();
  const workerId = randomUUID();
  const taskId = randomUUID();
  const assignmentId = randomUUID();

  // --- Seed mínimo: org + worker + task automática (sem required_tools →
  // readiness trivialmente pronta) + atribuição ativa. ----------------------
  await db.insert(organizations).values({
    id: orgId,
    name: "E2E Org",
    slug: `e2e-${orgId.slice(0, 8)}`,
  });
  await db.insert(users).values({
    id: workerId,
    organizationId: orgId,
    email: `e2e-${workerId.slice(0, 8)}@example.com`,
    role: "worker",
  });
  await db.insert(tasks).values({
    id: taskId,
    organizationId: orgId,
    name: "Relatório mensal (e2e)",
    type: "automation",
    runtime: "report.monthly",
  });
  await db.insert(taskAssignments).values({
    id: assignmentId,
    taskId,
    workerId,
    enabled: true,
  });

  const session: SessionContext = { userId: workerId, orgId, role: "worker" };
  const service = getRunsService();

  // --- Worker real a consumir a fila runs.process. --------------------------
  const boss = await startRunWorker(process.env.DATABASE_URL!, (id) => processRun(id));

  try {
    // 1) TRIGGER MANUAL: enfileira e o worker deve processar até success. ------
    const queued = await service.enqueue({
      session,
      assignmentId,
      trigger: "manual",
      input: { period: "2026-07", sections: [{ title: "Vendas", metrics: { total: 3 } }] },
    });
    assert(queued.status === "queued", `esperava queued, veio ${queued.status}`);
    console.info(`[e2e] run enfileirado ${queued.id} (attempt=${queued.attempt})`);

    const status = await waitTerminal(queued.id);
    assert(status === "success", `esperava success, veio ${status}`);

    const [runRow] = await db.select().from(runs).where(eq(runs.id, queued.id)).limit(1);
    assert(runRow, "run devia existir na BD");
    assert(runRow.startedAt != null, "startedAt devia estar preenchido");
    assert(runRow.finishedAt != null, "finishedAt devia estar preenchido");
    const result = (runRow.output as any)?.result;
    assert(result?.period === "2026-07", "output.result.period devia ser 2026-07");
    console.info(`[e2e] run ${queued.id} → success; result.period=${result.period}`);

    // 2) ARTEFACTO DE LOG gravado (tier intermediate, location ephemeral). -----
    const artifacts = await db
      .select()
      .from(runArtifacts)
      .where(eq(runArtifacts.runId, queued.id));
    assert(artifacts.length === 1, `esperava 1 artefacto, vieram ${artifacts.length}`);
    const art = artifacts[0]!;
    assert(art.tier === "intermediate", `tier ${art.tier} != intermediate`);
    assert(art.location === "ephemeral", `location ${art.location} != ephemeral`);
    console.info(`[e2e] artefacto ${art.filename} (${art.tier}/${art.location})`);

    // 3) IDEMPOTÊNCIA por janela (schedule): mesmo windowKey → mesmo Run. ------
    const a = await service.enqueue({
      session: null,
      assignmentId,
      trigger: "schedule",
      windowKey: "2026-07-28T09:00",
      input: { period: "2026-07" },
    });
    const b = await service.enqueue({
      session: null,
      assignmentId,
      trigger: "schedule",
      windowKey: "2026-07-28T09:00",
      input: { period: "2026-07" },
    });
    assert(a.id === b.id, `dedup falhou: ${a.id} != ${b.id}`);
    console.info(`[e2e] idempotência OK: schedule mesma janela devolveu ${a.id}`);
    await waitTerminal(a.id);

    // 4) MANUAL nunca deduplica: dois triggers → dois Runs distintos. ---------
    const m1 = await service.enqueue({ session, assignmentId, trigger: "manual", input: { period: "2026-06" } });
    const m2 = await service.enqueue({ session, assignmentId, trigger: "manual", input: { period: "2026-06" } });
    assert(m1.id !== m2.id, "manual não devia deduplicar");
    console.info(`[e2e] manual distinto: ${m1.id} != ${m2.id}`);

    console.info("\n✅ E2E M7 PASSOU — motor enfileira, worker processa, artefacto gravado.");
  } finally {
    await boss.stop({ graceful: false });
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ E2E M7 FALHOU:", err);
    process.exit(1);
  });
