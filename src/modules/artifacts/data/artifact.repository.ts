// ÚNICO ficheiro do módulo que conhece SQL/Drizzle. Tudo o resto usa a interface.
import { and, asc, eq, inArray, lte } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
// Ajusta o caminho ao teu repo. runArtifacts vem do schema.ts (fonte de verdade).
import { runArtifacts } from "@/db/schema";
import type { Artifact, ArtifactLocation, ArtifactTier } from "../domain/artifact";

export interface NewArtifact {
  runId: string;
  filename: string;
  mimeType: string | null;
  tier: ArtifactTier;
  location: ArtifactLocation;
  storageRef: string;
  archived: boolean;
  expiresAt: Date | null;
}

export interface ArtifactRepository {
  insert(a: NewArtifact): Promise<Artifact>;
  findById(id: string): Promise<Artifact | null>;
  listByRun(runId: string): Promise<Artifact[]>;
  /** Marca intermédios como arquivados (chamado pelo M9). Idempotente. */
  markArchived(ids: string[]): Promise<void>;
  /** Intermédios expirados E já arquivados (usa o índice tier_archived_idx). */
  listCleanable(now: Date): Promise<Artifact[]>;
  deleteByIds(ids: string[]): Promise<void>;
}

type Row = typeof runArtifacts.$inferSelect;

function toDomain(r: Row): Artifact {
  return {
    id: r.id,
    runId: r.runId,
    filename: r.filename,
    mimeType: r.mimeType,
    tier: r.tier as ArtifactTier,
    location: r.location as ArtifactLocation,
    storageRef: r.storageRef,
    archived: r.archived,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
  };
}

export function createArtifactRepository(db: PgDatabase<any, any, any>): ArtifactRepository {
  return {
    async insert(a) {
      const [row] = await db.insert(runArtifacts).values(a).returning();
      return toDomain(row!);
    },

    async findById(id) {
      const [row] = await db
        .select()
        .from(runArtifacts)
        .where(eq(runArtifacts.id, id))
        .limit(1);
      return row ? toDomain(row) : null;
    },

    async listByRun(runId) {
      const rows = await db
        .select()
        .from(runArtifacts)
        .where(eq(runArtifacts.runId, runId))
        .orderBy(asc(runArtifacts.createdAt));
      return rows.map(toDomain);
    },

    async markArchived(ids) {
      if (ids.length === 0) return;
      await db
        .update(runArtifacts)
        .set({ archived: true })
        .where(inArray(runArtifacts.id, ids));
    },

    async listCleanable(now) {
      const rows = await db
        .select()
        .from(runArtifacts)
        .where(
          and(
            eq(runArtifacts.tier, "intermediate"),
            eq(runArtifacts.archived, true),
            lte(runArtifacts.expiresAt, now),
          ),
        );
      return rows.map(toDomain);
    },

    async deleteByIds(ids) {
      if (ids.length === 0) return;
      await db.delete(runArtifacts).where(inArray(runArtifacts.id, ids));
    },
  };
}
