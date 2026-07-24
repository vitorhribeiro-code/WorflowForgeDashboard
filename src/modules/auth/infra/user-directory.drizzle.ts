import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { users } from "@/db/schema";
import type { Role } from "@/lib/session";
import type { AuthUser } from "../domain/types";
import type { UserDirectoryPort } from "../service/ports";

// Adaptador sobre `users` (M2 ainda não existe). `suspended` é sempre false até
// à migração `ALTER TABLE users ADD COLUMN suspended boolean ...`.
export function createDrizzleUserDirectory(db: Db): UserDirectoryPort {
  const map = (row: { id: string; organizationId: string; role: string }): AuthUser => ({
    id: row.id,
    orgId: row.organizationId,
    role: row.role as Role,
    suspended: false,
  });

  return {
    async findByEmail(email: string): Promise<AuthUser | null> {
      const [row] = await db
        .select({ id: users.id, organizationId: users.organizationId, role: users.role })
        .from(users)
        .where(eq(sql`lower(${users.email})`, email))
        .limit(1);
      return row ? map(row) : null;
    },
    async findById(id: string): Promise<AuthUser | null> {
      const [row] = await db
        .select({ id: users.id, organizationId: users.organizationId, role: users.role })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      return row ? map(row) : null;
    },
  };
}
