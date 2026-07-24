import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { tools } from "@/db/schema";
import type { NewTool, Tool, ToolAuthType, ToolPatch } from "../domain/types";

export interface ToolRepository {
  create(input: NewTool): Promise<Tool>;
  update(id: string, patch: ToolPatch): Promise<Tool | null>;
  getById(id: string): Promise<Tool | null>;
  getByKey(key: string): Promise<Tool | null>;
  list(): Promise<Tool[]>;
}

function toTool(row: typeof tools.$inferSelect): Tool {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    authType: row.authType as ToolAuthType,
    availableScopes: (row.availableScopes as string[]) ?? [],
    createdAt: row.createdAt,
  };
}

// Único ficheiro do M3 com SQL/Drizzle. Tool é global → sem filtro por org.
export class DrizzleToolRepository implements ToolRepository {
  constructor(private readonly db: Db) {}

  async create(input: NewTool): Promise<Tool> {
    const [row] = await this.db
      .insert(tools)
      .values({
        key: input.key,
        name: input.name,
        authType: input.authType,
        availableScopes: input.availableScopes,
      })
      .returning();
    return toTool(row!);
  }

  async update(id: string, patch: ToolPatch): Promise<Tool | null> {
    const values: Partial<typeof tools.$inferInsert> = {};
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.availableScopes !== undefined) values.availableScopes = patch.availableScopes;
    if (Object.keys(values).length === 0) return this.getById(id);

    const [row] = await this.db
      .update(tools)
      .set(values)
      .where(eq(tools.id, id))
      .returning();
    return row ? toTool(row) : null;
  }

  async getById(id: string): Promise<Tool | null> {
    const [row] = await this.db.select().from(tools).where(eq(tools.id, id)).limit(1);
    return row ? toTool(row) : null;
  }

  async getByKey(key: string): Promise<Tool | null> {
    const [row] = await this.db.select().from(tools).where(eq(tools.key, key)).limit(1);
    return row ? toTool(row) : null;
  }

  async list(): Promise<Tool[]> {
    const rows = await this.db.select().from(tools).orderBy(asc(tools.name));
    return rows.map(toTool);
  }
}
