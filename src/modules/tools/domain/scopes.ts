import type { ScopeCheck } from "./types";

// Normaliza: trim, remove vazios, deduplica e ordena (determinístico).
export function normalizeScopes(scopes: string[]): string[] {
  return Array.from(new Set(scopes.map((s) => s.trim()).filter(Boolean))).sort();
}

// Scopes pedidos que NÃO estão declarados na Tool.
export function missingScopes(available: string[], requested: string[]): string[] {
  const set = new Set(available);
  return normalizeScopes(requested).filter((s) => !set.has(s));
}

export function isSubset(requested: string[], available: string[]): boolean {
  return missingScopes(available, requested).length === 0;
}

// Verificação estruturada: "só scopes declarados podem ser exigidos/concedidos".
export function checkScopes(available: string[], requested: string[]): ScopeCheck {
  const missing = missingScopes(available, requested);
  return missing.length ? { ok: false, missing } : { ok: true };
}
