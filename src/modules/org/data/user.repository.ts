import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { users } from "@/db/schema";
import type { NewUser, Role, User } from "../domain/types";

export interface UserRepository {
  create(orgId: string, input: NewUser): Promise<User>;
  getById(id: string): Promise<User | null>;
  getInOrg(id: string, orgId: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>; // email é único GLOBAL (schema)
  list(orgId: string): Promise<User[]>;
  countAdmins(orgId: string): Promise<number>;
  setRole(id: string, role: Role): Promise<User | null>;
  // Suspensão via SQL cru (migração: users.suspended). Ver notas de integração.
  setSuspended(id: string, suspended: boolean): Promise<void>;
}

// `suspended` não existe no schema — derivado como false na leitura normal.
function toUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    organizationId: row.organizationId,
    email: row.email,
    name: row.name,
    role: row.role as Role,
    suspended: false,
    createdAt: row.createdAt,
  };
}

export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: Db) {}

  async create(orgId: string, input: NewUser): Promise<User> {
    const [row] = await this.db
      .insert(users)
      .values({
        organizationId: orgId,
        email: input.email,
        name: input.name ?? null,
        role: input.role,
        mappingRef: input.mappingRef ?? null,
      })
      .returning();
    return toUser(row!);
  }

  async getById(id: string): Promise<User | null> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ? toUser(row) : null;
  }

  async getInOrg(id: string, orgId: string): Promise<User | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.organizationId, orgId)))
      .limit(1);
    return row ? toUser(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(sql`lower(${users.email})`, email.toLowerCase()))
      .limit(1);
    return row ? toUser(row) : null;
  }

  async list(orgId: string): Promise<User[]> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.organizationId, orgId))
      .orderBy(asc(users.email));
    return rows.map(toUser);
  }

  async countAdmins(orgId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(users)
      .where(and(eq(users.organizationId, orgId), eq(users.role, "super_admin")));
    return row?.n ?? 0;
  }

  async setRole(id: string, role: Role): Promise<User | null> {
    const [row] = await this.db.update(users).set({ role }).where(eq(users.id, id)).returning();
    return row ? toUser(row) : null;
  }

  async setSuspended(id: string, suspended: boolean): Promise<void> {
    // Migração: ALTER TABLE users ADD COLUMN suspended boolean NOT NULL DEFAULT false;
    await this.db.execute(sql`update users set suspended = ${suspended} where id = ${id}`);
  }
}
