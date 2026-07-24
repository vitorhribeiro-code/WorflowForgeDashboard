import type { AuditEvent, AuditPort } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import type { SessionContext } from "@/lib/session";
import {
  applyOverrides,
  completenessOf,
  type CandidateOverrides,
} from "../domain/candidate";
import { parseMapping } from "../domain/parse";
import type { MappingDocument, TaskCandidate } from "../domain/types";
import { requireAdmin } from "./guards";
import type { TaskAuthoringPort, ToolResolverPort } from "./ports";

export type MappingServiceDeps = {
  authoring: TaskAuthoringPort; // M4
  tools: ToolResolverPort; // M3
  audit: AuditPort;
};

export type MappingService = ReturnType<typeof createMappingService>;

async function safeAudit(audit: AuditPort, ev: AuditEvent): Promise<void> {
  try {
    await audit.record(ev);
  } catch (err) {
    console.error("[audit] falha ao registar", ev.action, err);
  }
}

export function createMappingService({ authoring, tools, audit }: MappingServiceDeps) {
  return {
    // Importar mapeamento: valida a FORMA e devolve rascunhos (nada é persistido).
    parse(session: SessionContext, doc: MappingDocument) {
      requireAdmin(session);
      const { candidates, warnings } = parseMapping(doc);
      return {
        candidates: candidates.map((c) => ({ ...c, completeness: completenessOf(c) })),
        warnings,
      };
    },

    // Converter candidato em Task (admin). Herda o contexto e segue as regras do M4.
    async convert(
      session: SessionContext,
      input: { candidate: TaskCandidate; overrides?: CandidateOverrides },
    ): Promise<{ id: string }> {
      requireAdmin(session);
      const c = applyOverrides(input.candidate, input.overrides);

      const completeness = completenessOf(c);
      if (!completeness.convertible) {
        throw new DomainError("INSUFFICIENT_DATA", "Dados insuficientes para converter", 422, {
          missing: completeness.missing,
        });
      }

      // Resolve as Tools do candidato (keys → ids). Falta uma? A Tool tem de ser
      // registada no catálogo (M3) antes de converter.
      const items: Array<{ toolId: string; scopes: string[] }> = [];
      const missingTools: string[] = [];
      for (const rt of c.requiredTools) {
        const toolId = await tools.resolveKey(rt.toolKey);
        if (!toolId) missingTools.push(rt.toolKey);
        else items.push({ toolId, scopes: rt.scopes });
      }
      if (missingTools.length > 0) {
        throw new DomainError("TOOL_NOT_FOUND", "Ferramentas por registar no catálogo", 422, {
          missingTools,
        });
      }

      // Delegar no M4 (que valida config_schema, runtime e scopes ⊆ Tool).
      const task = await authoring.create(session, {
        name: c.name,
        description: c.description,
        type: c.type,
        runtime: c.runtime as string,
        configSchema: c.configSchema,
        areaId: c.areaId,
      });
      if (items.length > 0) {
        await authoring.setRequiredTools(session, task.id, items);
      }

      await safeAudit(audit, {
        actorId: session.userId,
        action: "task.created_from_mapping",
        entity: "task",
        entityId: task.id,
        metadata: { sourceRef: c.sourceRef },
      });
      return task;
    },
  };
}
