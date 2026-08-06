/* -------------------------------------------------------------------------- */
/*  Registo de IA (§5.2 fase 1b) — tipos de domínio                            */
/*                                                                             */
/*  Regra transversal: a chave de API é WRITE-ONLY. Nenhuma view exposta ao    */
/*  exterior devolve a chave nem o blob cifrado — os providers reportam só um   */
/*  booleano `hasKey`. A decifra vive no resolver da Fase 2, nunca aqui.        */
/* -------------------------------------------------------------------------- */

// Provider de IA por (org, provider). A chave nunca sai da service.
export type AiProviderView = {
  id: string;
  provider: string; // "claude", "mistral", ...
  defaultModel: string | null;
  enabled: boolean;
  // Write-only: true se há uma chave cifrada guardada; a chave em si nunca é devolvida.
  hasKey: boolean;
  createdAt: Date;
};

// Binding capability -> provider/model, um por (org, capability).
export type AiBindingView = {
  id: string;
  capability: string; // "email.summary", "assistant.generic", "ocr", ...
  provider: string;
  model: string | null;
  createdAt: Date;
};

// Sugestões para os dropdowns da consola (texto livre no modelo de dados, como
// tools.key — extensível sem migração; a lista é só uma conveniência de UI).
export const KNOWN_PROVIDERS = ["claude", "mistral"] as const;
export const KNOWN_CAPABILITIES = [
  "email.summary",
  "assistant.generic",
  "assistant.writing",
  "ocr",
] as const;
