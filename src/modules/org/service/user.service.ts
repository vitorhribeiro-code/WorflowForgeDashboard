import type { AuditEvent, AuditPort } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import type { Role, SessionContext } from "@/lib/session";
import type { UserRepository } from "../data/user.repository";
import { wouldLeaveNoAdmin } from "../domain/rules";
import type { User } from "../domain/types";
import { requireAdmin } from "./guards";

export type UserServiceDeps = { repo: UserRepository; audit: AuditPort };

async function safeAudit(audit: AuditPort, ev: AuditEvent): Promise<void> {
  try {
    await audit.record(ev);
  } catch (err) {
    console.error("[audit] falha ao registar", ev.action, err);
  }
}

export function createUserService({ repo, audit }: UserServiceDeps) {
  async function loadInOrg(session: SessionContext, id: string): Promise<User> {
    const u = await repo.getInOrg(id, session.orgId);
    if (!u) throw new DomainError("USER_NOT_FOUND", "Utilizador inexistente", 404);
    return u;
  }

  return {
    async list(session: SessionContext): Promise<User[]> {
      requireAdmin(session);
      return repo.list(session.orgId);
    },

    // Convite: gera worker por defeito; email único (global, schema).
    async invite(
      session: SessionContext,
      input: { email: string; role?: Role; name?: string | null },
    ): Promise<User> {
      requireAdmin(session);
      const email = input.email.trim().toLowerCase();
      if (await repo.findByEmail(email)) {
        throw new DomainError("EMAIL_TAKEN", "Email já registado", 409);
      }
      const user = await repo.create(session.orgId, {
        email,
        name: input.name ?? null,
        role: input.role ?? "worker",
      });
      await safeAudit(audit, {
        actorId: session.userId,
        action: "user.invited",
        entity: "user",
        entityId: user.id,
        metadata: { role: user.role },
      });
      return user;
    },

    // Mudar role. Despromover o último admin a worker é bloqueado.
    async changeRole(session: SessionContext, id: string, role: Role): Promise<User> {
      requireAdmin(session);
      const user = await loadInOrg(session, id);
      if (user.role === "super_admin" && role === "worker") {
        const admins = await repo.countAdmins(session.orgId);
        if (wouldLeaveNoAdmin(admins, true)) {
          throw new DomainError("LAST_ADMIN", "A org tem de manter ≥1 admin", 409);
        }
      }
      const updated = await repo.setRole(id, role);
      await safeAudit(audit, {
        actorId: session.userId,
        action: "user.role_changed",
        entity: "user",
        entityId: id,
        metadata: { role },
      });
      return updated!;
    },

    // Desativar (suspender). Não se pode desativar o último admin.
    async deactivate(session: SessionContext, id: string): Promise<void> {
      requireAdmin(session);
      const user = await loadInOrg(session, id);
      if (user.role === "super_admin") {
        const admins = await repo.countAdmins(session.orgId);
        if (wouldLeaveNoAdmin(admins, true)) {
          throw new DomainError("LAST_ADMIN", "A org tem de manter ≥1 admin", 409);
        }
      }
      await repo.setSuspended(id, true);
      await safeAudit(audit, {
        actorId: session.userId,
        action: "user.deactivated",
        entity: "user",
        entityId: id,
      });
    },

    async reactivate(session: SessionContext, id: string): Promise<void> {
      requireAdmin(session);
      await loadInOrg(session, id);
      await repo.setSuspended(id, false);
      await safeAudit(audit, {
        actorId: session.userId,
        action: "user.reactivated",
        entity: "user",
        entityId: id,
      });
    },
  };
}
