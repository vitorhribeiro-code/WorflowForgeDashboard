import type { JsonSchema, TaskType } from "../domain/types";

/* --- Consumidos (injetados no container) ---------------------------------- */

// Catálogo de Tools (M3). Interface DEFINIDA PELO CONSUMIDOR (M4) — o adaptador
// que embrulha o toolCatalogPort do M3 é estruturalmente compatível.
export interface ToolCatalogPort {
  getAvailableScopes(toolId: string): Promise<string[] | null>;
  assertScopesAvailable(toolId: string, requested: string[]): Promise<void>;
}

// Compilação/validação de JSON Schema (impl ajv em infra; fake nos testes).
export type ValidationResult = { valid: boolean; errors: string[] };
export interface SchemaValidatorPort {
  validateSchema(schema: unknown): ValidationResult; // o config_schema compila?
  validateData(schema: unknown, data: unknown): ValidationResult; // usado por M5
}

// Runtimes com handler resolúvel (registo do M7). Fn simples, sem port.
export type RuntimeRegistry = (runtime: string) => boolean;

// Estado de publicação. O schema atual NÃO tem coluna `published` — este port é
// o seam honesto; a impl Drizzle usa SQL cru e EXIGE a migração (ver integração).
export interface PublicationPort {
  isPublished(taskId: string): Promise<boolean>;
  setPublished(taskId: string, value: boolean): Promise<void>;
}

/* --- Exposto (o M5 consome) ----------------------------------------------- */

export type TaskContext = {
  id: string;
  orgId: string;
  type: TaskType;
  published: boolean;
  configSchema: JsonSchema | null;
};

export type TaskSummary = {
  id: string;
  name: string;
  type: TaskType;
  runtime: string;
  published: boolean;
  configSchema: JsonSchema | null;
};

export interface TaskCatalogPort {
  // Contexto mínimo para o M5 criar/validar uma Assignment. null se não existir.
  getTaskContext(taskId: string): Promise<TaskContext | null>;
  // required_tools da Task (para a prontidão do M5).
  getRequiredTools(taskId: string): Promise<Array<{ toolId: string; scopes: string[] }>>;
  // Tarefas da org (para a matriz do M5). Sem sessão (contexto de sistema).
  listTasks(orgId: string): Promise<TaskSummary[]>;
}
