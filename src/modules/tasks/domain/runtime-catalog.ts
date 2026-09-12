import type { RuntimeDescriptor } from "./runtimes";
import type { RuntimeCatalogEntry } from "../service/ports";

/**
 * Domínio do catálogo de runtimes (v52) — puro e testável.
 *
 *   · isValidRuntimeKey — key namespaced em minúsculas (ex.: "custom.resumo").
 *   · mergeRuntimeCatalog — funde os built-in (RUNTIMES, sempre presentes) com
 *     os generated do catálogo, sem duplicar por key. Built-in primeiro, na sua
 *     ordem canónica; depois os generated. Robusto mesmo se o catálogo vier
 *     vazio (ex.: seed em falta).
 */

export type RuntimeCatalogItem = RuntimeCatalogEntry; // { key, label, taskType, kind }

// key: segmentos [a-z0-9] separados por '.' ou '-' (namespacing tipo "custom.resumo").
const RUNTIME_KEY_RE = /^[a-z0-9]+([.-][a-z0-9]+)*$/;

export function isValidRuntimeKey(key: string): boolean {
  return key.length >= 3 && key.length <= 60 && RUNTIME_KEY_RE.test(key);
}

export function mergeRuntimeCatalog(
  builtins: readonly RuntimeDescriptor[],
  catalog: readonly RuntimeCatalogItem[],
): RuntimeCatalogItem[] {
  const builtinKeys = new Set(builtins.map((b) => b.key));

  // Índice por key: começa nos built-in (garante os 4 mesmo sem catálogo).
  const byKey = new Map<string, RuntimeCatalogItem>();
  for (const b of builtins) {
    byKey.set(b.key, { key: b.key, label: b.label, taskType: b.taskType, kind: "builtin" });
  }

  // Catálogo: para built-in pode refinar o label (mantém kind='builtin');
  // os que não são built-in são os generated, acrescentados no fim.
  const generated: RuntimeCatalogItem[] = [];
  for (const c of catalog) {
    if (builtinKeys.has(c.key)) {
      byKey.set(c.key, { ...c, kind: "builtin" });
    } else {
      generated.push({ ...c, kind: "generic" });
    }
  }

  const builtinItems = builtins.map((b) => byKey.get(b.key)!);
  return [...builtinItems, ...generated];
}
