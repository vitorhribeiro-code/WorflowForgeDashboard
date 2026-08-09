import { describe, it, expect, beforeEach } from "vitest";
import { createRunsService } from "@/modules/runs/service/runs.service";
import { createHandlerRegistry } from "@/modules/runs/service/handlers/handler";
import type { RunHandler } from "@/modules/runs/service/handlers/handler";
import { echoHandler } from "@/modules/runs/service/handlers/reference";
import {
  PermanentError,
  TransientError,
} from "@/modules/runs/service/exec-errors";
import type { SessionContext } from "@/lib/session";
import type { WorkerRunRow } from "@/modules/runs/data/runs.repository";
import {
  ctx,
  FakeArtifacts,
  FakeAudit,
  FakeQueue,
  FakeReadiness,
  FakeRunsRepo,
} from "../fakes/fakes";

const WORKER: SessionContext = { userId: "w1", orgId: "o1", role: "worker" };
const OTHER: SessionContext = { userId: "w2", orgId: "o1", role: "worker" };
const now = () => new Date("2026-07-22T10:00:00Z");

function setup(handlers: RunHandler[] = [echoHandler]) {
  const repo = new FakeRunsRepo();
  const queue = new FakeQueue();
  const readiness = new FakeReadiness();
  const artifacts = new FakeArtifacts();
  const audit = new FakeAudit();
  const service = createRunsService({
    repo,
    queue,
    readiness,
    handlers: createHandlerRegistry(handlers),
    artifacts,
    audit,
    maxAttempts: 3,
    now,
  });
  return { repo, queue, readiness, artifacts, audit, service };
}

