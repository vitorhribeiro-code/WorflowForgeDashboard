import { describe, expect, it } from "vitest";
import type { SessionContext } from "@/lib/session";
import type { TaskRepository } from "@/modules/tasks/data/task.repository";
import type { Task } from "@/modules/tasks/domain/types";
import { createTaskService } from "@/modules/tasks/service/task.service";
import { FakeAudit } from "../fakes/fakes";

/**
 * M4 — remove com { force }. Por defeito bloqueia se a Task tiver atribuições
 * (protege o histórico do M5/M7); com force apaga em cascata (a cascata do
 * schema limpa assignments + runs + required_tools). Sem DB: repo fake.
 */

const admin: SessionContext = { userId: "u-admin", orgId: "o1", role: "super_admin" };

function build(opts: { assignments: number }) {
  const removed: string[] = [];
  const task: Task = {
    id: "t1",
    organizationId: "o1",
    areaId: null,
    name: "Duplicada",
    description: null,
    type: "automation",
    runtime: "email.digest",
    configSchema: null,
    createdAt: new Date(),
  };

  const repo = {
    async getById(id: string, orgId: string) {
      return id === task.id && orgId === "o1" ? task : null;
    },
    async countAssignments() {
      return opts.assignments;
    },
    async remove(id: string) {
      removed.push(id);
      return true;
    },
  } as unknown as TaskRepository;

  const audit = new FakeAudit();
  const service = createTaskService({
    repo,
    // deps não exercitadas pelo remove — stubs tipados.
    tools: {} as never,
    schema: {} as never,
    isKnownRuntime: () => true,
    publication: {} as never,
    audit,
  });
  return { service, removed, audit };
}

describe("taskService.remove", () => {
  it("bloqueia (TASK_HAS_ASSIGNMENTS) quando há atribuições e não se força", async () => {
    const { service, removed } = build({ assignments: 3 });
    await expect(service.remove(admin, "t1")).rejects.toMatchObject({
      code: "TASK_HAS_ASSIGNMENTS",
      details: { assignments: 3 },
    });
    expect(removed).toHaveLength(0);
  });

  it("apaga em cascata com { force: true } apesar das atribuições", async () => {
    const { service, removed, audit } = build({ assignments: 3 });
    await service.remove(admin, "t1", { force: true });
    expect(removed).toEqual(["t1"]);
    const ev = audit.entries.find((e) => e.action === "task.deleted");
    expect(ev?.metadata).toMatchObject({ assignments: 3, forced: true });
  });

  it("apaga normalmente (forced=false) quando não há atribuições", async () => {
    const { service, removed, audit } = build({ assignments: 0 });
    await service.remove(admin, "t1");
    expect(removed).toEqual(["t1"]);
    const ev = audit.entries.find((e) => e.action === "task.deleted");
    expect(ev?.metadata).toMatchObject({ assignments: 0, forced: false });
  });
});
