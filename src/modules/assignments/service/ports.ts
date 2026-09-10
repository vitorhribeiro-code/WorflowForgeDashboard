import type {
  AssignmentReadiness,
  ConnectionReadiness,
  MissingDep,
  RequiredTool,
} from "../domain/types";
// Tipo puro (sem IO/runtime dep) do módulo de tasks: a view projeta o cartão
// tal como projeta nome/runtime/tipo. Import type-only → não cruza a fronteira
// de DI (as tasks continuam a chegar por `taskDeps`, não por import direto).
import type { CardStatus, TaskCard } from "@/modules/tasks/domain/card";

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
  card: TaskCard | null;
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

export type MatrixTask = {
  id: string;
  name: string;
  type: TaskType;
  runtime: string;
  published: boolean;
  // Estado do CARTÃO (ortogonal ao `published`): `null` = sem cartão, `"draft"`
  // = em rascunho (worker vê o derivado), `"ready"` = validado (worker vê a
  // apresentação autoral). Alimenta os chips de ciclo de vida do cabeçalho.
  cardStatus: CardStatus | null;
};

// O que o serviço `matrix()` produz — SEM áreas. A junção com as áreas
// (task_areas / user_areas) é feita na ROTA (slice 3b.1), para não injetar o
// membership no assignmentService (evita tocar nos DOIS composition roots).
export type BaseAssignmentMatrix = {
  tasks: MatrixTask[];
  workers: WorkerSummary[];
  cells: MatrixCell[];
};

// Tipo de wire consumido pela UI: cada task e cada worker enriquecidos com as
// áreas a que pertencem/estão disponíveis. A célula é acionável sse
// áreas(worker) ∩ áreas(task) ≠ ∅ (calculado no cliente).
export type AssignmentMatrix = {
  tasks: Array<MatrixTask & { areaIds: string[] }>;
  workers: Array<WorkerSummary & { areaIds: string[] }>;
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
  // Apresentação do cartão (v42). null → sem cartão composto (cai no derivado).
  // O trabalhador só VÊ a apresentação quando `card.status === "ready"`; drafts
  // são privados do super-utilizador (o render aplica esse gate).
  card: TaskCard | null;
};