describe("enqueue", () => {
  it("cria Run queued e mete na fila", async () => {
    const { repo, queue, service, audit } = setup();
    repo.seedContext(ctx());
    const run = await service.enqueue({
      session: WORKER,
      assignmentId: "asg-1",
      trigger: "manual",
      input: { x: 1 },
    });
    expect(run.status).toBe("queued");
    expect(run.attempt).toBe(1);
    expect(queue.enqueued).toHaveLength(1);
    expect(audit.actions()).toContain("run.queued");
  });

  it("deduplica por janela (schedule)", async () => {
    const { repo, queue, service } = setup();
    repo.seedContext(ctx());
    const a = await service.enqueue({
      session: null,
      assignmentId: "asg-1",
      trigger: "schedule",
      windowKey: "2026-07-22T10:00",
    });
    const b = await service.enqueue({
      session: null,
      assignmentId: "asg-1",
      trigger: "schedule",
      windowKey: "2026-07-22T10:00",
    });
    expect(a.id).toBe(b.id); // mesmo Run
    expect(queue.enqueued).toHaveLength(1); // não enfileira 2x
  });

  it("bloqueia se a atribuição estiver desativada", async () => {
    const { repo, service } = setup();
    repo.seedContext(ctx({ enabled: false }));
    await expect(
      service.enqueue({ session: WORKER, assignmentId: "asg-1", trigger: "manual" }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("bloqueia se as conexões não estiverem prontas", async () => {
    const { repo, readiness, service } = setup();
    repo.seedContext(ctx());
    readiness.result = {
      ready: false,
      missing: [{ toolId: "t", toolKey: "google", reason: "not_connected" }],
    };
    await expect(
      service.enqueue({ session: WORKER, assignmentId: "asg-1", trigger: "manual" }),
    ).rejects.toMatchObject({ code: "not_ready" });
  });

  it("recusa enfileirar tarefas assistidas", async () => {
    const { repo, service } = setup();
    repo.seedContext(ctx({ type: "assistant" }));
    await expect(
      service.enqueue({ session: WORKER, assignmentId: "asg-1", trigger: "manual" }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("impede um worker de enfileirar Runs de outro", async () => {
    const { repo, service } = setup();
    repo.seedContext(ctx({ workerId: "w1" }));
    await expect(
      service.enqueue({ session: OTHER, assignmentId: "asg-1", trigger: "manual" }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("processRun", () => {
  it("executa com sucesso e guarda o resultado + log", async () => {
    const { repo, artifacts, service, audit } = setup();
    repo.seedContext(ctx());
    const run = await service.enqueue({
      session: WORKER,
      assignmentId: "asg-1",
      trigger: "manual",
      input: { hello: "world" },
    });

    const done = await service.processRun(run.id);
    expect(done.status).toBe("success");
    expect(done.outcome).toBe("success");
    expect(done.hasResult).toBe(true);
    expect(artifacts.logs.at(-1)?.body.status).toBe("success");
    expect(audit.actions()).toEqual(
      expect.arrayContaining(["run.started", "run.succeeded"]),
    );
  });

  it("classifica erro permanente (sem retry possível)", async () => {
    const failing: RunHandler = {
      runtime: "echo",
      async execute() {
        throw new PermanentError("config inválida");
      },
    };
    const { repo, service } = setup([failing]);
    repo.seedContext(ctx());
    const run = await service.enqueue({
      session: WORKER,
      assignmentId: "asg-1",
      trigger: "manual",
    });
    const done = await service.processRun(run.id);
    expect(done.status).toBe("error");
    expect(done.errorClass).toBe("permanent");
  });

  it("é idempotente: não re-processa um Run já terminal", async () => {
    const { repo, service } = setup();
    repo.seedContext(ctx());
    const run = await service.enqueue({
      session: WORKER,
      assignmentId: "asg-1",
      trigger: "manual",
    });
    await service.processRun(run.id);
    const again = await service.processRun(run.id);
    expect(again.status).toBe("success");
  });

  it("falha permanente quando não há handler para o runtime", async () => {
    const { repo, service } = setup([]); // registo vazio
    repo.seedContext(ctx({ runtime: "inexistente" }));
    const run = await service.enqueue({
      session: WORKER,
      assignmentId: "asg-1",
      trigger: "manual",
    });
    const done = await service.processRun(run.id);
    expect(done.status).toBe("error");
    expect(done.errorClass).toBe("permanent");
  });
});

describe("cancel", () => {
  it("cancela um Run em fila (outcome=cancelled)", async () => {
    const { repo, artifacts, service, audit } = setup();
    repo.seedContext(ctx());
    const run = await service.enqueue({
      session: WORKER,
      assignmentId: "asg-1",
      trigger: "manual",
    });
    const cancelled = await service.cancel(WORKER, run.id);
    expect(cancelled.status).toBe("error");
    expect(cancelled.outcome).toBe("cancelled");
    expect(artifacts.logs.at(-1)?.name).toBe("cancel.log");
    expect(audit.actions()).toContain("run.cancelled");
  });

  it("recusa cancelar um Run terminal", async () => {
    const { repo, service } = setup();
    repo.seedContext(ctx());
    const run = await service.enqueue({
      session: WORKER,
      assignmentId: "asg-1",
      trigger: "manual",
    });
    await service.processRun(run.id); // fica success
    await expect(service.cancel(WORKER, run.id)).rejects.toMatchObject({
      code: "conflict",
    });
  });
});

describe("retry", () => {
  async function makeFailed(errorClass: "transient" | "permanent") {
    const failing: RunHandler = {
      runtime: "echo",
      async execute() {
        throw errorClass === "transient"
          ? new TransientError("timeout")
          : new PermanentError("scope em falta");
      },
    };
    const kit = setup([failing]);
    kit.repo.seedContext(ctx());
    const run = await kit.service.enqueue({
      session: WORKER,
      assignmentId: "asg-1",
      trigger: "manual",
    });
    await kit.service.processRun(run.id);
    return { ...kit, failedId: run.id };
  }

  it("repete falha transitória e enfileira novo Run com backoff", async () => {
    const { service, queue, failedId, audit } = await makeFailed("transient");
    const next = await service.retry(WORKER, failedId);
    expect(next.attempt).toBe(2);
    expect(next.retryOf).toBe(failedId);
    // 1º enqueue foi o original; o 2º é o retry, com delay > 0.
    expect(queue.enqueued.at(-1)?.delayMs).toBeGreaterThan(0);
    expect(audit.actions()).toContain("run.retried");
  });

  it("recusa retry de erro permanente", async () => {
    const { service, failedId } = await makeFailed("permanent");
    await expect(service.retry(WORKER, failedId)).rejects.toMatchObject({
      code: "retry_not_allowed",
    });
  });

  it("recusa retry de Run cancelado", async () => {
    const { repo, service } = setup();
    repo.seedContext(ctx());
    const run = await service.enqueue({
      session: WORKER,
      assignmentId: "asg-1",
      trigger: "manual",
    });
    await service.cancel(WORKER, run.id);
    await expect(service.retry(WORKER, run.id)).rejects.toMatchObject({
      code: "retry_not_allowed",
    });
  });

  it("recusa retry além do limite de tentativas", async () => {
    const { service, failedId, repo } = await makeFailed("transient");
    // Força attempt no limite.
    const row = repo.runs.get(failedId)!;
    row.output = { _engine: { attempt: 3, errorClass: "transient" } };
    await expect(service.retry(WORKER, failedId)).rejects.toMatchObject({
      code: "retry_not_allowed",
    });
  });
});

describe("runAssisted", () => {
  it("emite eventos e finaliza com sucesso", async () => {
    const { repo, service, audit } = setup();
    repo.seedContext(ctx({ type: "assistant" }));

    const events: string[] = [];
    let done: any;
    for await (const e of service.runAssisted(WORKER, "asg-1", { q: 1 })) {
      events.push(e.type);
      if (e.type === "done") done = e.data;
    }
    expect(events).toEqual(
      expect.arrayContaining(["progress", "log", "result", "done"]),
    );
    expect(done.run.status).toBe("success");
    expect(audit.actions()).toEqual(
      expect.arrayContaining(["assisted_session.opened", "assisted_session.closed"]),
    );
  });

  it("recusa executar tarefa automática como assistida", async () => {
    const { repo, service } = setup();
    repo.seedContext(ctx({ type: "automation" }));
    const gen = service.runAssisted(WORKER, "asg-1", {});
    await expect(gen.next()).rejects.toMatchObject({ code: "conflict" });
  });
});

describe("processRun + inputProvider (aquisição a montante)", () => {
  it("passa ao handler o input resolvido pelo provider", async () => {
    const repo = new FakeRunsRepo();
    const inputProvider = {
      resolve: async (c: { runtime: string; base: Record<string, unknown> }) => ({
        ...c.base,
        acquired: true,
        runtime: c.runtime,
      }),
    };
    const service = createRunsService({
      repo,
      queue: new FakeQueue(),
      readiness: new FakeReadiness(),
      handlers: createHandlerRegistry([echoHandler]),
      artifacts: new FakeArtifacts(),
      audit: new FakeAudit(),
      now,
      inputProvider,
    });
    repo.seedContext(ctx());
    const run = await service.enqueue({
      session: WORKER,
      assignmentId: "asg-1",
      trigger: "manual",
      input: { x: 1 },
    });
    const done = await service.processRun(run.id);
    expect(done.status).toBe("success");
    const stored = await repo.getRun(run.id);
    expect((stored!.output as any).result.echo).toMatchObject({ x: 1, acquired: true, runtime: "echo" });
  });

  it("sem inputProvider, o handler recebe o input original (pass-through)", async () => {
    const { repo, service } = setup();
    repo.seedContext(ctx());
    const run = await service.enqueue({
      session: WORKER,
      assignmentId: "asg-1",
      trigger: "manual",
      input: { x: 2 },
    });
    await service.processRun(run.id);
    const stored = await repo.getRun(run.id);
    expect((stored!.output as any).result.echo).toEqual({ x: 2 });
  });
});

describe("listMine (feed do trabalhador)", () => {
  function mkWorkerRun(over: Partial<WorkerRunRow> = {}): WorkerRunRow {
    return {
      id: "run-x",
      assignmentId: "asg-1",
      status: "success",
      trigger: "schedule",
      idempotencyKey: null,
      input: null,
      output: null,
      error: null,
      triggeredBy: null,
      startedAt: null,
      finishedAt: null,
      createdAt: new Date("2026-08-03T09:00:00Z"),
      taskName: "Resumo do meu email",
      taskRuntime: "email.digest",
      ...over,
    };
  }

  it("encaminha o worker da sessão e o limite ao repositório", async () => {
    const { repo, service } = setup();
    repo.recent = [mkWorkerRun()];
    await service.listMine(WORKER, 5);
    expect(repo.lastRecentQuery).toEqual({ workerId: "w1", limit: 5 });
  });

  it("mapeia para a vista com o nome/runtime da tarefa e o outcome", async () => {
    const { repo, service } = setup();
    repo.recent = [mkWorkerRun({ id: "run-77" })];
    const [item] = await service.listMine(WORKER, 6);
    expect(item!.id).toBe("run-77");
    expect(item!.taskName).toBe("Resumo do meu email");
    expect(item!.taskRuntime).toBe("email.digest");
    expect(item!.outcome).toBe("success"); // toView derivou o outcome
  });

  it("faz clamp do limite a [1, 20]", async () => {
    const { repo, service } = setup();
    repo.recent = [];
    await service.listMine(WORKER, 999);
    expect(repo.lastRecentQuery?.limit).toBe(20);
    await service.listMine(WORKER, 0);
    expect(repo.lastRecentQuery?.limit).toBe(1);
  });
});

describe("getLastSummary", () => {
  async function seedSuccess(repo: FakeRunsRepo, result: Record<string, unknown>) {
    const run = await repo.createRun({
      assignmentId: "asg-1",
      trigger: "manual",
      idempotencyKey: null,
      input: {},
      output: { _engine: { attempt: 1 } },
      triggeredBy: "w1",
    });
    await repo.markSuccess(run.id, { _engine: { attempt: 1 }, result }, now());
    return run;
  }

  it("devolve o result do último run bem-sucedido", async () => {
    const { repo, service } = setup();
    repo.seedContext(ctx());
    await seedSuccess(repo, {
      total: 2,
      emails: [{ from: "a@x.pt", subject: "Fatura", resumo: "resumo A" }],
    });
    const out = await service.getLastSummary(WORKER, "asg-1");
    expect(out).toMatchObject({ total: 2 });
    expect((out!.emails as unknown[])).toHaveLength(1);
  });

  it("devolve null quando ainda não há sucesso", async () => {
    const { repo, service } = setup();
    repo.seedContext(ctx());
    await repo.createRun({
      assignmentId: "asg-1",
      trigger: "manual",
      idempotencyKey: null,
      input: {},
      output: { _engine: { attempt: 1 } },
      triggeredBy: "w1",
    });
    expect(await service.getLastSummary(WORKER, "asg-1")).toBeNull();
  });

  it("recusa um trabalhador que não é o dono", async () => {
    const { repo, service } = setup();
    repo.seedContext(ctx());
    await seedSuccess(repo, { total: 1, emails: [] });
    await expect(service.getLastSummary(OTHER, "asg-1")).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

describe("saveSummaryToWeekly", () => {
  async function seedSummary(repo: FakeRunsRepo) {
    const run = await repo.createRun({
      assignmentId: "asg-1",
      trigger: "manual",
      idempotencyKey: null,
      input: {},
      output: { _engine: { attempt: 1 } },
      triggeredBy: "w1",
    });
    await repo.markSuccess(
      run.id,
      {
        _engine: { attempt: 1 },
        result: {
          period: "2026-08",
          generatedAt: "2026-08-05T20:00:00.000Z",
          total: 2,
          emails: [
            { from: "Ana <ana@x.pt>", subject: "Fatura", resumo: "Fatura por pagar" },
            { from: "b@x.pt", subject: "Oi", resumo: "Pergunta rápida" },
          ],
        },
      },
      now(),
    );
    return run;
  }

  it("grava no ficheiro da semana (append) e audita", async () => {
    const { repo, artifacts, audit, service } = setup();
    repo.seedContext(ctx());
    await seedSummary(repo);

    const out = await service.saveSummaryToWeekly(WORKER, "asg-1");
    expect(out.appended).toBe(true);
    expect(out.file).toMatch(/^resumos-semana-2026-W\d{2}\.md$/);
    expect(out.url).toContain("cloud:weekly");

    const ap = artifacts.weeklyAppends[0]!;
    expect(ap.workerId).toBe("w1");
    expect(ap.filename).toBe(out.file);
    expect(ap.block).toContain("- Ana — Fatura por pagar");
    expect(ap.block).toContain("- b@x.pt — Pergunta rápida");
    expect(ap.marker).toContain("2026-08-05T20:00:00.000Z");
    expect(audit.actions()).toContain("ai.summary_saved");
  });

  it("é idempotente: gravar o mesmo resumo 2x não duplica", async () => {
    const { repo, service } = setup();
    repo.seedContext(ctx());
    await seedSummary(repo);
    const a = await service.saveSummaryToWeekly(WORKER, "asg-1");
    const b = await service.saveSummaryToWeekly(WORKER, "asg-1");
    expect(a.appended).toBe(true);
    expect(b.appended).toBe(false); // mesmo marker (generatedAt)
  });

  it("sem resumo → conflito", async () => {
    const { repo, service } = setup();
    repo.seedContext(ctx());
    await repo.createRun({
      assignmentId: "asg-1",
      trigger: "manual",
      idempotencyKey: null,
      input: {},
      output: { _engine: { attempt: 1 } },
      triggeredBy: "w1",
    });
    await expect(service.saveSummaryToWeekly(WORKER, "asg-1")).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("recusa um trabalhador que não é o dono", async () => {
    const { repo, service } = setup();
    repo.seedContext(ctx());
    await seedSummary(repo);
    await expect(service.saveSummaryToWeekly(OTHER, "asg-1")).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

describe("runAssisted + estilo de escrita (Fatia 3)", () => {
  it("injeta input.style e força tom 'meu' quando o provider devolve um .md", async () => {
    const repo = new FakeRunsRepo();
    const service = createRunsService({
      repo,
      queue: new FakeQueue(),
      readiness: new FakeReadiness(),
      handlers: createHandlerRegistry([echoHandler]),
      artifacts: new FakeArtifacts(),
      audit: new FakeAudit(),
      writingStyle: {
        resolveForAssistedRun: async () => "A minha voz de escrita.",
      },
      now,
    });
    repo.seedContext(ctx({ type: "assistant" }));

    let result: any;
    for await (const e of service.runAssisted(WORKER, "asg-1", {})) {
      if (e.type === "result") result = e.data;
    }
    expect(result.echo.style).toBe("A minha voz de escrita.");
    expect(result.echo.tone).toBe("meu");
  });

  it("não injeta nada quando o provider devolve null (flag desligado)", async () => {
    const repo = new FakeRunsRepo();
    const service = createRunsService({
      repo,
      queue: new FakeQueue(),
      readiness: new FakeReadiness(),
      handlers: createHandlerRegistry([echoHandler]),
      artifacts: new FakeArtifacts(),
      audit: new FakeAudit(),
      writingStyle: { resolveForAssistedRun: async () => null },
      now,
    });
    repo.seedContext(ctx({ type: "assistant" }));

    let result: any;
    for await (const e of service.runAssisted(WORKER, "asg-1", { tone: "formal" })) {
      if (e.type === "result") result = e.data;
    }
    expect(result.echo.style).toBeUndefined();
    expect(result.echo.tone).toBe("formal");
  });
});
