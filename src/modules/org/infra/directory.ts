import type { UserRepository } from "../data/user.repository";
import type { UserDirectoryPort, WorkerDirectoryPort } from "../service/ports";

// Adaptadores sobre o UserRepository — são o que M1/M5/M9 recebem por injeção.
export function createUserDirectory(repo: UserRepository): UserDirectoryPort {
  return {
    async findByEmail(email) {
      const u = await repo.findByEmail(email);
      return u ? { id: u.id, orgId: u.organizationId, role: u.role, suspended: u.suspended } : null;
    },
    async findById(id) {
      const u = await repo.getById(id);
      return u ? { id: u.id, orgId: u.organizationId, role: u.role, suspended: u.suspended } : null;
    },
  };
}

export function createWorkerDirectory(repo: UserRepository): WorkerDirectoryPort {
  return {
    async getWorkerOrg(workerId) {
      const u = await repo.getById(workerId);
      return u?.organizationId ?? null;
    },
    async listWorkers(orgId) {
      const users = await repo.list(orgId);
      return users.map((u) => ({ id: u.id, orgId: u.organizationId }));
    },
  };
}
