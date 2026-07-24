// Escrita de auditoria (append-only). JÁ EXISTE no repo real e é usada por M6–M9.
// Incluído aqui só para contexto; a impl Drizzle vive em `lib/audit.drizzle.ts`.
// O M10 acrescenta a LEITURA (consulta) sobre a MESMA tabela `audit_logs`.
export type AuditEvent = {
  actorId: string | null;
  action: string; // "assignment.enabled", ...
  entity: string; // "task_assignment", ...
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

export type AuditPort = {
  // A falha de auditoria alerta mas NÃO reverte a ação principal (regra §6).
  record(ev: AuditEvent): Promise<void>;
};

// Alias usado por M6/M8/M9 (mesma forma que AuditEvent).
export type AuditEntry = AuditEvent;
