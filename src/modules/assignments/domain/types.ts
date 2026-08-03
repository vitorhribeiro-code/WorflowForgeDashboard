// -------------------------------------------------------------------------- //
//  Tipos puros do M5 (Task_Assignment: a ligação trabalhador <-> tarefa).      //
// -------------------------------------------------------------------------- //

export type TaskAssignment = {
  id: string;
  taskId: string;
  workerId: string;
  enabled: boolean;
  schedule: string | null; // cron — só relevante para type=automation
  delivery: string | null; // como o output chega (inbox, email, ...)
  config: Record<string, unknown> | null;
  position: number | null; // ordem do cartão no board do trabalhador
  enabledBy: string | null;
  enabledAt: Date | null;
  createdAt: Date;
};

export type NewAssignment = {
  taskId: string;
  workerId: string;
  config?: Record<string, unknown> | null;
  schedule?: string | null;
  delivery?: string | null;
};

// Ferramenta exigida por uma Task (espelha o tipo do M4).
export type RequiredTool = {
  toolId: string;
  scopes: string[];
};

/* --- Prontidão / elegibilidade para ativar -------------------------------- */

export type MissingReason = "no_connection" | "not_connected" | "missing_scopes";

export type MissingDep = {
  toolId: string;
  reason: MissingReason;
  missingScopes?: string[];
};

// Resultado da verificação de conexões (vem do M6 via port).
export type ConnectionReadiness = {
  ready: boolean;
  missing: MissingDep[];
};

// Fotografia completa da prontidão de uma Assignment (para a matriz da UI).
export type AssignmentReadiness = {
  published: boolean; // Task publicada?
  configValid: boolean; // config ⊆ config_schema vigente?
  connections: ConnectionReadiness; // conexões suficientes?
  eligible: boolean; // pode ativar?
};
