// -------------------------------------------------------------------------- //
//  Tipos puros do M4 (catálogo de Tasks). Sem IO.                             //
// -------------------------------------------------------------------------- //

// Espelha o enum `task_type` do schema (fonte de verdade).
//  automation: corre sozinha (fila + schedule)
//  assistant:  o trabalhador aciona (stream interativo, sem schedule)
export type TaskType = "automation" | "assistant";

export const TASK_TYPES: readonly TaskType[] = ["automation", "assistant"] as const;

export type JsonSchema = Record<string, unknown>;

export type Task = {
  id: string;
  organizationId: string;
  areaId: string | null;
  name: string;
  description: string | null;
  type: TaskType;
  runtime: string; // identificador do handler (resolúvel no M7)
  configSchema: JsonSchema | null;
  createdAt: Date;
};

export type NewTask = {
  organizationId: string;
  areaId?: string | null;
  name: string;
  description?: string | null;
  type: TaskType;
  runtime: string;
  configSchema?: JsonSchema | null;
};

// type e organizationId imutáveis após criação (mudam a semântica de execução).
export type TaskPatch = {
  name?: string;
  description?: string | null;
  areaId?: string | null;
  runtime?: string;
  configSchema?: JsonSchema | null;
};

// Ferramenta exigida por uma Task + scopes mínimos (⊆ scopes da Tool — M3).
export type RequiredTool = {
  toolId: string;
  scopes: string[];
};
