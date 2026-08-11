/**
 * Camada de acesso a dados do módulo de Conexões.
 *
 * A service depende da INTERFACE (ConnectionsRepository), não do Drizzle.
 * Isto mantém a lógica de negócio sem IO e permite fakes nos testes.
 * A implementação Drizzle é a única coisa que "sabe" de SQL/tabelas.
 */

import { and, eq, inArray } from "drizzle-orm";
import type { ConnectionStatus, ToolAuthType } from "../domain/connection.types";
import { unionScopes } from "../domain/scopes";

/* -------------------------------- DTOs internos --------------------------- */

export interface ToolRow {
  id: string;
  key: string;
  name: string;
  authType: ToolAuthType;
  availableScopes: string[];
}

/** Linha crua da conexão — inclui o cifrado (só a service lhe toca). */
export interface ConnectionRow {
  id: string;
  workerId: string;
  toolId: string;
  grantedScopes: string[];
  credentialsEncrypted: string | null;
  status: ConnectionStatus;
  connectedAt: Date | null;
}

export interface RequiredToolRow {
  tool: ToolRow;
  requiredScopes: string[];
}

export interface UpsertConnectionInput {
  workerId: string;
  toolId: string;
  grantedScopes: string[];
  credentialsEncrypted: string;
  status: ConnectionStatus;
  connectedAt: Date | null;
}

/* -------------------------------- Interface ------------------------------- */

export interface ConnectionsRepository {
  getToolById(toolId: string): Promise<ToolRow | null>;
  getConnection(workerId: string, toolId: string): Promise<ConnectionRow | null>;
  /** Todas as ferramentas exigidas pelas atribuições do trabalhador (+scopes união). */
  listRequiredTools(workerId: string): Promise<RequiredToolRow[]>;
  /** Scopes exigidos (união) para um par (worker, tool). */
  requiredScopesFor(workerId: string, toolId: string): Promise<string[]>;
  upsertConnection(input: UpsertConnectionInput): Promise<ConnectionRow>;
  updateStatus(connectionId: string, status: ConnectionStatus): Promise<void>;
  /** Suspende (enabled=false) as atribuições do worker que dependem desta tool. */
  suspendAssignmentsDependingOn(workerId: string, toolId: string): Promise<number>;
  /** Valida que o trabalhador pertence à org (isolamento tenant na leitura admin). */
  workerInOrg(orgId: string, workerId: string): Promise<boolean>;
}

/* --------------------------- Implementação Drizzle ------------------------ */

// Schema canónico do projeto (integrado): worker_connections, tools, tasks,
// task_assignments, task_required_tools.
import {
  tools,
  taskAssignments,
  taskRequiredTools,
  tasks,
  users,
  workerConnections,
} from "@/db/schema";
// Tipo do cliente Drizzle (pg). Mantém genérico para não acoplar ao driver.
type Db = {
  select: (...a: any[]) => any;
  insert: (...a: any[]) => any;
  update: (...a: any[]) => any;
};

