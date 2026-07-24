import { DomainError } from "@/lib/errors";
import type { SessionContext } from "@/lib/session";
import type { AuditPort } from "@/lib/audit";
import type { OrganizationRepository } from "../data/organization.repository";
import type { Organization } from "../domain/types";
import { requireAdmin } from "./guards";

export type OrganizationServiceDeps = { repo: OrganizationRepository; audit: AuditPort };

export function createOrganizationService({ repo, audit }: OrganizationServiceDeps) {
  return {
    async get(session: SessionContext): Promise<Organization> {
      requireAdmin(session);
      const org = await repo.getById(session.orgId);
      if (!org) throw new DomainError("ORG_NOT_FOUND", "Organização inexistente", 404);
      return org;
    },

    // Só o name é editável; o slug é imutável após criação (recomendado).
    async rename(session: SessionContext, name: string): Promise<Organization> {
      requireAdmin(session);
      const updated = await repo.updateName(session.orgId, name.trim());
      if (!updated) throw new DomainError("ORG_NOT_FOUND", "Organização inexistente", 404);
      try {
        await audit.record({
          actorId: session.userId,
          action: "organization.renamed",
          entity: "organization",
          entityId: session.orgId,
        });
      } catch (err) {
        console.error("[audit] falha", err);
      }
      return updated;
    },
  };
}
