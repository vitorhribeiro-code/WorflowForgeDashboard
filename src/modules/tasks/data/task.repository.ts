import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { functionalAreas, taskAssignments, taskRequiredTools, tasks } from "@/db/schema";
import type { NewTask, RequiredTool, Task, TaskPatch, TaskType } from "../domain/types";

export interface TaskRepository {
  create(input: NewTask): Promise<Task>;
  update(id: string, orgId: string, patch: TaskPatch): Promise<Task | null>;
  getById(id: string, orgId: string): Promise<Task | null>;
  // Leitura sem escopo de org — SÓ para o port cross-module (M5 valida o tenant).
  findById(id: string): Promise<Task | null>;
  list(orgId: string, filter: { areaId?: string; type?: TaskType }): Promise<Task[]>;
  areaExistsInOrg(areaId: string, orgId: string): Promise<boolean>;
  countAssignments(taskId: string): Promise<number>;
  // required_tools (substituição atómica).
  listRequiredTools(taskId: string): Promise<RequiredTool[]>;
  setRequiredTools(taskId: string, items: RequiredTool[]): Promise<void>;
}

function toTask(row: typeof tasks.$inferSelect): Task {
  return {
    id: row.id,
    organizationId: row.organizationId,
    areaId: row.areaId,
    name: row.name,
    description: row.description,
    type: row.type as TaskType,
    runtime: row.runtime,
    configSchema: (row.configSchema as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt,
  };
}

// Único ficheiro do M4 com SQL/Drizzle. Tudo escopado por organization_id.
export class DrizzleTaskRepository implements TaskRepository {
  constructor(private readonly db: Db) {}

  async create(input: NewTask): Promise<Task> {
    const [row] = await this.db
      .insert(tasks)
      .values({
        organizationId: input.organizationId,
        areaId: input.areaId ?? null,
        name: input.name,
        description: input.description ?? null,
        type: input.type,
        runtime: input.runtime,
        configSchema: input.configSchema ?? null,
      })
      .returning();
    return toTask(row!);
  }

  async update(id: string, orgId: string, patch: TaskPatch): Promise<Task | null> {
    const values: Partial<typeof tasks.$inferInsert> = {};
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.description !== undefined) values.description = patch.description;
    if (patch.areaId !== undefined) values.areaId = patch.areaId;
    if (patch.runtime !== undefined) values.runtime = patch.runtime;
    if (patch.configSchema !== undefined) values.configSchema = patch.configSchema;
    if (Object.keys(values).length === 0) return this.getById(id, orgId);

    const [row] = await this.db
      .update(tasks)
      .set(values)
      .where(and(eq(tasks.id, id), eq(tasks.organizationId, orgId)))
      .returning();
    return row ? toTask(row) : null;
  }

  async getById(id: string, orgId: string): Promise<Task | null> {
    const [row] = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.organizationId, orgId)))
      .limit(1);
    return row ? toTask(row) : null;
  }

  async findById(id: string): Promise<Task | null> {
    const [row] = await this.db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    return row ? toTask(row) : null;
  }

  async list(orgId: string, filter: { areaId?: string; type?: TaskType }): Promise<Task[]> {
    const conds = [eq(tasks.organizationId, orgId)];
    if (filter.areaId) conds.push(eq(tasks.areaId, filter.areaId));
    if (filter.type) conds.push(eq(tasks.type, filter.type));
    const rows = await this.db
      .select()
      .from(tasks)
      .where(and(...conds))
      .orderBy(asc(tasks.name));
    return rows.map(toTask);
  }

  async areaExistsInOrg(areaId: string, orgId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: functionalAreas.id })
      .from(functionalAreas)
      .where(and(eq(functionalAreas.id, areaId), eq(functionalAreas.organizationId, orgId)))
      .limit(1);
    return Boolean(row);
  }

  async countAssignments(taskId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(taskAssignments)
      .where(eq(taskAssignments.taskId, taskId));
    return row?.n ?? 0;
  }

  async listRequiredTools(taskId: string): Promise<RequiredTool[]> {
    const rows = await this.db
      .select({ toolId: taskRequiredTools.toolId, scopes: taskRequiredTools.scopes })
      .from(taskRequiredTools)
      .where(eq(taskRequiredTools.taskId, taskId));
    return rows.map((r) => ({ toolId: r.toolId, scopes: (r.scopes as string[]) ?? [] }));
  }

  // Substituição atómica: apaga e reinsere dentro de transação.
  async setRequiredTools(taskId: string, items: RequiredTool[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(taskRequiredTools).where(eq(taskRequiredTools.taskId, taskId));
      if (items.length > 0) {
        await tx
          .insert(taskRequiredTools)
          .values(items.map((i) => ({ taskId, toolId: i.toolId, scopes: i.scopes })));
      }
    });
  }
}
