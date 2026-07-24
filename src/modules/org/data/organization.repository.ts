import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { organizations } from "@/db/schema";
import type { Organization } from "../domain/types";

export interface OrganizationRepository {
  getById(id: string): Promise<Organization | null>;
  getBySlug(slug: string): Promise<Organization | null>;
  updateName(id: string, name: string): Promise<Organization | null>;
}

function toOrg(row: typeof organizations.$inferSelect): Organization {
  return { id: row.id, name: row.name, slug: row.slug, createdAt: row.createdAt };
}

export class DrizzleOrganizationRepository implements OrganizationRepository {
  constructor(private readonly db: Db) {}

  async getById(id: string): Promise<Organization | null> {
    const [row] = await this.db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    return row ? toOrg(row) : null;
  }
  async getBySlug(slug: string): Promise<Organization | null> {
    const [row] = await this.db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
    return row ? toOrg(row) : null;
  }
  // slug é imutável (recomendado): só o name é editável.
  async updateName(id: string, name: string): Promise<Organization | null> {
    const [row] = await this.db
      .update(organizations)
      .set({ name })
      .where(eq(organizations.id, id))
      .returning();
    return row ? toOrg(row) : null;
  }
}
