import type { AuditEvent, AuditPort } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import type { SessionContext } from "@/lib/session";
import { requireAdmin } from "@/modules/org/service/guards";
import {
  styleByteLength,
  validateStyleUpload,
  type WritingStyleView,
} from "../domain/writing-style";
import type { WritingStyleRepository, WritingStyleRow } from "../data/writing-style.repository";

export type WritingStyleServiceDeps = { repo: WritingStyleRepository; audit: AuditPort };

async function safeAudit(audit: AuditPort, ev: AuditEvent): Promise<void> {
  try {
    await audit.record(ev);
  } catch (err) {
    console.error("[audit] falha ao registar", ev.action, err);
  }
}

function toView(row: WritingStyleRow): WritingStyleView {
  return {
    workerId: row.workerId,
    sourceFilename: row.sourceFilename,
    bytes: styleByteLength(row.contentMd),
    updatedAt: row.updatedAt.toISOString(),
    contentMd: row.contentMd,
  };
}

export interface WritingStyleService {
  // Ações do super-utilizador sobre um trabalhador da SUA org (não self-service).
  get(session: SessionContext, workerId: string): Promise<WritingStyleView | null>;
  upload(
    session: SessionContext,
    workerId: string,
    input: { filename: string; contentMd: string },
  ): Promise<WritingStyleView>;
}

export function createWritingStyleService(deps: WritingStyleServiceDeps): WritingStyleService {
  const { repo, audit } = deps;

  async function assertTargetWorker(session: SessionContext, workerId: string): Promise<void> {
    requireAdmin(session);
    const ok = await repo.workerInOrg(session.orgId, workerId);
    if (!ok) {
      throw new DomainError("NOT_FOUND", "Trabalhador não encontrado", 404);
    }
  }

  return {
    async get(session, workerId) {
      await assertTargetWorker(session, workerId);
      const row = await repo.getByWorker(workerId);
      return row ? toView(row) : null;
    },

    async upload(session, workerId, { filename, contentMd }) {
      await assertTargetWorker(session, workerId);
      const problem = validateStyleUpload(filename, contentMd);
      if (problem) {
        throw new DomainError("BAD_INPUT", problem, 400);
      }
      const row = await repo.upsert({
        workerId,
        contentMd,
        sourceFilename: filename,
        updatedBy: session.userId,
      });
      await safeAudit(audit, {
        actorId: session.userId,
        action: "writing_style.updated",
        entity: "user",
        entityId: workerId,
        metadata: { sourceFilename: filename, bytes: styleByteLength(contentMd) },
      });
      return toView(row);
    },
  };
}
