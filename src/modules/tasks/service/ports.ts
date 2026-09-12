import type { JsonSchema, TaskType } from "../domain/types";
import type { TaskCard } from "../domain/card";
import type { CardCompleteFn } from "../domain/card-generation";

/* --- Consumidos (injetados no container) ---------------------------------- */

// Porto ESTREITO para a geração do cartão (v43). Desacopla o M4 do módulo `ai`:
// dado o org, devolve uma completude de LLM (a capacidade "card.compose" já
// resolvida) ou null quando não há IA configurada (o serviço faz 422 explícito).
// A composição adapta o `LlmResolver` real a esta forma; os testes passam um fake.
export interface CardLlmPort {
  resolve(orgId: string): Promise<CardLlmHandle | null>;
}

export type CardLlmHandle = {
  complete: CardCompleteFn;
  provider: string;
  model: string;
};

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

// Um runtime é "conhecido" (associável a uma Task) quando existe como
// capacidade — built-in (handler em código) OU generated (catálogo na BD). Por
// isso o predicado é ASSÍNCRONO (o catálogo vive na BD e cresce em runtime).
export type RuntimeRegistry = (runtime: string) => Promise<boolean>;

// Catálogo de runtimes na BD (v50). Interface DEFINIDA PELO CONSUMIDOR; a impl
// Drizzle vive em data/runtime-catalog.repository.ts; os testes passam um fake.
// GLOBAL (como as tools): um runtime serve tarefas de qualquer utilizador.
export type RuntimeCatalogEntry = {
  key: string;
  label: string;
  taskType: TaskType;
  kind: "builtin" | "generic";
};
export interface RuntimeCatalog {
  // O runtime existe no catálogo? (resiliente: erro/tabela ausente → false,
  // para os built-in continuarem a valer pelo array mesmo antes da migração.)
  has(key: string): Promise<boolean>;
  // Listar o catálogo (para a UI/dropdown e futuras associações).
  list(): Promise<RuntimeCatalogEntry[]>;
}

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
  card: TaskCard | null;
};

export interface TaskCatalogPort {
  // Contexto mínimo para o M5 criar/validar uma Assignment. null se não existir.
  getTaskContext(taskId: string): Promise<TaskContext | null>;
  // required_tools da Task (para a prontidão do M5).
  getRequiredTools(taskId: string): Promise<Array<{ toolId: string; scopes: string[] }>>;
  // Tarefas da org (para a matriz do M5). Sem sessão (contexto de sistema).
  listTasks(orgId: string): Promise<TaskSummary[]>;
}
