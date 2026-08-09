import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/* -------------------------------------------------------------------------- */
/*  Enums                                                                      */
/* -------------------------------------------------------------------------- */

export const userRole = pgEnum("user_role", ["super_admin", "worker"]);

// Modo de execução da tarefa.
//  - automation: corre sozinha (agendada ou por evento), output para o trabalhador
//  - assistant:  o trabalhador aciona, dá input, recebe um artefacto
export const taskType = pgEnum("task_type", ["automation", "assistant"]);

// Como uma ferramenta se autentica para um trabalhador.
export const toolAuthType = pgEnum("tool_auth_type", ["oauth", "api_key", "none"]);

// Estado de uma conexão de ferramenta de um trabalhador.
export const connectionStatus = pgEnum("connection_status", [
  "pending", // requisito criado, ainda não autenticado
  "connected",
  "expired", // token expirou; precisa de re-autorização
  "revoked", // trabalhador revogou o acesso do lado do provider
]);

export const runStatus = pgEnum("run_status", [
  "queued",
  "running",
  "success",
  "error",
]);

export const runTrigger = pgEnum("run_trigger", ["manual", "schedule", "webhook"]);

// Camada de storage de um artefacto.
//  - work_document: entregável real (input ou output), vai para a cloud do trabalhador
//  - intermediate:  ficheiro de trabalho descartável, fica no store efémero com TTL
export const artifactTier = pgEnum("artifact_tier", ["work_document", "intermediate"]);

export const artifactLocation = pgEnum("artifact_location", [
  "worker_cloud",
  "ephemeral",
]);

export const archiveStatus = pgEnum("archive_status", [
  "pending",
  "running",
  "success",
  "error",
]);

/* -------------------------------------------------------------------------- */
/*  Tenant                                                                     */
/* -------------------------------------------------------------------------- */

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugUq: uniqueIndex("organizations_slug_uq").on(t.slug),
  }),
);

/* -------------------------------------------------------------------------- */
/*  Utilizadores (super_admin e worker vivem na mesma tabela)                  */
/* -------------------------------------------------------------------------- */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    role: userRole("role").notNull().default("worker"),
    // Ponteiro (não parsing) para o documento de mapeamento que fundamentou
    // a configuração deste trabalhador. Rastreabilidade, não uma FK real.
    mappingRef: text("mapping_ref"),
    // Preferências pessoais (jsonb livre; normalizado pelo módulo `preferences`).
    // Hoje só o fundo do painel; cresce por chave, sem novas migrações.
    preferences: jsonb("preferences").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailUq: uniqueIndex("users_email_uq").on(t.email),
    orgIdx: index("users_org_idx").on(t.organizationId),
  }),
);

/* -------------------------------------------------------------------------- */
/*  Áreas funcionais                                                           */
/* -------------------------------------------------------------------------- */

export const functionalAreas = pgTable(
  "functional_areas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("functional_areas_org_idx").on(t.organizationId),
  }),
);

/* -------------------------------------------------------------------------- */
/*  Catálogo de ferramentas (GLOBAL — não pertence a nenhuma organização)      */
/* -------------------------------------------------------------------------- */

export const tools = pgTable(
  "tools",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(), // "google", "dropbox", ...
    name: text("name").notNull(),
    authType: toolAuthType("auth_type").notNull(),
    // Scopes que a ferramenta disponibiliza (fonte para validar required_tools).
    availableScopes: jsonb("available_scopes").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    keyUq: uniqueIndex("tools_key_uq").on(t.key),
  }),
);

/* -------------------------------------------------------------------------- */
/*  Tarefas (catálogo / definição)                                            */
/* -------------------------------------------------------------------------- */

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    areaId: uuid("area_id").references(() => functionalAreas.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    description: text("description"),
    type: taskType("type").notNull(),
    // Identificador do handler que executa esta tarefa.
    runtime: text("runtime").notNull(),
    // Schema dos inputs (usado para gerar o formulário das assistidas).
    configSchema: jsonb("config_schema").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("tasks_org_idx").on(t.organizationId),
    areaIdx: index("tasks_area_idx").on(t.areaId),
  }),
);

