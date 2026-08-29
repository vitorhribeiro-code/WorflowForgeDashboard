// Atribuição ao nível da área (Slice 3a.2 — Modelo P). A fonte de verdade que
// os runs consomem continua a ser task_assignments (por-trabalhador); isto grava
// a INTENÇÃO na area_assignments e ESPALHA-a aos trabalhadores da área. O botão
// «Atualizar» (reconcile) re-espalha as tarefas-ON atuais e limpa as órfãs por
// disponibilidade. Só super_admin.
import { DomainError } from "@/lib/errors";
import type { AuditPort } from "@/lib/audit";
import type { SessionContext } from "@/lib/session";
import { requireAdmin } from "./guards";
import type { AreaLookupPort, TaskOrgLookupPort } from "./area-membership.service";
import type { AreaAssignmentRepository } from "../data/area-assignment.repository";

// --- Portas estreitas (implementadas nos roots por delegação ao M5) ----------

// O que o fan-out precisa de LER/APAGAR nas atribuições por-trabalhador.
export interface AssignmentQueryPort {
  findByTaskWorker(taskId: string, workerId: string): Promise<{ id: string; enabled: boolean } | null>;
  listByWorker(workerId: string): Promise<{ id: string; taskId: string; enabled: boolean }[]>;
  remove(id: string): Promise<boolean>;
}

// Operações do M5 que LANÇAM como as reais (o serviço apanha os códigos).
export interface AssignmentOpsPort {
  create(session: SessionContext, input: { taskId: string; workerId: string }): Promise<{ id: string }>;
  enable(session: SessionContext, id: string): Promise<void>;
  disable(session: SessionContext, id: string): Promise<void>;
}

// Leituras de pertença que o fan-out/reconcile precisa (subset do repo 3a.1).
export interface MembershipReadPort {
  getAreaIdsForUser(userId: string): Promise<string[]>;
  getAreaIdsForTask(taskId: string): Promise<string[]>;
  listUserIdsByArea(areaId: string): Promise<string[]>;
  listTaskIdsByArea(areaId: string): Promise<string[]>;
}

export interface AreaAssignmentDeps {
  areaRepo: AreaAssignmentRepository;
  membership: MembershipReadPort;
  ops: AssignmentOpsPort;
  query: AssignmentQueryPort;
  areas: AreaLookupPort;
  tasks: TaskOrgLookupPort;
  audit: AuditPort;
  now: () => Date;
}

export type FanOutSummary = {
  areaId: string;
  taskId: string;
  enabled: boolean;
  workers: number;
  applied: number; // ativadas (ON) ou desativadas (OFF)
  pending: number; // criadas mas sem prontidão (faltam conexões)
  failed: number; // ex.: config obrigatória em falta
};

export type ReconcileSummary = {
  areaId?: string;
  workers: number;
  created: number;
  enabled: number;
  pending: number;
  removed: number; // órfãs por disponibilidade
  failed: number;
};

export interface AreaAssignmentService {
  setAreaAssignment(
    session: SessionContext,
    areaId: string,
    taskId: string,
    enabled: boolean,
  ): Promise<FanOutSummary>;
  removeAreaAssignment(session: SessionContext, areaId: string, taskId: string): Promise<FanOutSummary>;
  reconcileArea(session: SessionContext, areaId: string): Promise<ReconcileSummary>;
  // Leitura para o Mapa de áreas: a intenção (area,task,enabled) de toda a org.
  listAssignments(
    session: SessionContext,
  ): Promise<Array<{ areaId: string; taskId: string; enabled: boolean }>>;
}

function isCode(e: unknown, code: string): boolean {
  return e instanceof DomainError && e.code === code;
}

