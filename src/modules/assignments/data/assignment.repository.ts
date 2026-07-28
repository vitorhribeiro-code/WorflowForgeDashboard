import { and, eq, isNotNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { taskAssignments, tasks } from "@/db/schema";
import type { NewAssignment, TaskAssignment } from "../domain/types";

export type EnablePatch = {
  enabled: boolean;
  enabledBy: string | null;
  enabledAt: Date | null;
};

export interface AssignmentRepository {
  create(input: NewAssignment): Promise<TaskAssignment>;
  findByTaskWorker(taskId: string, workerId: string): Promise<TaskAssignment | null>;
  // Escopado por org (join à Task) — evita vazar entre tenants.
  getByIdInOrg(id: string, orgId: string): Promise<TaskAssignment | null>;
  getById(id: string): Promise<TaskAssignment | null>; // sem escopo (port p/ M7)
  listByOrg(orgId: string): Promise<TaskAssignment[]>;
  listByWorker(workerId: string): Promise<TaskAssignment[]>;
  // Candidatas do scheduler: ativas, automáticas e com cron. Contexto de
  // SISTEMA (cross-tenant) — o scheduler corre para toda a plataforma.
  listScheduledActive(): Promise<{ assignmentId: string; schedule: string }[]>;
  setEnabled(id: string, patch: EnablePatch): Promise<TaskAssignment | null>;
  updateConfig(id: string, config: Record<string, unknown> | null): Promise<TaskAssignment | null>;
  updateSchedule(id: string, schedule: string | null): Promise<TaskAssignment | null>;
  // Suspensão em massa (propagação de despublicar/revogar).
  suspendForTask(taskId: string): Promise<number>;
  disableIfEnabled(id: string): Promise<boolean>;
}

function toAssignment(row: typeof taskAssignments.$inferSelect): TaskAssignment {
  return {
    id: row.id,
    taskId: row.taskId,
    workerId: row.workerId,
    enabled: row.enabled,
    schedule: row.schedule,
    delivery: row.delivery,
    config: (row.config as Record<string, unknown> | null) ?? null,
    enabledBy: row.enabledBy,
    enabledAt: row.enabledAt,
    createdAt: row.createdAt,
  };
}

export class DrizzleAssignmentRepository implements AssignmentRepository {
  constructor(private readonly db: Db) {}

  async create(input: NewAssignment): Promise<TaskAssignment> {
    const [row] = await this.db
      .insert(taskAssignments)
      .values({
        taskId: input.taskId,
        workerId: input.workerId,
        config: input.config ?? null,
        schedule: input.schedule ?? null,
        delivery: input.delivery ?? null,
        enabled: false,
      })
      .returning();
    return toAssignment(row!);
  }

  async findByTaskWorker(taskId: string, workerId: string): Promise<TaskAssignment | null> {
    const [row] = await this.db
      .select()
      .from(taskAssignments)
      .where(and(eq(taskAssignments.taskId, taskId), eq(taskAssignments.workerId, workerId)))
      .limit(1);
    return row ? toAssignment(row) : null;
  }

  async getByIdInOrg(id: string, orgId: string): Promise<TaskAssignment | null> {
    const [row] = await this.db
      .select({ a: taskAssignments })
      .from(taskAssignments)
      .innerJoin(tasks, eq(tasks.id, taskAssignments.taskId))
      .where(and(eq(taskAssignments.id, id), eq(tasks.organizationId, orgId)))
      .limit(1);
    return row ? toAssignment(row.a) : null;
  }

  async getById(id: string): Promise<TaskAssignment | null> {
    const [row] = await this.db
      .select()
      .from(taskAssignments)
      .where(eq(taskAssignments.id, id))
      .limit(1);
    return row ? toAssignment(row) : null;
  }

  async listByOrg(orgId: string): Promise<TaskAssignment[]> {
    const rows = await this.db
      .select({ a: taskAssignments })
      .from(taskAssignments)
      .innerJoin(tasks, eq(tasks.id, taskAssignments.taskId))
      .where(eq(tasks.organizationId, orgId));
    return rows.map((r) => toAssignment(r.a));
  }

  async listByWorker(workerId: string): Promise<TaskAssignment[]> {
    const rows = await this.db
      .select()
      .from(taskAssignments)
      .where(eq(taskAssignments.workerId, workerId));
    return rows.map(toAssignment);
  }

  async setEnabled(id: string, patch: EnablePatch): Promise<TaskAssignment | null> {
    const [row] = await this.db
      .update(taskAssignments)
      .set({ enabled: patch.enabled, enabledBy: patch.enabledBy, enabledAt: patch.enabledAt })
      .where(eq(taskAssignments.id, id))
      .returning();
    return row ? toAssignment(row) : null;
  }

  async updateConfig(id: string, config: Record<string, unknown> | null): Promise<TaskAssignment | null> {
    const [row] = await this.db
      .update(taskAssignments)
      .set({ config })
      .where(eq(taskAssignments.id, id))
      .returning();
    return row ? toAssignment(row) : null;
  }

  async updateSchedule(id: string, schedule: string | null): Promise<TaskAssignment | null> {
    const [row] = await this.db
      .update(taskAssignments)
      .set({ schedule })
      .where(eq(taskAssignments.id, id))
      .returning();
    return row ? toAssignment(row) : null;
  }

  async listScheduledActive(): Promise<{ assignmentId: string; schedule: string }[]> {
    const rows = await this.db
      .select({ assignmentId: taskAssignments.id, schedule: taskAssignments.schedule })
      .from(taskAssignments)
      .innerJoin(tasks, eq(taskAssignments.taskId, tasks.id))
      .where(
        and(
          eq(taskAssignments.enabled, true),
          eq(tasks.type, "automation"),
          isNotNull(taskAssignments.schedule),
        ),
      );
    // O isNotNull já filtra no SQL; o guard tipa `schedule` como string.
    return rows.flatMap((r) =>
      r.schedule ? [{ assignmentId: r.assignmentId, schedule: r.schedule }] : [],
    );
  }

  async suspendForTask(taskId: string): Promise<number> {
    const rows = await this.db
      .update(taskAssignments)
      .set({ enabled: false, enabledBy: null, enabledAt: null })
      .where(and(eq(taskAssignments.taskId, taskId), eq(taskAssignments.enabled, true)))
      .returning({ id: taskAssignments.id });
    return rows.length;
  }

  async disableIfEnabled(id: string): Promise<boolean> {
    const rows = await this.db
      .update(taskAssignments)
      .set({ enabled: false, enabledBy: null, enabledAt: null })
      .where(and(eq(taskAssignments.id, id), eq(taskAssignments.enabled, true)))
      .returning({ id: taskAssignments.id });
    return rows.length > 0;
  }
}