/* -------------------------------------------------------------------------- */
/*  Ferramentas exigidas por tarefa (ponte task <-> tool, com scopes)          */
/*  É o que o toggle verifica contra as worker_connections do trabalhador.     */
/* -------------------------------------------------------------------------- */

export const taskRequiredTools = pgTable(
  "task_required_tools",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    toolId: uuid("tool_id")
      .notNull()
      // Restrito: não se apaga uma ferramenta do catálogo se tarefas a exigem.
      .references(() => tools.id, { onDelete: "restrict" }),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
  },
  (t) => ({
    taskToolUq: uniqueIndex("task_required_tools_task_tool_uq").on(t.taskId, t.toolId),
    taskIdx: index("task_required_tools_task_idx").on(t.taskId),
  }),
);

/* -------------------------------------------------------------------------- */
/*  Conexões de ferramentas por trabalhador (inclui a cloud de storage)        */
/* -------------------------------------------------------------------------- */

export const workerConnections = pgTable(
  "worker_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workerId: uuid("worker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    toolId: uuid("tool_id")
      .notNull()
      .references(() => tools.id, { onDelete: "restrict" }),
    // Scopes que o trabalhador já consentiu (pode ser subconjunto do exigido).
    grantedScopes: jsonb("granted_scopes").$type<string[]>().notNull().default([]),
    // Refresh token / credenciais SEMPRE encriptadas ao nível da app.
    credentialsEncrypted: text("credentials_encrypted"),
    // Referência à pasta raiz quando a ferramenta é usada como storage.
    rootFolderRef: text("root_folder_ref"),
    status: connectionStatus("status").notNull().default("pending"),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Uma conexão por (trabalhador, ferramenta): o Google é UMA conexão,
    // com a união dos scopes de todas as tarefas dele.
    workerToolUq: uniqueIndex("worker_connections_worker_tool_uq").on(
      t.workerId,
      t.toolId,
    ),
    workerIdx: index("worker_connections_worker_idx").on(t.workerId),
    statusIdx: index("worker_connections_status_idx").on(t.status),
  }),
);

/* -------------------------------------------------------------------------- */
/*  Atribuição / toggle (a ligação trabalhador <-> tarefa; o teu painel)       */
/* -------------------------------------------------------------------------- */

export const taskAssignments = pgTable(
  "task_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    workerId: uuid("worker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    // Flag de comportamento do admin (NÃO é config de formulário): quando true,
    // as gerações assistidas de escrita deste worker usam o .md de estilo dele.
    useWritingStyle: boolean("use_writing_style").notNull().default(false),
    // Só relevante para automáticas: cron ou identificador de evento.
    schedule: text("schedule"),
    // Como o output chega ao trabalhador (inbox, email, ...).
    delivery: text("delivery"),
    // Overrides de configuração por trabalhador.
    config: jsonb("config").$type<Record<string, unknown>>(),
    // Ordem do cartão no board do trabalhador (nulls = por ordenar → fim).
    position: integer("position"),
    enabledBy: uuid("enabled_by").references(() => users.id, { onDelete: "set null" }),
    enabledAt: timestamp("enabled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskWorkerUq: uniqueIndex("task_assignments_task_worker_uq").on(
      t.taskId,
      t.workerId,
    ),
    workerEnabledIdx: index("task_assignments_worker_enabled_idx").on(
      t.workerId,
      t.enabled,
    ),
  }),
);

/* -------------------------------------------------------------------------- */
/*  Execuções                                                                  */
/* -------------------------------------------------------------------------- */

export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => taskAssignments.id, { onDelete: "cascade" }),
    status: runStatus("status").notNull().default("queued"),
    trigger: runTrigger("trigger").notNull(),
    // Chave de idempotência para não duplicar efeitos (ex.: enviar 2x).
    idempotencyKey: text("idempotency_key"),
    input: jsonb("input").$type<Record<string, unknown>>(),
    output: jsonb("output").$type<Record<string, unknown>>(),
    error: text("error"),
    triggeredBy: uuid("triggered_by").references(() => users.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    assignmentIdx: index("runs_assignment_idx").on(t.assignmentId),
    statusIdx: index("runs_status_idx").on(t.status),
    idempotencyUq: uniqueIndex("runs_idempotency_uq").on(t.idempotencyKey),
  }),
);