export function createAreaAssignmentService(deps: AreaAssignmentDeps): AreaAssignmentService {
  const { areaRepo, membership, ops, query, areas, tasks, audit, now } = deps;

  async function assertAreaInOrg(session: SessionContext, areaId: string): Promise<void> {
    const ids = new Set(await areas.listIds(session.orgId));
    if (!ids.has(areaId)) {
      throw new DomainError("AREA_NOT_FOUND", "Área inexistente ou de outra org", 404);
    }
  }
  async function assertTaskInOrg(session: SessionContext, taskId: string): Promise<void> {
    if ((await tasks.getOrg(taskId)) !== session.orgId) {
      throw new DomainError("TASK_NOT_FOUND", "Tarefa inexistente ou de outra org", 404);
    }
  }

  // Garante a atribuição (task,worker) ATIVA. Cria se falta; ativa se pronta;
  // se não estiver pronta, fica criada+desativada (pending). Devolve o desfecho.
  async function ensureEnabled(
    session: SessionContext,
    taskId: string,
    workerId: string,
  ): Promise<{ created: boolean; state: "enabled" | "pending" | "failed" }> {
    let id: string | null = null;
    let created = false;
    const existing = await query.findByTaskWorker(taskId, workerId);
    if (existing) {
      id = existing.id;
      if (existing.enabled) return { created: false, state: "enabled" };
    } else {
      try {
        id = (await ops.create(session, { taskId, workerId })).id;
        created = true;
      } catch (e) {
        if (isCode(e, "ASSIGNMENT_EXISTS")) {
          id = (await query.findByTaskWorker(taskId, workerId))?.id ?? null;
        } else {
          return { created: false, state: "failed" }; // ex.: CONFIG_INVALID
        }
      }
    }
    if (!id) return { created, state: "failed" };
    try {
      await ops.enable(session, id);
      return { created, state: "enabled" };
    } catch (e) {
      if (isCode(e, "ASSIGNMENT_NOT_READY")) return { created, state: "pending" };
      return { created, state: "failed" };
    }
  }

  // Desativa a atribuição (task,worker) se existir — mantém a linha (o cartão
  // fica visível ao trabalhador, pausado). Nunca apaga.
  async function ensureDisabled(
    session: SessionContext,
    taskId: string,
    workerId: string,
  ): Promise<boolean> {
    const existing = await query.findByTaskWorker(taskId, workerId);
    if (!existing) return false;
    if (existing.enabled) await ops.disable(session, existing.id);
    return true;
  }

  // Re-sincroniza UM trabalhador: espalha as tarefas-ON das suas áreas e
  // remove as órfãs (tarefas que já não lhe estão disponíveis por área nenhuma).
  async function reconcileWorker(
    session: SessionContext,
    workerId: string,
  ): Promise<{ created: number; enabled: number; pending: number; removed: number; failed: number }> {
    const workerAreas = await membership.getAreaIdsForUser(workerId);

    const available = new Set<string>();
    const intendedOn = new Set<string>();
    for (const areaId of workerAreas) {
      for (const t of await membership.listTaskIdsByArea(areaId)) available.add(t);
      for (const t of await areaRepo.listEnabledTaskIds(areaId)) intendedOn.add(t);
    }

    const existing = await query.listByWorker(workerId);
    const byTask = new Map(existing.map((a) => [a.taskId, a]));

    let created = 0,
      enabled = 0,
      pending = 0,
      removed = 0,
      failed = 0;

    for (const taskId of intendedOn) {
      const ex = byTask.get(taskId);
      if (ex && ex.enabled) continue; // já ativa
      const r = await ensureEnabled(session, taskId, workerId);
      if (r.created) created++;
      if (r.state === "enabled") enabled++;
      else if (r.state === "pending") pending++;
      else failed++;
    }

    // Órfãs por disponibilidade: atribuições cuja tarefa já não lhe está
    // disponível por área nenhuma → apaga (inclui diretas que ficaram órfãs).
    for (const a of existing) {
      if (!available.has(a.taskId)) {
        if (await query.remove(a.id)) {
          removed++;
          await audit.record({
            actorId: session.userId,
            action: "assignment.removed",
            entity: "task_assignment",
            entityId: a.id,
            metadata: { reason: "orphan_area", workerId, taskId: a.taskId },
          });
        }
      }
    }

    return { created, enabled, pending, removed, failed };
  }

  return {
    async setAreaAssignment(session, areaId, taskId, enabled) {
      requireAdmin(session);
      await assertAreaInOrg(session, areaId);
      await assertTaskInOrg(session, taskId);
      // A tarefa tem de estar DISPONÍVEL na área (task_areas) para ser atribuída.
      const taskAreaIds = await membership.getAreaIdsForTask(taskId);
      if (!taskAreaIds.includes(areaId)) {
        throw new DomainError("TASK_NOT_IN_AREA", "Tarefa não está disponível nesta área", 422);
      }

      await areaRepo.upsert(areaId, taskId, {
        enabled,
        enabledBy: enabled ? session.userId : null,
        enabledAt: enabled ? now() : null,
      });
      await audit.record({
        actorId: session.userId,
        action: enabled ? "area_assignment.enabled" : "area_assignment.disabled",
        entity: "area_assignment",
        entityId: null,
        metadata: { areaId, taskId },
      });

      const workers = await membership.listUserIdsByArea(areaId);
      let applied = 0,
        pending = 0,
        failed = 0;
      for (const w of workers) {
        if (enabled) {
          const r = await ensureEnabled(session, taskId, w);
          if (r.state === "enabled") applied++;
          else if (r.state === "pending") pending++;
          else failed++;
        } else {
          await ensureDisabled(session, taskId, w);
          applied++;
        }
      }
      return { areaId, taskId, enabled, workers: workers.length, applied, pending, failed };
    },

    async removeAreaAssignment(session, areaId, taskId) {
      requireAdmin(session);
      await assertAreaInOrg(session, areaId);
      await assertTaskInOrg(session, taskId);

      await areaRepo.remove(areaId, taskId); // apaga a INTENÇÃO da área
      const workers = await membership.listUserIdsByArea(areaId);
      let applied = 0;
      for (const w of workers) {
        // Default combinado: «Remover» na área DESATIVA (mantém as linhas dos
        // trabalhadores); o apagar real fica para as órfãs e o «Remover» por-célula.
        await ensureDisabled(session, taskId, w);
        applied++;
      }
      await audit.record({
        actorId: session.userId,
        action: "area_assignment.removed",
        entity: "area_assignment",
        entityId: null,
        metadata: { areaId, taskId },
      });
      return { areaId, taskId, enabled: false, workers: workers.length, applied, pending: 0, failed: 0 };
    },

    async reconcileArea(session, areaId) {
      requireAdmin(session);
      await assertAreaInOrg(session, areaId);
      const workers = await membership.listUserIdsByArea(areaId);
      const total: ReconcileSummary = {
        areaId,
        workers: workers.length,
        created: 0,
        enabled: 0,
        pending: 0,
        removed: 0,
        failed: 0,
      };
      for (const w of workers) {
        const r = await reconcileWorker(session, w);
        total.created += r.created;
        total.enabled += r.enabled;
        total.pending += r.pending;
        total.removed += r.removed;
        total.failed += r.failed;
      }
      await audit.record({
        actorId: session.userId,
        action: "area.reconciled",
        entity: "functional_area",
        entityId: areaId,
        metadata: {
          workers: total.workers,
          created: total.created,
          enabled: total.enabled,
          pending: total.pending,
          removed: total.removed,
          failed: total.failed,
        },
      });
      return total;
    },

    async listAssignments(session) {
      requireAdmin(session);
      const areaIds = await areas.listIds(session.orgId);
      const out: Array<{ areaId: string; taskId: string; enabled: boolean }> = [];
      for (const areaId of areaIds) {
        const rows = await areaRepo.listByArea(areaId);
        for (const r of rows) out.push({ areaId, taskId: r.taskId, enabled: r.enabled });
      }
      return out;
    },
  };
}
