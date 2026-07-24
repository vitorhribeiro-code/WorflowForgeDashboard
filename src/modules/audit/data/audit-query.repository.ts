import { and, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db/client";
import { auditLogs, users } from "@/db/schema";
import { offsetOf } from "../domain/pagination";
import type { AuditFilter, AuditLogRow, PageRequest } from "../domain/types";

// Interface de saída. O service depende SÓ disto, nunca do Drizzle.
export interface AuditQueryRepository {
  list(
    orgId: string,
    filter: AuditFilter,
    page: PageRequest,
  ): Promise<{ rows: AuditLogRow[]; total: number }>;
}

// -------------------------------------------------------------------------- //
//  NOTA de schema: `audit_logs` NÃO tem org_id e `actor_id` é nullable        //
//  (onDelete: set null). Para isolar por org fazemos INNER JOIN a `users`     //
//  pelo actor_id — o que exclui logs de atores já apagados. É a leitura       //
//  correta dentro do schema atual; recomenda-se migração (ver notas §Integr). //
// -------------------------------------------------------------------------- //
export class DrizzleAuditQueryRepository implements AuditQueryRepository {
  constructor(private readonly db: Db) {}

  async list(orgId: string, filter: AuditFilter, page: PageRequest) {
    const where = this.buildWhere(orgId, filter);

    const rows = await this.db
      .select({
        id: auditLogs.id,
        actorId: auditLogs.actorId,
        actorEmail: users.email,
        actorName: users.name,
        action: auditLogs.action,
        entity: auditLogs.entity,
        entityId: auditLogs.entityId,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .innerJoin(users, eq(users.id, auditLogs.actorId))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(page.pageSize)
      .offset(offsetOf(page));

    const [countRow] = await this.db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(auditLogs)
      .innerJoin(users, eq(users.id, auditLogs.actorId))
      .where(where);

    return {
      rows: rows.map(
        (r): AuditLogRow => ({
          id: r.id,
          actorId: r.actorId,
          actorEmail: r.actorEmail ?? null,
          actorName: r.actorName ?? null,
          action: r.action,
          entity: r.entity,
          entityId: r.entityId,
          metadata: (r.metadata as Record<string, unknown> | null) ?? null,
          createdAt: r.createdAt,
        }),
      ),
      total: countRow?.count ?? 0,
    };
  }

  private buildWhere(orgId: string, filter: AuditFilter): SQL | undefined {
    const conds: SQL[] = [eq(users.organizationId, orgId)];
    if (filter.actorId) conds.push(eq(auditLogs.actorId, filter.actorId));
    if (filter.action) conds.push(eq(auditLogs.action, filter.action));
    if (filter.entity) conds.push(eq(auditLogs.entity, filter.entity));
    if (filter.entityId) conds.push(eq(auditLogs.entityId, filter.entityId));
    if (filter.from) conds.push(gte(auditLogs.createdAt, filter.from));
    if (filter.to) conds.push(lt(auditLogs.createdAt, filter.to)); // [from, to)
    return and(...conds);
  }
}
