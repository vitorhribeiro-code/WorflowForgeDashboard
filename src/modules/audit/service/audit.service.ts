import type { SessionContext } from "@/lib/session";
import type { AuditQueryRepository } from "../data/audit-query.repository";
import { paginate } from "../domain/pagination";
import type { AuditFilter, AuditLogRow, PageRequest, Paginated } from "../domain/types";
import { requireAdmin } from "./guards";

export type AuditServiceDeps = {
  repo: AuditQueryRepository;
};

export type AuditListInput = {
  filter: AuditFilter;
  page: PageRequest;
};

export type AuditService = ReturnType<typeof createAuditService>;

// Service puro: sem DB nem rede diretos. Recebe o repo por injeção → testável.
export function createAuditService({ repo }: AuditServiceDeps) {
  return {
    // Lista paginada de logs da organização da sessão. Admin-only.
    async list(
      session: SessionContext,
      input: AuditListInput,
    ): Promise<Paginated<AuditLogRow>> {
      requireAdmin(session);
      const { rows, total } = await repo.list(session.orgId, input.filter, input.page);
      return paginate(rows, total, input.page);
    },
  };
}
