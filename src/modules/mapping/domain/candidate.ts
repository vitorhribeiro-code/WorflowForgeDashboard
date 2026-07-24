import type { CandidateCompleteness, TaskCandidate, TaskType } from "./types";

export type CandidateOverrides = {
  type?: TaskType;
  runtime?: string;
  areaId?: string | null;
  configSchema?: Record<string, unknown> | null;
};

// Aplica as escolhas do admin sobre o rascunho (não muta o original).
export function applyOverrides(
  candidate: TaskCandidate,
  overrides: CandidateOverrides = {},
): TaskCandidate & { areaId: string | null } {
  return {
    ...candidate,
    type: overrides.type ?? candidate.type,
    runtime: overrides.runtime?.trim() ?? candidate.runtime,
    configSchema:
      overrides.configSchema !== undefined ? overrides.configSchema : candidate.configSchema,
    areaId: overrides.areaId ?? null,
  };
}

// Um candidato é convertível quando tem o mínimo para virar Task (M4 valida o resto).
export function completenessOf(candidate: TaskCandidate): CandidateCompleteness {
  const missing: string[] = [];
  if (!candidate.name) missing.push("name");
  if (!candidate.runtime) missing.push("runtime");
  return { convertible: missing.length === 0, missing };
}