export function createDrizzleConnectionsRepository(db: any): ConnectionsRepository {
  return {
    async getToolById(toolId) {
      const [row] = await db.select().from(tools).where(eq(tools.id, toolId)).limit(1);
      if (!row) return null;
      return {
        id: row.id,
        key: row.key,
        name: row.name,
        authType: row.authType,
        availableScopes: (row.availableScopes ?? []) as string[],
      };
    },

    async getConnection(workerId, toolId) {
      const [row] = await db
        .select()
        .from(workerConnections)
        .where(
          and(
            eq(workerConnections.workerId, workerId),
            eq(workerConnections.toolId, toolId),
          ),
        )
        .limit(1);
      if (!row) return null;
      return {
        id: row.id,
        workerId: row.workerId,
        toolId: row.toolId,
        grantedScopes: (row.grantedScopes ?? []) as string[],
        credentialsEncrypted: row.credentialsEncrypted ?? null,
        status: row.status,
        connectedAt: row.connectedAt ?? null,
      };
    },

    async listRequiredTools(workerId) {
      // assignments do worker -> tasks -> required_tools (+ tool)
      const rows = await db
        .select({
          toolId: taskRequiredTools.toolId,
          scopes: taskRequiredTools.scopes,
          tool: tools,
        })
        .from(taskAssignments)
        .innerJoin(tasks, eq(tasks.id, taskAssignments.taskId))
        .innerJoin(taskRequiredTools, eq(taskRequiredTools.taskId, tasks.id))
        .innerJoin(tools, eq(tools.id, taskRequiredTools.toolId))
        .where(eq(taskAssignments.workerId, workerId));

      // Une scopes por tool (uma conexão por tool = união das tarefas).
      const byTool = new Map<string, RequiredToolRow>();
      for (const r of rows as any[]) {
        const existing = byTool.get(r.toolId);
        const scopes = (r.scopes ?? []) as string[];
        if (existing) {
          existing.requiredScopes = unionScopes(existing.requiredScopes, scopes);
        } else {
          byTool.set(r.toolId, {
            tool: {
              id: r.tool.id,
              key: r.tool.key,
              name: r.tool.name,
              authType: r.tool.authType,
              availableScopes: (r.tool.availableScopes ?? []) as string[],
            },
            requiredScopes: unionScopes(scopes),
          });
        }
      }
      return Array.from(byTool.values());
    },

    async requiredScopesFor(workerId, toolId) {
      const rows = await db
        .select({ scopes: taskRequiredTools.scopes })
        .from(taskAssignments)
        .innerJoin(tasks, eq(tasks.id, taskAssignments.taskId))
        .innerJoin(taskRequiredTools, eq(taskRequiredTools.taskId, tasks.id))
        .where(
          and(
            eq(taskAssignments.workerId, workerId),
            eq(taskRequiredTools.toolId, toolId),
          ),
        );
      return unionScopes(...(rows as any[]).map((r) => (r.scopes ?? []) as string[]));
    },

    async upsertConnection(input) {
      // Unicidade (worker, tool) garantida por índice no schema → onConflict.
      const [row] = await db
        .insert(workerConnections)
        .values({
          workerId: input.workerId,
          toolId: input.toolId,
          grantedScopes: input.grantedScopes,
          credentialsEncrypted: input.credentialsEncrypted,
          status: input.status,
          connectedAt: input.connectedAt,
        })
        .onConflictDoUpdate({
          target: [workerConnections.workerId, workerConnections.toolId],
          set: {
            grantedScopes: input.grantedScopes,
            credentialsEncrypted: input.credentialsEncrypted,
            status: input.status,
            connectedAt: input.connectedAt,
          },
        })
        .returning();
      return {
        id: row.id,
        workerId: row.workerId,
        toolId: row.toolId,
        grantedScopes: (row.grantedScopes ?? []) as string[],
        credentialsEncrypted: row.credentialsEncrypted ?? null,
        status: row.status,
        connectedAt: row.connectedAt ?? null,
      };
    },

    async updateStatus(connectionId, status) {
      await db
        .update(workerConnections)
        .set({ status })
        .where(eq(workerConnections.id, connectionId));
    },

    async suspendAssignmentsDependingOn(workerId, toolId) {
      // Ids das tasks que exigem esta tool.
      const taskIds = (
        await db
          .select({ taskId: taskRequiredTools.taskId })
          .from(taskRequiredTools)
          .where(eq(taskRequiredTools.toolId, toolId))
      ).map((r: any) => r.taskId);
      if (taskIds.length === 0) return 0;

      const res = await db
        .update(taskAssignments)
        .set({ enabled: false })
        .where(
          and(
            eq(taskAssignments.workerId, workerId),
            inArray(taskAssignments.taskId, taskIds),
          ),
        )
        .returning({ id: taskAssignments.id });
      return (res as any[]).length;
    },

    async workerInOrg(orgId, workerId) {
      const [row] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, workerId), eq(users.organizationId, orgId)))
        .limit(1);
      return !!row;
    },
  };
}