/* -------------------------------------------------------------------------- */
/*  Artefactos das execuções (3 tiers de storage)                              */
/* -------------------------------------------------------------------------- */

export const runArtifacts = pgTable(
  "run_artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    mimeType: text("mime_type"),
    tier: artifactTier("tier").notNull(),
    location: artifactLocation("location").notNull(),
    // Referência ao ficheiro: id na cloud do trabalhador, ou chave no store efémero.
    storageRef: text("storage_ref").notNull(),
    // Desacopla expiração de arquivo: o cleanup só apaga intermédios já arquivados.
    archived: boolean("archived").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    runIdx: index("run_artifacts_run_idx").on(t.runId),
    // Suporta o cleanup: "intermédios expirados e já arquivados".
    tierArchivedIdx: index("run_artifacts_tier_archived_idx").on(t.tier, t.archived),
  }),
);

/* -------------------------------------------------------------------------- */
/*  Arquivo mensal (idempotência do job + ponteiro para a pasta)               */
/* -------------------------------------------------------------------------- */

export const monthlyArchives = pgTable(
  "monthly_archives",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workerId: uuid("worker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    period: text("period").notNull(), // "2026-07"
    status: archiveStatus("status").notNull().default("pending"),
    archiveFolderRef: text("archive_folder_ref"),
    manifest: jsonb("manifest").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Um arquivo por (trabalhador, período): garante idempotência.
    workerPeriodUq: uniqueIndex("monthly_archives_worker_period_uq").on(
      t.workerId,
      t.period,
    ),
  }),
);

/* -------------------------------------------------------------------------- */
/*  Auditoria (quem ativou/desativou o quê e quando)                           */
/* -------------------------------------------------------------------------- */

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(), // "assignment.enabled", ...
    entity: text("entity").notNull(), // "task_assignment", ...
    entityId: uuid("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    actorIdx: index("audit_logs_actor_idx").on(t.actorId),
    entityIdx: index("audit_logs_entity_idx").on(t.entity, t.entityId),
  }),
);

/* -------------------------------------------------------------------------- */
/*  Registo de IA — providers e binding por capacidade (ao nível da org)       */
/*                                                                             */
/*  ai_providers: uma chave de API por (org, provider), SEMPRE cifrada ao      */
/*    nível da app (mesmo cipher/credsCodec do M6). Só o super-utilizador      */
/*    escreve; a chave é write-only na UI (nunca regressa ao cliente).         */
/*  ai_bindings:  liga uma capability (ex.: "email.summary") a um provider +   */
/*    model, um por (org, capability). O resolver faz                          */
/*    (org, capability) -> ai_bindings -> ai_providers (chave decifrada).      */
/*  provider/capability são text — extensíveis sem migração de enum (como      */
/*  tools.key). O binding referencia o provider por string (mesma org); um     */
/*  binding órfão (provider removido) não resolve -> fallback no consumidor.    */
/* -------------------------------------------------------------------------- */

export const aiProviders = pgTable(
  "ai_providers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // "claude", "mistral", ...
    // Chave de API SEMPRE cifrada ao nível da app (credsCodec do M6).
    // Nullable para permitir criar e definir a chave depois (write-only na UI).
    apiKeyEncrypted: text("api_key_encrypted"),
    // Modelo por defeito quando o binding não fixa um (ex.: "claude-sonnet-4-5").
    defaultModel: text("default_model"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Uma configuração por (org, provider).
    orgProviderUq: uniqueIndex("ai_providers_org_provider_uq").on(
      t.organizationId,
      t.provider,
    ),
    orgIdx: index("ai_providers_org_idx").on(t.organizationId),
  }),
);

