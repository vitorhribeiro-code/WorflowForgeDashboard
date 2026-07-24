// ÚNICO ficheiro do módulo com SQL/Drizzle. O resto usa a interface.
import { and, desc, eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { monthlyArchives, users } from "@/db/schema";
import type { MonthlyArchive } from "../domain/archive";
import type { ArchiveManifest } from "../domain/manifest";
import type { ArchiveStatus } from "../domain/status";

export interface ArchiveListFilter {
  workerId?: string;
  period?: string;
}

export interface ArchiveRepository {
  findById(id: string): Promise<MonthlyArchive | null>;
  findByWorkerPeriod(workerId: string, period: string): Promise<MonthlyArchive | null>;
  /** Idempotente: cria (worker, period) ou devolve o existente (unique index). */
  ensure(workerId: string, period: string): Promise<MonthlyArchive>;
  updateStatus(id: string, status: ArchiveStatus): Promise<MonthlyArchive>;
  finish(
    id: string,
    data: { status: ArchiveStatus; archiveFolderRef: string; manifest: ArchiveManifest },
  ): Promise<MonthlyArchive>;
  listByWorker(workerId: string, period?: string): Promise<MonthlyArchive[]>;
  listByOrg(orgId: string, filter?: ArchiveListFilter): Promise<MonthlyArchive[]>;
}

type Row = typeof monthlyArchives.$inferSelect;

function toDomain(r: Row): MonthlyArchive {
  return {
    id: r.id,
    workerId: r.workerId,
    period: r.period,
    status: r.status as ArchiveStatus,
    archiveFolderRef: r.archiveFolderRef,
    manifest: (r.manifest as ArchiveManifest | null) ?? null,
    createdAt: r.createdAt,
  };
}

export function createArchiveRepository(db: PgDatabase<any, any, any>): ArchiveRepository {
  return {
    async findById(id) {
      const [row] = await db
        .select()
        .from(monthlyArchives)
        .where(eq(monthlyArchives.id, id))
        .limit(1);
      return row ? toDomain(row) : null;
    },

    async findByWorkerPeriod(workerId, period) {
      const [row] = await db
        .select()
        .from(monthlyArchives)
        .where(and(eq(monthlyArchives.workerId, workerId), eq(monthlyArchives.period, period)))
        .limit(1);
      return row ? toDomain(row) : null;
    },

    async ensure(workerId, period) {
      // onConflictDoNothing garante idempotência sob concorrência (unique worker+period).
      const [inserted] = await db
        .insert(monthlyArchives)
        .values({ workerId, period })
        .onConflictDoNothing()
        .returning();
      if (inserted) return toDomain(inserted);
      const existing = await this.findByWorkerPeriod(workerId, period);
      if (!existing) throw new Error("ensure(): linha não encontrada após conflito");
      return existing;
    },

    async updateStatus(id, status) {
      const [row] = await db
        .update(monthlyArchives)
        .set({ status })
        .where(eq(monthlyArchives.id, id))
        .returning();
      return toDomain(row!);
    },

    async finish(id, data) {
      const [row] = await db
        .update(monthlyArchives)
        .set({
          status: data.status,
          archiveFolderRef: data.archiveFolderRef,
          manifest: data.manifest as unknown as Record<string, unknown> | null,
        })
        .where(eq(monthlyArchives.id, id))
        .returning();
      return toDomain(row!);
    },

    async listByWorker(workerId, period) {
      const where = period
        ? and(eq(monthlyArchives.workerId, workerId), eq(monthlyArchives.period, period))
        : eq(monthlyArchives.workerId, workerId);
      const rows = await db
        .select()
        .from(monthlyArchives)
        .where(where)
        .orderBy(desc(monthlyArchives.period));
      return rows.map(toDomain);
    },

    async listByOrg(orgId, filter) {
      const conds = [eq(users.organizationId, orgId)];
      if (filter?.workerId) conds.push(eq(monthlyArchives.workerId, filter.workerId));
      if (filter?.period) conds.push(eq(monthlyArchives.period, filter.period));
      const rows = await db
        .select({ a: monthlyArchives })
        .from(monthlyArchives)
        .innerJoin(users, eq(monthlyArchives.workerId, users.id))
        .where(and(...conds))
        .orderBy(desc(monthlyArchives.period));
      return rows.map((r) => toDomain(r.a));
    },
  };
}
