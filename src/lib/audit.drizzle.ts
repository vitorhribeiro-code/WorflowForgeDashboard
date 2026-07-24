// Impl Drizzle do AuditPort (append-only). No repo real vive aqui; uma só cópia.
import type { Db } from "@/db/client";
import { auditLogs } from "@/db/schema";
import type { AuditEvent, AuditPort } from "./audit";

export function createDrizzleAudit(db: Db): AuditPort {
  return {
    async record(ev: AuditEvent): Promise<void> {
      await db.insert(auditLogs).values({
        actorId: ev.actorId,
        action: ev.action,
        entity: ev.entity,
        entityId: ev.entityId ?? null,
        metadata: ev.metadata ?? null,
      });
    },
  };
}
