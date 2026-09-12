/**
 * Compõe o predicado `isKnownRuntime` (RuntimeRegistry) a partir de DUAS fontes:
 *
 *   1. built-in — chaves com handler CONSTRUÍDO em código (RUNTIME_KEYS de
 *      domain/runtimes.ts). São a fonte-de-verdade dos 4 de fábrica e valem
 *      SEMPRE, mesmo antes de a migração 0009 correr (sem janela de quebra).
 *   2. catálogo (BD) — runtimes `generated` criados na app; crescem em runtime.
 *
 * `isKnownRuntime(key)` = built-in? OU está no catálogo? Curto-circuita nos
 * built-in (nem toca a BD para os 4 casos quentes). Usado pelos DOIS composition
 * roots; testável com um catálogo fake.
 */

import type { RuntimeCatalog, RuntimeRegistry } from "./ports";

export function createRuntimeRegistry(
  builtinKeys: readonly string[],
  catalog: RuntimeCatalog,
): RuntimeRegistry {
  const builtin = new Set(builtinKeys);
  return async (runtime: string): Promise<boolean> => {
    if (builtin.has(runtime)) return true; // built-in: sempre conhecido, sem BD
    return catalog.has(runtime); // generated: existe no catálogo?
  };
}