export const aiBindings = pgTable(
  "ai_bindings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    capability: text("capability").notNull(), // "email.summary", "ocr", "assistant.generic", ...
    provider: text("provider").notNull(), // aponta (logicamente) a ai_providers.provider da mesma org
    // Override do modelo para esta capacidade; null usa o default_model do provider.
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Um modelo por (org, capability): binding ao nível da org (decisão fechada).
    orgCapabilityUq: uniqueIndex("ai_bindings_org_capability_uq").on(
      t.organizationId,
      t.capability,
    ),
    orgIdx: index("ai_bindings_org_idx").on(t.organizationId),
  }),
);

/* -------------------------------------------------------------------------- */
/*  Relations (para queries tipadas com o query builder do Drizzle)            */
/* -------------------------------------------------------------------------- */

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  areas: many(functionalAreas),
  tasks: many(tasks),
  aiProviders: many(aiProviders),
  aiBindings: many(aiBindings),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  connections: many(workerConnections),
  assignments: many(taskAssignments),
  archives: many(monthlyArchives),
}));

export const functionalAreasRelations = relations(functionalAreas, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [functionalAreas.organizationId],
    references: [organizations.id],
  }),
  tasks: many(tasks),
}));

export const toolsRelations = relations(tools, ({ many }) => ({
  requiredBy: many(taskRequiredTools),
  connections: many(workerConnections),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [tasks.organizationId],
    references: [organizations.id],
  }),
  area: one(functionalAreas, {
    fields: [tasks.areaId],
    references: [functionalAreas.id],
  }),
  requiredTools: many(taskRequiredTools),
  assignments: many(taskAssignments),
}));

export const taskRequiredToolsRelations = relations(taskRequiredTools, ({ one }) => ({
  task: one(tasks, { fields: [taskRequiredTools.taskId], references: [tasks.id] }),
  tool: one(tools, { fields: [taskRequiredTools.toolId], references: [tools.id] }),
}));

export const workerConnectionsRelations = relations(workerConnections, ({ one }) => ({
  worker: one(users, {
    fields: [workerConnections.workerId],
    references: [users.id],
  }),
  tool: one(tools, { fields: [workerConnections.toolId], references: [tools.id] }),
}));

export const taskAssignmentsRelations = relations(taskAssignments, ({ one, many }) => ({
  task: one(tasks, { fields: [taskAssignments.taskId], references: [tasks.id] }),
  worker: one(users, {
    fields: [taskAssignments.workerId],
    references: [users.id],
  }),
  runs: many(runs),
}));

export const runsRelations = relations(runs, ({ one, many }) => ({
  assignment: one(taskAssignments, {
    fields: [runs.assignmentId],
    references: [taskAssignments.id],
  }),
  artifacts: many(runArtifacts),
}));

export const runArtifactsRelations = relations(runArtifacts, ({ one }) => ({
  run: one(runs, { fields: [runArtifacts.runId], references: [runs.id] }),
}));

export const monthlyArchivesRelations = relations(monthlyArchives, ({ one }) => ({
  worker: one(users, {
    fields: [monthlyArchives.workerId],
    references: [users.id],
  }),
}));

export const aiProvidersRelations = relations(aiProviders, ({ one }) => ({
  organization: one(organizations, {
    fields: [aiProviders.organizationId],
    references: [organizations.id],
  }),
}));

export const aiBindingsRelations = relations(aiBindings, ({ one }) => ({
  organization: one(organizations, {
    fields: [aiBindings.organizationId],
    references: [organizations.id],
  }),
}));

/* -------------------------------------------------------------------------- */
/*  Estilos de escrita por trabalhador (o .md de estilo — texto opaco)         */
/*  1 linha por worker, substituível. O conteúdo vive na BD (não no Drive).    */
/* -------------------------------------------------------------------------- */

export const writingStyles = pgTable(
  "writing_styles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workerId: uuid("worker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // O .md carregado, tal e qual. Sem parsing — texto de confiança.
    contentMd: text("content_md").notNull(),
    sourceFilename: text("source_filename"),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Um estilo por trabalhador (upsert por worker_id).
    workerUq: uniqueIndex("writing_styles_worker_uq").on(t.workerId),
  }),
);

export const writingStylesRelations = relations(writingStyles, ({ one }) => ({
  worker: one(users, { fields: [writingStyles.workerId], references: [users.id] }),
}));
