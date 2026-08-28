// Serviço de pertença a áreas (Slice 3a). Só super_admin. Escreve/lê as
// junções task_areas e user_areas e serve a matriz de disponibilidade
// (task_areas ∩ user_areas). O fan-out/reconcile das area_assignments é a 3a.2.
import { DomainError } from "@/lib/errors";
import type { AuditPort } from "@/lib/audit";
import type { SessionContext } from "@/lib/session";
import { requireAdmin } from "./guards";
import type {
  AreaMembershipRepository,
  AreaPair,
  UserAreaPair,
} from "../data/area-membership.repository";

// --- Portas mínimas para validar pertença ao tenant (org) --------------------

export interface AreaLookupPort {
  // Ids de áreas da org (para validar que os areaId pedidos pertencem à org).
  listIds(orgId: string): Promise<string[]>;
}
export interface TaskOrgLookupPort {
  // orgId da Task, ou null se não existir.
  getOrg(taskId: string): Promise<string | null>;
}
export interface WorkerOrgLookupPort {
  // orgId do trabalhador, ou null se não existir.
  getWorkerOrg(workerId: string): Promise<string | null>;
}

export interface AreaMembershipDeps {
  membership: AreaMembershipRepository;
  areas: AreaLookupPort;
  tasks: TaskOrgLookupPort;
  workers: WorkerOrgLookupPort;
  audit: AuditPort;
}

// Disponibilidade crua: os dois lados da interseção, para a matriz calcular o
// esbatido no cliente sem N queries.
export type AvailabilityMap = {
  taskAreas: AreaPair[]; // (taskId, areaId) disponíveis na org
  userAreas: UserAreaPair[]; // (userId, areaId) da org
};

export interface AreaMembershipService {
  setTaskAreas(session: SessionContext, taskId: string, areaIds: string[]): Promise<string[]>;
  setWorkerAreas(session: SessionContext, workerId: string, areaIds: string[]): Promise<string[]>;
  areasForTask(session: SessionContext, taskId: string): Promise<string[]>;
  areasForWorker(session: SessionContext, workerId: string): Promise<string[]>;
  availability(session: SessionContext): Promise<AvailabilityMap>;
}

export function createAreaMembershipService(deps: AreaMembershipDeps): AreaMembershipService {
  const { membership, areas, tasks, workers, audit } = deps;

  // Garante que todos os areaId pedidos pertencem à org da sessão.
  async function assertAreasInOrg(session: SessionContext, areaIds: string[]): Promise<void> {
    if (areaIds.length === 0) return;
    const inOrg = new Set(await areas.listIds(session.orgId));
    const bad = [...new Set(areaIds)].filter((id) => !inOrg.has(id));
    if (bad.length) {
      throw new DomainError("AREA_NOT_FOUND", "Área inexistente ou de outra org", 404, {
        areaIds: bad,
      });
    }
  }

  async function assertTaskInOrg(session: SessionContext, taskId: string): Promise<void> {
    const org = await tasks.getOrg(taskId);
    if (org !== session.orgId) {
      throw new DomainError("TASK_NOT_FOUND", "Tarefa inexistente ou de outra org", 404);
    }
  }

  async function assertWorkerInOrg(session: SessionContext, workerId: string): Promise<void> {
    const org = await workers.getWorkerOrg(workerId);
    if (org !== session.orgId) {
      throw new DomainError("WORKER_NOT_IN_ORG", "Trabalhador de outra org", 404);
    }
  }

  return {
    async setTaskAreas(session, taskId, areaIds) {
      requireAdmin(session);
      await assertTaskInOrg(session, taskId);
      await assertAreasInOrg(session, areaIds);
      const wanted = [...new Set(areaIds)];
      await membership.setAreaIdsForTask(taskId, wanted);
      await audit.record({
        actorId: session.userId,
        action: "task.areas_set",
        entity: "task",
        entityId: taskId,
        metadata: { areaIds: wanted },
      });
      return wanted;
    },

    async setWorkerAreas(session, workerId, areaIds) {
      requireAdmin(session);
      await assertWorkerInOrg(session, workerId);
      await assertAreasInOrg(session, areaIds);
      const wanted = [...new Set(areaIds)];
      await membership.setAreaIdsForUser(workerId, wanted);
      await audit.record({
        actorId: session.userId,
        action: "user.areas_set",
        entity: "user",
        entityId: workerId,
        metadata: { areaIds: wanted },
      });
      return wanted;
    },

    async areasForTask(session, taskId) {
      requireAdmin(session);
      await assertTaskInOrg(session, taskId);
      return membership.getAreaIdsForTask(taskId);
    },

    async areasForWorker(session, workerId) {
      requireAdmin(session);
      await assertWorkerInOrg(session, workerId);
      return membership.getAreaIdsForUser(workerId);
    },

    async availability(session) {
      requireAdmin(session);
      const [taskAreasList, userAreasList] = await Promise.all([
        membership.listTaskAreasByOrg(session.orgId),
        membership.listUserAreasByOrg(session.orgId),
      ]);
      return { taskAreas: taskAreasList, userAreas: userAreasList };
    },
  };
}
