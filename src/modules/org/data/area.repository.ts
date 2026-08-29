import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { functionalAreas, taskAreas } from "@/db/schema";
import type { FunctionalArea } from "../domain/types";

export interface AreaRepository {
  create(orgId: string, input: { name: string; description?: string | null }): Promise<FunctionalArea>;
  update(id: string, orgId: string, patch: { name?: string; description?: string | null }): Promise<FunctionalArea | null>;
  getById(id: string, orgId: string): Promise<FunctionalArea | null>;
  getByName(orgId: string, name: string): Promise<FunctionalArea | null>;
  list(orgId: string): Promise<FunctionalArea[]>;
  countTasks(areaId: string): Promise<number>;
  remove(id: string, orgId: string): Promise<boolean>;
}

function toArea(row: typeof functionalAreas.$inferSelect): FunctionalArea {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
  };
}

export class DrizzleAreaRepository implements AreaRepository {
  constructor(private readonly db: Db) {}

  async create(orgId: string, input: { name: string; description?: string | null }): Promise<FunctionalArea> {
    const [row] = await this.db
      .insert(functionalAreas)
      .values({ organizationId: orgId, name: input.name, description: input.description ?? null })
      .returning();
    return toArea(row!);
  }

  async update(id: string, orgId: string, patch: { name?: string; description?: string | null }) {
    const values: Partial<typeof functionalAreas.$inferInsert> = {};
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.description !== undefined) values.description = patch.description;
    if (Object.keys(values).length === 0) return this.getById(id, orgId);
    const [row] = await this.db
      .update(functionalAreas)
      .set(values)
      .where(and(eq(functionalAreas.id, id), eq(functionalAreas.organizationId, orgId)))
      .returning();
    return row ? toArea(row) : null;
  }

  async getById(id: string, orgId: string): Promise<FunctionalArea | null> {
    const [row] = await this.db
      .select()
      .from(functionalAreas)
      .where(and(eq(functionalAreas.id, id), eq(functionalAreas.organizationId, orgId)))
      .limit(1);
    return row ? toArea(row) : null;
  }

  async getByName(orgId: string, name: string): Promise<FunctionalArea | null> {
    const [row] = await this.db
      .select()
      .from(functionalAreas)
      .where(and(eq(functionalAreas.organizationId, orgId), eq(functionalAreas.name, name)))
      .limit(1);
    return row ? toArea(row) : null;
  }

  async list(orgId: string): Promise<FunctionalArea[]> {
    const rows = await this.db
      .select()
      .from(functionalAreas)
      .where(eq(functionalAreas.organizationId, orgId))
      .orderBy(asc(functionalAreas.name));
    return rows.map(toArea);
  }

  // Conta quantas tarefas estão DISPONÍVEIS nesta área via task_areas — a fonte
  // de verdade da associação tarefa↔área (o `tasks.area_id` legado já não é
  // escrito pela UI). É este count que trava o apagar de uma área com tarefas
  // (task_areas tem onDelete: cascade, logo apagar levaria a disponibilidade).
  async countTasks(areaId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(taskAreas)
      .where(eq(taskAreas.areaId, areaId));
    return row?.n ?? 0;
  }

  async remove(id: string, orgId: string): Promise<boolean> {
    const rows = await this.db
      .delete(functionalAreas)
      .where(and(eq(functionalAreas.id, id), eq(functionalAreas.organizationId, orgId)))
      .returning({ id: functionalAreas.id });
    return rows.length > 0;
  }
}
