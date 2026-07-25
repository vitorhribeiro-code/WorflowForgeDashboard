/**
 * Lógica pura de scopes OAuth (sem IO). RECONSTRUÍDA a partir do uso no service
 * e no repositório. Determinística: normaliza sempre (dedup + ordena) para que
 * comparações e outputs sejam estáveis e testáveis.
 */

/** Remove vazios e duplicados e ordena — forma canónica de uma lista de scopes. */
export function normalizeScopes(scopes: readonly string[]): string[] {
  return Array.from(new Set(scopes.filter((s) => s.length > 0))).sort();
}

/**
 * União de vários conjuntos de scopes, já normalizada.
 * "Uma conexão por tool = união dos scopes de todas as tarefas do worker."
 */
export function unionScopes(...groups: ReadonlyArray<readonly string[]>): string[] {
  return normalizeScopes(groups.flat());
}

/** `sub ⊆ sup`? Usado para validar required ⊆ availableScopes da Tool. */
export function isSubset(sub: readonly string[], sup: readonly string[]): boolean {
  const set = new Set(sup);
  return sub.every((s) => set.has(s));
}

/** Scopes exigidos que ainda não foram concedidos (normalizado). */
export function missingScopes(
  required: readonly string[],
  granted: readonly string[],
): string[] {
  const has = new Set(granted);
  return normalizeScopes(required).filter((s) => !has.has(s));
}
