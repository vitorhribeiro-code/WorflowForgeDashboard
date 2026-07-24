// -------------------------------------------------------------------------- //
//  Tipos puros do M3 (catálogo de Tools). Tool é GLOBAL (sem org_id): registo  //
//  partilhado de plataforma (handoff §8 / spec §8, questão em aberto).         //
// -------------------------------------------------------------------------- //

// Espelha o enum `tool_auth_type` do schema (fonte de verdade).
export type ToolAuthType = "oauth" | "api_key" | "none";

export const TOOL_AUTH_TYPES: readonly ToolAuthType[] = [
  "oauth",
  "api_key",
  "none",
] as const;

export type Tool = {
  id: string;
  key: string; // "google", "dropbox", ... (único, imutável)
  name: string;
  authType: ToolAuthType;
  availableScopes: string[];
  createdAt: Date;
};

export type NewTool = {
  key: string;
  name: string;
  authType: ToolAuthType;
  availableScopes: string[];
};

// key e authType são imutáveis após criação (mudá-los invalidaria conexões).
export type ToolPatch = {
  name?: string;
  availableScopes?: string[];
};

// Resultado da verificação de scopes (usado por M4/M6 via port).
export type ScopeCheck = { ok: true } | { ok: false; missing: string[] };
