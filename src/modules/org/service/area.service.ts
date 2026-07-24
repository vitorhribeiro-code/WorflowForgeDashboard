import type { AuditEvent, AuditPort } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import type { SessionContext } from "@/lib/session";
import type { AreaRepository } from "../data/area.repository";
import type { FunctionalArea } from "../domain/types";
import { requireAdmin } from "./guards";

export type AreaServiceDeps = { repo: AreaRepository; audit: AuditPort };

async function safeAudit(audit: AuditPort, ev: AuditEvent): Promise<void> {
  try {
    await audit.record(ev);
  } catch (err) {
    console.error("[audit] falha ao registar", ev.action, err);
  }
}

export function createAreaService({ repo, audit }: AreaServiceDeps) {
  return {
    async list(session: SessionContext): Promise<FunctionalArea[]> {
      requireAdmin(session);
      return repo.list(session.orgId);
    },

    // name único por org (guard aplicacional; recomendar índice único).
    async create(
      session: SessionContext,
      input: { name: string; description?: string | null },
    ): Promise<FunctionalArea> {
      requireAdmin(session);
      const name = input.name.trim();
      if (await repo.getByName(session.orgId, name)) {
        throw new DomainError("AREA_NAME_TAKEN", "Nome de área duplicado", 409);
      }
      const area = await repo.create(session.orgId, { name, description: input.description ?? null });
      await safeAudit(audit, {
        actorId: session.userId,
        action: "area.created",
        entity: "functional_area",
        entityId: area.id,
      });
      return area;
    },

    async update(
      session: SessionContext,
      id: string,
      patch: { name?: string; description?: string | null },
    ): Promise<FunctionalArea> {
      requireAdmin(session);
      const current = await repo.getById(id, session.orgId);
      if (!current) throw new DomainError("AREA_NOT_FOUND", "Área inexistente", 404);
      if (patch.name !== undefined) {
        const name = patch.name.trim();
        const other = await repo.getByName(session.orgId, name);
        if (other && other.id !== id) {
          throw new DomainError("AREA_NAME_TAKEN", "Nome de área duplicado", 409);
        }
      }
      const updated = await repo.update(id, session.orgId, patch);
      return updated!;
    },

    // Área com Tasks não pode ser removida — bloqueia e sugere reatribuir.
    async remove(session: SessionContext, id: string): Promise<void> {
      requireAdmin(session);
      const area = await repo.getById(id, session.orgId);
      if (!area) throw new DomainError("AREA_NOT_FOUND", "Área inexistente", 404);
      const taskCount = await repo.countTasks(id);
      if (taskCount > 0) {
        throw new DomainError("AREA_HAS_TASKS", "Área com Tasks não pode ser removida", 409, {
          taskCount,
        });
      }
      await repo.remove(id, session.orgId);
      await safeAudit(audit, {
        actorId: session.userId,
        action: "area.removed",
        entity: "functional_area",
        entityId: id,
      });
    },
  };
}
