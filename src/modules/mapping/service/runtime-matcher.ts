/**
 * Matcher de runtimes no import (v53).
 *
 * Dado um candidato de mapeamento (nome/descrição/tipo) e o CATÁLOGO de runtimes,
 * pede ao LLM para, REUSE-FIRST, associar a um runtime existente do MESMO tipo —
 * ou propor um runtime NOVO (generated) quando nada serve. A app é que faz o
 * matching (só ela conhece o catálogo); o super-utilizador aceita/rejeita na UI.
 *
 * Capacidade: "mapping.match" (binding de IA da org). Sem binding → todas as
 * propostas saem "none" (a UI cai na escolha/criação manual). Puros testáveis:
 * buildMatchPrompt / parseMatchResponse.
 */

import { DomainError } from "@/lib/errors";
import type { SessionContext } from "@/lib/session";
import type { TaskType } from "../domain/types";
import { isValidRuntimeKey } from "@/modules/tasks/domain/runtime-catalog";
import { RUNTIME_KEYS } from "@/modules/tasks/domain/runtimes";

const MATCH_CAPABILITY = "mapping.match";
const MAX_TOKENS = 1200;

const MATCH_SYSTEM =
  "És um assistente que associa tarefas a capacidades (runtimes) existentes. " +
  "Regra principal: REUTILIZAR sempre que um runtime existente do MESMO tipo " +
  "servir a tarefa; só propor um runtime novo quando nenhum existente serve. " +
  "Respondes SÓ com JSON válido, sem texto à volta.";

export type CatalogRuntime = {
  key: string;
  label: string;
  taskType: TaskType;
  kind: "builtin" | "generic";
};

export type MatchCandidate = {
  sourceRef: string;
  name: string;
  description?: string | null;
  type: TaskType;
};

export type MatchProposal =
  | { sourceRef: string; kind: "existing"; runtimeKey: string; label: string; taskType: TaskType }
  | { sourceRef: string; kind: "new"; key: string; label: string; instruction: string; taskType: TaskType }
  | { sourceRef: string; kind: "none"; reason?: string };

export interface MatcherLlmPort {
  complete(args: { system?: string; prompt: string; maxTokens?: number }): Promise<{ text: string }>;
  provider?: string;
  model?: string;
}
export interface MatcherResolver {
  resolve(orgId: string, capability: string): Promise<MatcherLlmPort | null>;
}
export interface MatcherCatalogSource {
  list(): Promise<CatalogRuntime[]>;
}

export interface RuntimeMatcherDeps {
  resolver: MatcherResolver | null; // null (sem ENCRYPTION_KEY) → tudo "none"
  catalog: MatcherCatalogSource;
}

/* --------------------------- puros (testáveis) ---------------------------- */

export function buildMatchPrompt(candidates: MatchCandidate[], catalog: CatalogRuntime[]): string {
  const cat = catalog
    .map((r) => `- ${r.key} · ${r.taskType} · ${r.label}${r.kind === "builtin" ? " (built-in)" : ""}`)
    .join("\n");
  const cands = candidates
    .map(
      (c) =>
        `- sourceRef=${c.sourceRef} · tipo=${c.type} · ${c.name}${c.description ? ` — ${c.description}` : ""}`,
    )
    .join("\n");
  return [
    "RUNTIMES EXISTENTES (só podes reutilizar destes; respeita o tipo):",
    cat || "(nenhum)",
    "",
    "TAREFAS a associar:",
    cands,
    "",
    "Para CADA tarefa devolve um objeto num array JSON, por esta ordem, com o mesmo sourceRef:",
    '- Se um runtime existente do MESMO tipo serve: {"sourceRef":"...","existingRuntime":"<key>"}',
    '- Caso contrário: {"sourceRef":"...","newRuntime":{"key":"namespaced.emminusculas","label":"Rótulo curto","instruction":"O que este runtime deve fazer."}}',
    "Responde SÓ com o array JSON.",
  ].join("\n");
}

function stripFences(text: string): string {
  return text.replace(/```json/gi, "").replace(/```/g, "").trim();
}

