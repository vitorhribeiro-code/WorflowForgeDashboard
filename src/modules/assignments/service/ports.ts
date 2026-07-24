import type { ConnectionReadiness, RequiredTool } from "../domain/types";

export type { ConnectionReadiness } from "../domain/types";

/* --- Consumidos (injetados) ----------------------------------------------- */

export type TaskType = "automation" | "assistant";

export type TaskContext = {
  id: string;
  orgId: string;
  type: TaskType;
  published: boolean;
  configSchema: Record<string, unknown> | null;
};

// M4: contexto da Task + as suas required_tools. Interface do CONSUMIDOR.
export interface TaskDepsPort {
  getTaskContext(taskId: string): Promise<TaskContext | null>;
  getRequiredTools(taskId: string): Promise<RequiredTool[]>;
}

// M6: prontidão de conexões do trabalhador para um conjunto de required_tools.
export interface ReadinessPort {
  check(workerId: string, required: RequiredTool[]): Promise<ConnectionReadiness>;
}

// ajv: valida a config contra o config_schema vigente.
export type ValidationResult = { valid: boolean; errors: string[] };
export interface SchemaValidatorPort {
  validateData(schema: unknown, data: unknown): ValidationResult;
}

// M2/users: resolve a org de um trabalhador (validar tenant).
export interface WorkerDirectoryPort {
  getWorkerOrg(workerId: string): Promise<string | null>;
}

/* --- Expostos ------------------------------------------------------------- */

// M4 (despublicar) e M6 (revogar/expirar) chamam isto para propagar a suspensão.
export interface AssignmentSuspenderPort {
  suspendForTask(taskId: string): Promise<number>; // devolve nº suspensas
  suspendForWorkerTool(workerId: string, toolId: string): Promise<number>;
}

// M7: leitura mínima para validar antes de criar um Run.
export type AssignmentForRun = {
  id: string;
  taskId: string;
  workerId: string;
  enabled: boolean;
  schedule: string | null;
  config: Record<string, unknown> | null;
};
export interface AssignmentReadPort {
  getAssignmentForRun(assignmentId: string): Promise<AssignmentForRun | null>;
}
