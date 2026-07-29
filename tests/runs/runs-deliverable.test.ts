import { describe, it, expect } from "vitest";
import { createRunsService } from "@/modules/runs/service/runs.service";
import { createHandlerRegistry } from "@/modules/runs/service/handlers/handler";
import type { RunHandler } from "@/modules/runs/service/handlers/handler";
import { DomainError } from "@/lib/errors";
import type { SessionContext } from "@/lib/session";
import { ctx, FakeArtifacts, FakeAudit, FakeQueue, FakeReadiness, FakeRunsRepo } from "../fakes/fakes";

const WORKER: SessionContext = { userId: "w1", orgId: "o1", role: "worker" };
const now = () => new Date("2026-07-22T10:00:00Z");

/** Handler que produz um entregável a partir do output. */
const docHandler: RunHandler = {
  runtime: "doc",
  async execute() {
    return { ok: true };
  },
  deliverable() {
    return { filename: "saida.md", mimeType: "text/markdown", bytes: new TextEncoder().encode("olá") };
  },
};

function setup(handlers: RunHandler[], artifacts = new FakeArtifacts()) {
  const repo = new FakeRunsRepo();
  const service = createRunsService({
    repo,
    queue: new FakeQueue(),
    readiness: new FakeReadiness(),
    handlers: createHandlerRegistry(handlers),
    artifacts,
    audit: new FakeAudit(),
    maxAttempts: 3,
    now,
  });
  return { repo, artifacts, service };
}

describe("processRun · entregável (work_document)", () => {
  it("grava o entregável na cloud e liga a referência ao output", async () => {
    const { repo, artifacts, service } = setup([docHandler]);
    repo.seedContext(ctx({ runtime: "doc" }));
    const run = await service.enqueue({ session: WORKER, assignmentId: "asg-1", trigger: "manual" });

    const done = await service.processRun(run.id);
    expect(done.status).toBe("success");
    expect(artifacts.docs).toHaveLength(1);
    expect(artifacts.docs[0]).toMatchObject({ filename: "saida.md", mimeType: "text/markdown" });
  });

  it("falha de cloud (CLOUD_CONNECTION_MISSING) → run em erro permanente", async () => {
    const artifacts = new FakeArtifacts();
    artifacts.failDocument = new DomainError("CLOUD_CONNECTION_MISSING", "sem cloud");
    const { repo, service } = setup([docHandler], artifacts);
    repo.seedContext(ctx({ runtime: "doc" }));
    const run = await service.enqueue({ session: WORKER, assignmentId: "asg-1", trigger: "manual" });

    const done = await service.processRun(run.id);
    expect(done.status).toBe("error");
    // DomainError → permanente (classify) → não deve permitir retry.
    expect(done.errorClass).toBe("permanent");
  });

  it("handler sem deliverable não grava documentos", async () => {
    const noDoc: RunHandler = { runtime: "plain", async execute() { return { a: 1 }; } };
    const { repo, artifacts, service } = setup([noDoc]);
    repo.seedContext(ctx({ runtime: "plain" }));
    const run = await service.enqueue({ session: WORKER, assignmentId: "asg-1", trigger: "manual" });

    const done = await service.processRun(run.id);
    expect(done.status).toBe("success");
    expect(artifacts.docs).toHaveLength(0);
  });
});
