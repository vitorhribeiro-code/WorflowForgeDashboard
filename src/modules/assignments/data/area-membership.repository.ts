// Repositório da pertença a áreas (Slice 3a): as junções task_areas e
// user_areas. Escrita por "substituição de conjunto" (replace) numa transação;
// leituras por entidade e leituras por org (para a matriz de disponibilidade).
import { and, eq, notInArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { functionalAreas, taskAreas, tasks, userAreas, users } from "@/db/schema";

export type AreaPair = { taskId: string; areaId: string };
export type UserAreaPair = { userId: string; areaId: string };

export interface AreaMembershipRepository {
  getAreaIdsForTask(taskId: string): Promise<string[]>;
  setAreaIdsForTask(taskId: string, areaIds: string[]): Promise<void>;
  getAreaIdsForUser(userId: string): Promise<string[]>;
  setAreaIdsForUser(userId: string, areaIds: string[]): Promise<void>;
  // Leituras por org (join às tabelas base) — alimentam a matriz.
  listTaskAreasByOrg(orgId: string): Promise<AreaPair[]>;
  listUserAreasByOrg(orgId: string): Promise<UserAreaPair[]>;
  // Reverso por área — alimentam o fan-out/reconcile (Slice 3a.2).
  listUserIdsByArea(areaId: string): Promise<string[]>;
  listTaskIdsByArea(areaId: string): Promise<string[]>;
}

export class DrizzleAreaMembershipRepository implements AreaMembershipRepository {
  constructor(private readonly db: Db) {}

  async getAreaIdsForTask(taskId: string): Promise<string[]> {
    const rows = await this.db
      .select({ areaId: taskAreas.areaId })
      .from(taskAreas)
      .where(eq(taskAreas.taskId, taskId));
    return rows.map((r) => r.areaId);
  }

  async setAreaIdsForTask(taskId: string, areaIds: string[]): Promise<void> {
    const wanted = [...new Set(areaIds)];
    await this.db.transaction(async (tx) => {
      // Remove as áreas que já não são desejadas (ou todas, se wanted vazio).
      await tx
        .delete(taskAreas)
        .where(
          wanted.length
            ? and(eq(taskAreas.taskId, taskId), notInArray(taskAreas.areaId, wanted))
            : eq(taskAreas.taskId, taskId),
        );
      if (wanted.length) {
        await tx
          .insert(taskAreas)
          .values(wanted.map((areaId) => ({ taskId, areaId })))
          .onConflictDoNothing();
      }
    });
  }

  async getAreaIdsForUser(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ areaId: userAreas.areaId })
      .from(userAreas)
      .where(eq(userAreas.userId, userId));
    return rows.map((r) => r.areaId);
  }

  async setAreaIdsForUser(userId: string, areaIds: string[]): Promise<void> {
    const wanted = [...new Set(areaIds)];
    await this.db.transaction(async (tx) => {
      await tx
        .delete(userAreas)
        .where(
          wanted.length
            ? and(eq(userAreas.userId, userId), notInArray(userAreas.areaId, wanted))
            : eq(userAreas.userId, userId),
        );
      if (wanted.length) {
        await tx
          .insert(userAreas)
          .values(wanted.map((areaId) => ({ userId, areaId })))
          .onConflictDoNothing();
      }
    });
  }

  async listTaskAreasByOrg(orgId: string): Promise<AreaPair[]> {
    const rows = await this.db
      .select({ taskId: taskAreas.taskId, areaId: taskAreas.areaId })
      .from(taskAreas)
      .innerJoin(tasks, eq(tasks.id, taskAreas.taskId))
      .where(eq(tasks.organizationId, orgId));
    return rows;
  }

  async listUserAreasByOrg(orgId: string): Promise<UserAreaPair[]> {
    const rows = await this.db
      .select({ userId: userAreas.userId, areaId: userAreas.areaId })
      .from(userAreas)
      .innerJoin(users, eq(users.id, userAreas.userId))
      .where(eq(users.organizationId, orgId));
    return rows;
  }

  async listUserIdsByArea(areaId: string): Promise<string[]> {
    const rows = await this.db
      .select({ userId: userAreas.userId })
      .from(userAreas)
      .where(eq(userAreas.areaId, areaId));
    return rows.map((r) => r.userId);
  }

  async listTaskIdsByArea(areaId: string): Promise<string[]> {
    const rows = await this.db
      .select({ taskId: taskAreas.taskId })
      .from(taskAreas)
      .where(eq(taskAreas.areaId, areaId));
    return rows.map((r) => r.taskId);
  }
}
