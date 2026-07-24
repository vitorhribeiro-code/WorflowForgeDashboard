// Razões que impedem publicar uma Task. Puro e determinístico.
export type PublishBlocker =
  | "invalid_config_schema" // config_schema não compila
  | "unknown_runtime" // runtime sem handler resolúvel (M7)
  | "unresolved_required_tools"; // Tool inexistente ou scopes não declarados (M3)

export type Publishability = {
  publishable: boolean;
  blockers: PublishBlocker[];
};

export function computePublishability(input: {
  configSchemaValid: boolean;
  runtimeKnown: boolean;
  requiredToolsResolved: boolean;
}): Publishability {
  const blockers: PublishBlocker[] = [];
  if (!input.configSchemaValid) blockers.push("invalid_config_schema");
  if (!input.runtimeKnown) blockers.push("unknown_runtime");
  if (!input.requiredToolsResolved) blockers.push("unresolved_required_tools");
  return { publishable: blockers.length === 0, blockers };
}

// Scopes pedidos que não constam dos disponíveis (mesma regra do M3, local
// para não acoplar pacotes; ver nota de integração sobre partilha da lib).
export function missingScopes(available: string[], requested: string[]): string[] {
  const set = new Set(available);
  return requested.filter((s) => !set.has(s));
}
