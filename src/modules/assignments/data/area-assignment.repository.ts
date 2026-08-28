// Repositório da intenção ao nível da área (Slice 3a.2): a tabela
// area_assignments. Upsert por (area, task); leituras para o fan-out/reconcile.
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { areaAssignments } from "@/db/schema";

export type AreaAssignmentRow = { taskId: string; enabled: boolean };

export interface AreaAssignmentRepository {
  // Grava a intenção (cria ou atualiza o enabled/by/at) por (area, task).
  upsert(
    areaId: string,
    taskId: string,
    patch: { enabled: boolean; enabledBy: string | null; enabledAt: Date | null },
  ): Promise<void>;
  get(areaId: string, taskId: string): Promise<{ enabled: boolean } | null>;
  remove(areaId: string, taskId: string): Promise<boolean>;
  // Tarefas com intenção ON numa área (fonte do reconcile).
  listEnabledTaskIds(areaId: string): Promise<string[]>;
  // Todas as intenções da área (para a matriz de áreas — 3b).
  listByArea(areaId: string): Promise<AreaAssignmentRow[]>;
}

export class DrizzleAreaAssignmentRepository implements AreaAssignmentRepository {
  constructor(private readonly db: Db) {}

  async upsert(
    areaId: string,
    taskId: string,
    patch: { enabled: boolean; enabledBy: string | null; enabledAt: Date | null },
  ): Promise<void> {
    await this.db
      .insert(areaAssignments)
      .values({
        areaId,
        taskId,
        enabled: patch.enabled,
        enabledBy: patch.enabledBy,
        enabledAt: patch.enabledAt,
      })
      .onConflictDoUpdate({
        target: [areaAssignments.areaId, areaAssignments.taskId],
        set: {
          enabled: patch.enabled,
          enabledBy: patch.enabledBy,
          enabledAt: patch.enabledAt,
        },
      });
  }

  async get(areaId: string, taskId: string): Promise<{ enabled: boolean } | null> {
    const [row] = await this.db
      .select({ enabled: areaAssignments.enabled })
      .from(areaAssignments)
      .where(and(eq(areaAssignments.areaId, areaId), eq(areaAssignments.taskId, taskId)))
      .limit(1);
    return row ?? null;
  }

  async remove(areaId: string, taskId: string): Promise<boolean> {
    const rows = await this.db
      .delete(areaAssignments)
      .where(and(eq(areaAssignments.areaId, areaId), eq(areaAssignments.taskId, taskId)))
      .returning({ id: areaAssignments.id });
    return rows.length > 0;
  }

  async listEnabledTaskIds(areaId: string): Promise<string[]> {
    const rows = await this.db
      .select({ taskId: areaAssignments.taskId })
      .from(areaAssignments)
      .where(and(eq(areaAssignments.areaId, areaId), eq(areaAssignments.enabled, true)));
    return rows.map((r) => r.taskId);
  }

  async listByArea(areaId: string): Promise<AreaAssignmentRow[]> {
    const rows = await this.db
      .select({ taskId: areaAssignments.taskId, enabled: areaAssignments.enabled })
      .from(areaAssignments)
      .where(eq(areaAssignments.areaId, areaId));
    return rows;
  }
}
