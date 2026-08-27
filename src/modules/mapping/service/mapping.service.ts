import type { AuditEvent, AuditPort } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import type { SessionContext } from "@/lib/session";
import {
  applyOverrides,
  completenessOf,
  type CandidateOverrides,
} from "../domain/candidate";
import { classifyCollisions, type CollisionMatch } from "../domain/collision";
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
    //
    // Slice 2 (dedup): antes de criar, procura Tasks do MESMO runtime na org. Se
    // houver, NÃO cria — devolve `needs_decision` com os matches (nome igual =
    // provável, nome diferente = possível) para o admin confirmar. A decisão volta
    // no `decision`: `create` (criar mesmo assim) ou `reuse` (apontar à existente).
    async convert(
      session: SessionContext,
      input: {
        candidate: TaskCandidate;
        overrides?: CandidateOverrides;
        decision?: ConvertDecision;
      },
    ): Promise<ConvertOutcome> {
      requireAdmin(session);
      const c = applyOverrides(input.candidate, input.overrides);

      const completeness = completenessOf(c);
      if (!completeness.convertible) {
        throw new DomainError("INSUFFICIENT_DATA", "Dados insuficientes para converter", 422, {
          missing: completeness.missing,
        });
      }
      const runtime = c.runtime as string;
      const decision = input.decision;

      // Reutilizar uma existente: valida que pertence à org e ao MESMO runtime
      // (o taskId veio dos matches que nós próprios devolvemos). Não cria nada.
      if (decision?.kind === "reuse") {
        const existing = await authoring.findByRuntime(session, runtime);
        if (!existing.some((e) => e.id === decision.taskId)) {
          throw new DomainError(
            "REUSE_TARGET_NOT_FOUND",
            "A Task a reutilizar não existe ou não corresponde ao runtime",
            422,
            { taskId: decision.taskId, runtime },
          );
        }
        await safeAudit(audit, {
          actorId: session.userId,
          action: "task.reused_from_mapping",
          entity: "task",
          entityId: decision.taskId,
          metadata: { sourceRef: c.sourceRef },
        });
        return { status: "reused", id: decision.taskId };
      }

      // Deteção de colisão. Só se pergunta ao admin quando NÃO forçou `create`.
      if (decision?.kind !== "create") {
        const existing = await authoring.findByRuntime(session, runtime);
        if (existing.length > 0) {
          return { status: "needs_decision", existing: classifyCollisions(c.name, existing) };
        }
      }

      // Sem colisão (ou o admin escolheu criar mesmo assim): resolve Tools e cria.
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
        runtime,
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
        metadata: { sourceRef: c.sourceRef, forced: decision?.kind === "create" },
      });
      return { status: "created", id: task.id };
    },
  };
}

// Decisão do admin perante uma colisão (vem da UI/rota).
export type ConvertDecision =
  | { kind: "create" } // criar mesmo assim, ignorando os matches
  | { kind: "reuse"; taskId: string }; // apontar a uma Task existente

// Desfecho da conversão. `needs_decision` NÃO persiste nada — espera o admin.
export type ConvertOutcome =
  | { status: "created"; id: string }
  | { status: "reused"; id: string }
  | { status: "needs_decision"; existing: CollisionMatch[] };