type RawEntry = {
  sourceRef?: unknown;
  existingRuntime?: unknown;
  newRuntime?: { key?: unknown; label?: unknown; instruction?: unknown } | null;
};

export function parseMatchResponse(
  text: string,
  candidates: MatchCandidate[],
  catalog: CatalogRuntime[],
): MatchProposal[] {
  let arr: RawEntry[] = [];
  try {
    const parsed = JSON.parse(stripFences(text));
    if (Array.isArray(parsed)) arr = parsed as RawEntry[];
  } catch {
    arr = [];
  }
  const bySource = new Map<string, RawEntry>();
  for (const e of arr) {
    if (e && typeof e.sourceRef === "string") bySource.set(e.sourceRef, e);
  }
  const catByKey = new Map(catalog.map((r) => [r.key, r]));

  return candidates.map((c): MatchProposal => {
    const e = bySource.get(c.sourceRef);
    const none = (reason: string): MatchProposal => ({ sourceRef: c.sourceRef, kind: "none", reason });
    if (!e) return none("sem proposta");

    // Reuse-first: existingRuntime válido, do MESMO tipo.
    const existing = typeof e.existingRuntime === "string" ? e.existingRuntime.trim() : "";
    if (existing) {
      const hit = catByKey.get(existing);
      if (hit && hit.taskType === c.type) {
        return { sourceRef: c.sourceRef, kind: "existing", runtimeKey: hit.key, label: hit.label, taskType: c.type };
      }
      return none(`runtime "${existing}" não existe ou é de outro tipo`);
    }

    // Novo runtime proposto.
    const nr = e.newRuntime;
    if (nr && typeof nr === "object") {
      const key = typeof nr.key === "string" ? nr.key.trim().toLowerCase() : "";
      const label = typeof nr.label === "string" ? nr.label.trim() : "";
      const instruction = typeof nr.instruction === "string" ? nr.instruction.trim() : "";
      // Se a key já existe no catálogo, é reutilização (reuse-first), não criação.
      const existingHit = catByKey.get(key);
      if (existingHit) {
        return existingHit.taskType === c.type
          ? { sourceRef: c.sourceRef, kind: "existing", runtimeKey: existingHit.key, label: existingHit.label, taskType: c.type }
          : none(`"${key}" já existe mas é de outro tipo`);
      }
      if (isValidRuntimeKey(key) && !RUNTIME_KEYS.includes(key) && label && instruction) {
        return { sourceRef: c.sourceRef, kind: "new", key, label, instruction, taskType: c.type };
      }
      return none("proposta de runtime novo inválida");
    }
    return none("sem proposta utilizável");
  });
}

/* ------------------------------- serviço ---------------------------------- */

export type RuntimeMatcher = ReturnType<typeof createRuntimeMatcher>;

export function createRuntimeMatcher({ resolver, catalog }: RuntimeMatcherDeps) {
  return {
    async match(session: SessionContext, candidates: MatchCandidate[]): Promise<MatchProposal[]> {
      if (session.role !== "super_admin") {
        throw new DomainError("FORBIDDEN", "Requer super_admin", 403);
      }
      if (candidates.length === 0) return [];

      const cat = await catalog.list();

      let adapter: MatcherLlmPort | null = null;
      if (resolver) {
        try {
          adapter = await resolver.resolve(session.orgId, MATCH_CAPABILITY);
        } catch {
          adapter = null;
        }
      }
      if (!adapter) {
        const reason = resolver ? "sem modelo ligado a mapping.match" : "IA não configurada";
        return candidates.map((c) => ({ sourceRef: c.sourceRef, kind: "none", reason }));
      }

      let text = "";
      try {
        const out = await adapter.complete({
          system: MATCH_SYSTEM,
          prompt: buildMatchPrompt(candidates, cat),
          maxTokens: MAX_TOKENS,
        });
        text = out.text;
      } catch (err) {
        console.error("[mapping.match] falha do modelo:", err);
        return candidates.map((c) => ({ sourceRef: c.sourceRef, kind: "none", reason: "falha do modelo" }));
      }
      return parseMatchResponse(text, candidates, cat);
    },
  };
}
