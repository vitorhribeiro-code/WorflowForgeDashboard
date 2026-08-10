import type {
  AssignmentReadiness,
  ConnectionReadiness,
  MissingDep,
  RequiredTool,
} from "../domain/types";

export type { AssignmentReadiness, ConnectionReadiness } from "../domain/types";

/* --- Consumidos (injetados) ----------------------------------------------- */

export type TaskType = "automation" | "assistant";

export type TaskContext = {
  id: string;
  orgId: string;
  type: TaskType;
  published: boolean;
  configSchema: Record<string, unknown> | null;
};

// Resumo de uma Task para a matriz (linhas da grelha).
export type TaskSummary = {
  id: string;
  name: string;
  type: TaskType;
  runtime: string;
  published: boolean;
  configSchema: Record<string, unknown> | null;
};

// M4: contexto da Task + as suas required_tools. Interface do CONSUMIDOR.
export interface TaskDepsPort {
  getTaskContext(taskId: string): Promise<TaskContext | null>;
  getRequiredTools(taskId: string): Promise<RequiredTool[]>;
  listTasks(orgId: string): Promise<TaskSummary[]>;
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

// Trabalhador (coluna da matriz).
export type WorkerSummary = { id: string; email: string };

// M2/users: resolve a org de um trabalhador (validar tenant) + lista workers.
export interface WorkerDirectoryPort {
  getWorkerOrg(workerId: string): Promise<string | null>;
  listWorkers(orgId: string): Promise<WorkerSummary[]>;
}

// §5.2: presença do estilo de escrita (.md) de um trabalhador. Só um booleano —
// nunca expõe o conteúdo. Alimenta o selo do painel («a usar o teu estilo» vs
// «estilo pendente») sem duplicar a leitura do .md que já vive no writing-styles.
export interface WritingStylePresencePort {
  hasStyle(workerId: string): Promise<boolean>;
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

/* --- Matriz (Task × Trabalhador) para a consola ---------------------------- */

export type MatrixCell = {
  taskId: string;
  workerId: string;
  assignmentId: string | null; // null = ainda não atribuída
  enabled: boolean;
  useWritingStyle: boolean; // só faz sentido em tarefas assistant.writing
  schedule: string | null; // cron da atribuição (só relevante em automáticas)
  readiness: AssignmentReadiness;
};

export type AssignmentMatrix = {
  tasks: Array<{ id: string; name: string; type: TaskType; runtime: string; published: boolean }>;
  workers: WorkerSummary[];
  cells: MatrixCell[];
};

/* --- Vista worker-facing (painel "As minhas tarefas") --------------------- */

// Uma atribuição do próprio trabalhador, com o mínimo para a UI decidir o que
// mostrar: nome/tipo da Task, se está ativa, o schedule (automáticas) e a
// prontidão (para sinalizar conexões em falta sem depender da consola do admin).
export type WorkerAssignmentView = {
  assignmentId: string;
  taskId: string;
  taskName: string;
  taskType: TaskType;
  taskRuntime: string;
  enabled: boolean;
  schedule: string | null;
  ready: boolean;
  missing: MissingDep[];
  // §5.2 (selo do estilo de escrita): dois sinais independentes.
  //  - useWritingStyle: o admin ligou «usar estilo» NESTA atribuição (por-atrib.)
  //  - hasWritingStyle: existe um .md de estilo para este trabalhador (por-worker)
  // A UI combina-os: ambos → «a usar o teu estilo»; só o 1.º → «estilo pendente».
  useWritingStyle: boolean;
  hasWritingStyle: boolean;
};
