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
